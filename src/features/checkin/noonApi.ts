import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchAll } from "../../lib/fetchAll";
import { must, supabase } from "../../lib/supabase";
import type {
  CheckinEvent, NoonDay, NoonDayRow, NoonItem, NoonLeaveResult, NoonMark, NoonSetResult, NoonStudentMark, NoonSummary,
  NoonTimelineEntry, NoonToday,
} from "../../lib/types";
import { callRpc, checkinKeys, isRejected } from "./api";
import { judge } from "./logic/noon";

const ITEM_COLS = "id,class_id,name,deadline,sort_order,archived_at";
const DAY_COLS = "id,class_id,date,status,settled_at,settled_version,settled_summary,scheduled_archive_at,archived_at,archived_by,final_summary,revised_at";
const DAY_WITH_ROWS = `${DAY_COLS},`
  + "noon_day_items(id,day_id,template_id,name,deadline,sort_order),"
  + "noon_day_students(day_id,student_id,student_no,name_zh,on_leave,removed_at),"
  + "noon_marks(day_item_id,student_id,day_id,result,done_at,source)";

export const noonKeys = {
  all: ["checkin", "noon"],
  today: (classId: string) => ["checkin", "noon", "today", classId],
  items: (classId: string) => ["checkin", "noon", "items", classId],
  day: (classId: string, date: string) => ["checkin", "noon", "day", classId, date],
  days: (classId: string) => ["checkin", "noon", "days", classId],
  studentEvents: (studentId: string) => ["checkin", "noon", "student-events", studentId],
  studentMarks: (studentId: string, date: string) => ["checkin", "noon", "student-marks", studentId, date],
};

// ───────────── 讀取 ─────────────

/** 伺服器時間、今天的日期、是否已過 17:00、今天紀錄的狀態與版本。不寫入。每 60 秒重讀，順便校正時鐘（設計 §7.4） */
export function useNoonToday(classId: string) {
  return useQuery({
    queryKey: noonKeys.today(classId),
    refetchInterval: 60_000,
    queryFn: async () => (await must(supabase.rpc("noon_today", { p_class_id: classId }))) as NoonToday,
  });
}

/** 固定任務的範本（含已停用的，畫面自己篩） */
export function useNoonItems(classId: string) {
  return useQuery({
    queryKey: noonKeys.items(classId),
    queryFn: () => fetchAll<NoonItem>((from, to) => supabase.from("noon_items").select(ITEM_COLS)
      .eq("class_id", classId).order("sort_order").order("id").range(from, to)),
  });
}

/** 某一天的紀錄（任務、名單、全部打卡）；那天沒有紀錄是 null。打卡台傳 live 每 60 秒重讀，讓老師手機上的改動也出現在白板上 */
export function useNoonDay(classId: string, date: string, live = false) {
  return useQuery({
    queryKey: noonKeys.day(classId, date),
    enabled: !!classId && !!date,
    refetchInterval: live ? 60_000 : false,
    queryFn: async (): Promise<NoonDay | null> => {
      const { data, error } = await supabase.from("noon_days").select(DAY_WITH_ROWS)
        .eq("class_id", classId).eq("date", date).returns<NoonDay>().maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** 已封存的日子（不含打卡明細），新到舊 */
export function useNoonDays(classId: string) {
  return useQuery({
    queryKey: noonKeys.days(classId),
    queryFn: () => fetchAll<NoonDayRow>((from, to) => supabase.from("noon_days").select(DAY_COLS)
      .eq("class_id", classId).eq("status", "archived").order("date", { ascending: false }).order("id").range(from, to)),
  });
}

/** 學生中午的完整操作歷程，新到舊（series noon；一般任務的歷程在 api.ts 的 useStudentEvents） */
export function useNoonStudentEvents(studentId: string) {
  return useQuery({
    queryKey: noonKeys.studentEvents(studentId),
    enabled: !!studentId,
    queryFn: () => fetchAll<CheckinEvent>((from, to) => supabase.from("checkin_events")
      .select("id,action,actor,at,task_id,day_id,day_item_id,next,noon_day_items(name),noon_days(date)")
      .eq("student_id", studentId).eq("series", "noon").order("id", { ascending: false }).range(from, to).returns<CheckinEvent[]>()),
  });
}

/** 學生某一天各項任務的打卡（含任務快照），依任務順序 */
export function useNoonStudentMarks(studentId: string, date: string) {
  return useQuery({
    queryKey: noonKeys.studentMarks(studentId, date),
    enabled: !!studentId && !!date,
    queryFn: async () => {
      const rows = await fetchAll<NoonStudentMark>((from, to) => supabase.from("noon_marks")
        .select("day_item_id,student_id,day_id,result,done_at,source,noon_day_items(name,deadline,sort_order),noon_days!inner(date,status)")
        .eq("student_id", studentId).eq("noon_days.date", date).order("day_item_id").range(from, to).returns<NoonStudentMark[]>());
      return rows.sort((a, b) => a.noon_day_items.sort_order - b.noon_day_items.sort_order);
    },
  });
}

/** 中午頁面載入時補做 17:00 封存（排程失敗時的後備，設計 §6.4）：每個班級只呼叫一次，有處理的日子就重讀 */
export function useNoonArchiveCatchup(classId: string) {
  const qc = useQueryClient();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!classId || done.current === classId) return;
    done.current = classId;
    supabase.rpc("noon_archive_due_mine").then(({ data, error }) => {
      if (!error && Number(data) > 0) qc.invalidateQueries({ queryKey: noonKeys.all });
    });
  }, [classId, qc]);
}

// ───────────── 寫入 ─────────────

type CellVars = { templateId: string; studentId: string };
type CellState = Pick<NoonMark, "result" | "done_at" | "source">;

function findMark(day: NoonDay, v: CellVars): NoonMark | undefined {
  const dayItemId = day.noon_day_items.find((i) => i.template_id === v.templateId)?.id;
  return dayItemId ? day.noon_marks.find((m) => m.day_item_id === dayItemId && m.student_id === v.studentId) : undefined;
}

/** 只改快取裡的一格，不整份重讀，避免連續點名時畫面跳動 */
function patchMark(qc: QueryClient, classId: string, date: string, v: CellVars, patch: CellState) {
  qc.setQueryData<NoonDay | null>(noonKeys.day(classId, date), (day) => {
    const dayItemId = day?.noon_day_items.find((i) => i.template_id === v.templateId)?.id;
    if (!day || !dayItemId) return day;
    return {
      ...day,
      noon_marks: day.noon_marks.map((m) => (m.day_item_id === dayItemId && m.student_id === v.studentId ? { ...m, ...patch } : m)),
    };
  });
}

/** 第一次寫入會在伺服器建立當天的紀錄，快取裡沒有 day 可以 patch：整份重讀（today 的 day_id 也要更新） */
function refreshDay(qc: QueryClient, classId: string, date: string) {
  qc.invalidateQueries({ queryKey: noonKeys.day(classId, date) });
  qc.invalidateQueries({ queryKey: noonKeys.today(classId) });
}

const cellOf = (r: NoonSetResult): CellState => ({ result: r.result, done_at: r.done_at, source: r.source });

/**
 * 打卡或取消：送的是「設為完成／設為未完成」，重送也不會變成相反的結果（設計 §3.3）。
 * at 由呼叫端用伺服器校正後的時間給（Date.now() + clockOffset），樂觀更新用它判定準時或逾時，成功後以伺服器的結果為準；
 * 被拒絕或網路錯誤就還原這一格。今天還沒有紀錄（快取裡沒有 day）時不做樂觀更新，成功後重讀
 */
export function useNoonSetDone(classId: string, date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CellVars & { done: boolean; at: Date }) =>
      callRpc<NoonSetResult>("noon_set_done", {
        p_class_id: classId, p_template_id: v.templateId, p_student_id: v.studentId, p_done: v.done,
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: noonKeys.day(classId, date) });
      const day = qc.getQueryData<NoonDay | null>(noonKeys.day(classId, date));
      const mark = day ? findMark(day, v) : undefined;
      if (!day || !mark) return { prev: undefined };
      const item = day.noon_day_items.find((i) => i.id === mark.day_item_id)!;
      patchMark(qc, classId, date, v, v.done
        ? { result: judge(item.deadline, v.at), done_at: v.at.toISOString(), source: "student" }
        : { result: "pending", done_at: null, source: null });
      return { prev: { result: mark.result, done_at: mark.done_at, source: mark.source } as CellState };
    },
    onSuccess: (r, v, ctx) => {
      if (isRejected(r)) {
        if (ctx?.prev) patchMark(qc, classId, date, v, ctx.prev);
        refreshDay(qc, classId, date);
      } else if (ctx?.prev) {
        patchMark(qc, classId, date, v, cellOf(r));
      } else {
        refreshDay(qc, classId, date);
      }
    },
    onError: (_e, v, ctx) => { if (ctx?.prev) patchMark(qc, classId, date, v, ctx.prev); },
  });
}

/** 老師補登：一律算逾時、來源是老師（設計 §4）。不做樂觀更新，成功後用伺服器的結果更新那一格 */
export function useNoonTeacherFill(classId: string, date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CellVars) =>
      callRpc<NoonSetResult>("noon_teacher_fill", { p_class_id: classId, p_template_id: v.templateId, p_student_id: v.studentId }),
    onSuccess: (r, v) => {
      const day = qc.getQueryData<NoonDay | null>(noonKeys.day(classId, date));
      if (isRejected(r) || !day || !findMark(day, v)) refreshDay(qc, classId, date);
      else patchMark(qc, classId, date, v, cellOf(r));
    },
  });
}

/** 切換某一天的請假（整天為單位）。封存後也可以用，伺服器會重算 final_summary，所以那種情況要重讀 */
export function useNoonSetLeave(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { date: string; studentId: string; onLeave: boolean }) =>
      callRpc<NoonLeaveResult>("noon_set_leave", {
        p_class_id: classId, p_date: v.date, p_student_id: v.studentId, p_on_leave: v.onLeave,
      }),
    onSuccess: (r, v) => {
      const key = noonKeys.day(classId, v.date);
      const day = qc.getQueryData<NoonDay | null>(key);
      const known = !isRejected(r) && day?.noon_day_students.some((s) => s.student_id === v.studentId);
      if (!known) {
        refreshDay(qc, classId, v.date);
        return;
      }
      qc.setQueryData<NoonDay | null>(key, (d) => d && {
        ...d, noon_day_students: d.noon_day_students.map((s) => (s.student_id === v.studentId ? { ...s, on_leave: r.on_leave } : s)),
      });
      if (day!.status === "archived") {
        qc.invalidateQueries({ queryKey: key });
        qc.invalidateQueries({ queryKey: noonKeys.days(classId) });
      }
    },
  });
}

/** 結算今日紀錄：伺服器算出統計寫進 settled_*，回傳統計。之後的打卡會讓 version 大於 settled_version */
export function useNoonSettle(classId: string, date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callRpc<NoonSummary>("noon_settle", { p_class_id: classId }),
    onSettled: () => refreshDay(qc, classId, date),
  });
}

/** 復原這台裝置最近一次的打卡、取消或補登（設計 §6.3）。狀態已被改掉或已鎖定時伺服器會拒絕，不自動重試 */
export function useNoonUndo(classId: string, date: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (v: CellVars & { eventId: number }) => callRpc<NoonSetResult>("checkin_undo", { p_event_id: v.eventId }),
    onSuccess: (r, v) => {
      const day = qc.getQueryData<NoonDay | null>(noonKeys.day(classId, date));
      if (isRejected(r) || !day || !findMark(day, v)) refreshDay(qc, classId, date);
      else patchMark(qc, classId, date, v, cellOf(r));
    },
  });
}

export type NoonItemInput = { id?: string; name: string; deadline: string; sort_order: number; archived_at?: string | null };

/** 儲存固定任務：新增（沒有 id）、改名、改截止時間、改順序、停用（archived_at 設成時間）。修改從下一個新的打卡日生效 */
export function useSaveNoonItems(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: NoonItemInput[]) =>
      must(supabase.from("noon_items").upsert(items.map((i) => ({ class_id: classId, ...i })), { defaultToNull: false })),
    onSettled: () => qc.invalidateQueries({ queryKey: noonKeys.items(classId) }),
  });
}

export function useSaveNoonTimeline(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (timeline: NoonTimelineEntry[]) =>
      must(supabase.from("checkin_settings").upsert({ class_id: classId, noon_timeline: timeline }, { onConflict: "class_id" })),
    onSettled: () => qc.invalidateQueries({ queryKey: checkinKeys.settings(classId) }),
  });
}
