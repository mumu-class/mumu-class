import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchAll } from "../../lib/fetchAll";
import { must, supabase } from "../../lib/supabase";
import type {
  CheckinBatch, CheckinEvent, CheckinMark, CheckinSetResult, CheckinSettings, CheckinStudentMark, CheckinTask, CheckinTaskStat,
} from "../../lib/types";
import { checkinErrorText, isRuleError } from "./logic/errors";

const TASK_COLS = "id,class_id,slot,name,task_date,due_date,note,status,batch_id,archived_at,"
  + "checkin_task_marks(student_id,student_no,name_zh,state,done_at,removed_at)";

export const checkinKeys = {
  all: ["checkin"],
  open: (classId: string) => ["checkin", "open", classId],
  batch: (batchId: string) => ["checkin", "batch", batchId],
  batches: (classId: string) => ["checkin", "batches", classId],
  stats: (classId: string) => ["checkin", "stats", classId],
  studentMarks: (studentId: string) => ["checkin", "student-marks", studentId],
  studentEvents: (studentId: string) => ["checkin", "student-events", studentId],
  settings: (classId: string) => ["checkin", "settings", classId],
};

export type Rejected = { rejected: string };
export const isRejected = (x: unknown): x is Rejected => typeof x === "object" && x !== null && "rejected" in x;

/** 業務規則的拒絕（已封存、狀態已變動…）重試也沒用：回傳 rejected 交給畫面提示，不進 SaveStatus 的重試；網路錯誤才丟出去 */
async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T | Rejected> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (isRuleError(error)) return { rejected: checkinErrorText(error) };
    throw error;
  }
  return data as T;
}

// ───────────── 讀取 ─────────────

/** 進行中的任務（依格子）。打卡台每 60 秒重新讀取，讓老師手機上的改動也出現在白板上；回到前景時 TanStack 會自動重新讀取（設計 §7.4） */
export function useOpenTasks(classId: string, live = false) {
  return useQuery({
    queryKey: checkinKeys.open(classId),
    refetchInterval: live ? 60_000 : false,
    queryFn: () => must(supabase.from("checkin_tasks").select(TASK_COLS)
      .eq("class_id", classId).eq("status", "open").order("slot").returns<CheckinTask[]>()),
  });
}

/** 某一次封存的任務（最多 4 項） */
export function useBatchTasks(batchId: string | null) {
  return useQuery({
    queryKey: checkinKeys.batch(batchId ?? ""),
    enabled: !!batchId,
    queryFn: () => must(supabase.from("checkin_tasks").select(TASK_COLS)
      .eq("batch_id", batchId!).order("slot").returns<CheckinTask[]>()),
  });
}

export function useBatches(classId: string) {
  return useQuery({
    queryKey: checkinKeys.batches(classId),
    queryFn: () => fetchAll<CheckinBatch>((from, to) => supabase.from("checkin_batches")
      .select("id,class_id,kind,title,archived_at")
      .eq("class_id", classId).order("archived_at", { ascending: false }).order("id").range(from, to)),
  });
}

/** 已封存任務的統計（封存紀錄頁） */
export function useArchivedStats(classId: string) {
  return useQuery({
    queryKey: checkinKeys.stats(classId),
    queryFn: () => fetchAll<CheckinTaskStat>((from, to) => supabase.from("checkin_task_stats").select("*")
      .eq("class_id", classId).eq("status", "archived").order("task_date").order("task_id").range(from, to)),
  });
}

export function useStudentMarks(studentId: string) {
  return useQuery({
    queryKey: checkinKeys.studentMarks(studentId),
    enabled: !!studentId,
    queryFn: () => fetchAll<CheckinStudentMark>((from, to) => supabase.from("checkin_task_marks")
      .select("task_id,student_id,student_no,name_zh,state,done_at,removed_at,checkin_tasks(name,slot,task_date,status,batch_id)")
      .eq("student_id", studentId).order("task_id").range(from, to).returns<CheckinStudentMark[]>()),
  });
}

/** 學生的完整操作歷程，新到舊（設計 §7.3） */
export function useStudentEvents(studentId: string) {
  return useQuery({
    queryKey: checkinKeys.studentEvents(studentId),
    enabled: !!studentId,
    queryFn: () => fetchAll<CheckinEvent>((from, to) => supabase.from("checkin_events")
      .select("id,action,actor,at,task_id,next,checkin_tasks(name)")
      .eq("student_id", studentId).eq("series", "task").order("id", { ascending: false }).range(from, to).returns<CheckinEvent[]>()),
  });
}

export function useCheckinSettings(classId: string) {
  return useQuery({
    queryKey: checkinKeys.settings(classId),
    queryFn: async (): Promise<CheckinSettings | null> => {
      const { data, error } = await supabase.from("checkin_settings").select("class_id,pin_hash,pin_salt").eq("class_id", classId).maybeSingle();
      if (error) throw error;
      return data as CheckinSettings | null;
    },
  });
}

// ───────────── 寫入 ─────────────

type MarkVars = { taskId: string; studentId: string };

function findMark(qc: QueryClient, classId: string, v: MarkVars): CheckinMark | undefined {
  return qc.getQueryData<CheckinTask[]>(checkinKeys.open(classId))
    ?.find((t) => t.id === v.taskId)?.checkin_task_marks.find((m) => m.student_id === v.studentId);
}

/** 只改快取裡的一格，不整份重讀，避免連續點名時畫面跳動 */
function patchMark(qc: QueryClient, classId: string, v: MarkVars, patch: Partial<CheckinMark>) {
  qc.setQueryData<CheckinTask[]>(checkinKeys.open(classId), (list) => list?.map((t) => t.id !== v.taskId ? t : {
    ...t,
    checkin_task_marks: t.checkin_task_marks.map((m) => (m.student_id === v.studentId ? { ...m, ...patch } : m)),
  }));
}

/** 打卡或取消：送的是「設為完成／設為未完成」，重送也不會變成相反的結果（設計 §3.3）。樂觀更新，失敗時還原這一格 */
export function useSetDone(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: MarkVars & { done: boolean }) =>
      callRpc<CheckinSetResult>("task_set_done", { p_task_id: v.taskId, p_student_id: v.studentId, p_done: v.done }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: checkinKeys.open(classId) });
      const prev = findMark(qc, classId, v);
      patchMark(qc, classId, v, { state: v.done ? "done" : "pending", done_at: v.done ? new Date().toISOString() : null });
      return { prev: prev && { state: prev.state, done_at: prev.done_at } };
    },
    onSuccess: (r, v, ctx) => {
      if (isRejected(r)) {
        if (ctx?.prev) patchMark(qc, classId, v, ctx.prev);
        qc.invalidateQueries({ queryKey: checkinKeys.open(classId) });
      } else {
        patchMark(qc, classId, v, { state: r.state, done_at: r.done_at });
      }
    },
    onError: (_e, v, ctx) => { if (ctx?.prev) patchMark(qc, classId, v, ctx.prev); },
  });
}

export function useSetExempt(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: MarkVars & { exempt: boolean }) =>
      callRpc<CheckinSetResult>("task_set_exempt", { p_task_id: v.taskId, p_student_id: v.studentId, p_exempt: v.exempt }),
    onSuccess: (r, v) => {
      if (isRejected(r)) qc.invalidateQueries({ queryKey: checkinKeys.open(classId) });
      else patchMark(qc, classId, v, { state: r.state, done_at: r.done_at });
    },
  });
}

/** 復原這台裝置最近一次的打卡或取消（設計 §6.3）。狀態已被改掉時伺服器會拒絕，不自動重試 */
export function useUndo(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (v: MarkVars & { eventId: number }) => callRpc<CheckinSetResult>("checkin_undo", { p_event_id: v.eventId }),
    onSuccess: (r, v) => {
      if (isRejected(r)) qc.invalidateQueries({ queryKey: checkinKeys.open(classId) });
      else patchMark(qc, classId, v, { state: r.state, done_at: r.done_at });
    },
  });
}

export function useCreateTask(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { slot: number; name: string; taskDate: string; dueDate: string | null; note: string }) =>
      callRpc<string>("task_create", {
        p_class_id: classId, p_slot: v.slot, p_name: v.name, p_task_date: v.taskDate, p_due_date: v.dueDate, p_note: v.note,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: checkinKeys.open(classId) }),
  });
}

export function useUpdateTask(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: Pick<CheckinTask, "name" | "task_date" | "due_date" | "note"> }) =>
      must(supabase.from("checkin_tasks").update(v.patch).eq("id", v.id)),
    onSettled: () => qc.invalidateQueries({ queryKey: checkinKeys.open(classId) }),
  });
}

export function useArchiveTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { taskIds: string[]; kind: "round" | "single" }) =>
      callRpc<string>("task_archive", { p_task_ids: v.taskIds, p_kind: v.kind }),
    // 不 return：讓呼叫端的 onSuccess 不必等所有查詢重讀完
    onSettled: () => { qc.invalidateQueries({ queryKey: checkinKeys.all }); },
  });
}

export function useSavePin(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { pin_hash: string; pin_salt: string }) =>
      must(supabase.from("checkin_settings").upsert({ class_id: classId, ...v }, { onConflict: "class_id" })),
    onSettled: () => qc.invalidateQueries({ queryKey: checkinKeys.settings(classId) }),
  });
}
