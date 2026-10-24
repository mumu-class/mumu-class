import type { NoonDay, NoonItem, NoonResult, NoonSource, NoonSummary, Student } from "../../../lib/types";
import { taipeiMinuteTime } from "./clock";

/** "12:40:00" → "12:40"。Postgres 的 time 欄位讀出來帶秒數 */
export const hhmm = (t: string): string => t.slice(0, 5);

/** 判定準時或逾時：只比到分鐘，12:40:59 仍算準時、12:41:00 起逾時（設計 §4）。和 SQL 的 date_trunc('minute', …) <= deadline 一致 */
export function judge(deadline: string, at: Date): "ontime" | "late" {
  return taipeiMinuteTime(at) <= hhmm(deadline) ? "ontime" : "late";
}

export type NoonMarkState = { result: NoonResult; done_at: string | null; source: NoonSource | null };
export type NoonViewItem = { template_id: string; day_item_id: string | null; name: string; deadline: string; sort_order: number };
export type NoonViewStudent = { student_id: string; student_no: number; name_zh: string; on_leave: boolean };
export type NoonView = {
  items: NoonViewItem[];
  students: NoonViewStudent[];
  /** 找不到（或還沒有紀錄）就是未完成 */
  mark: (templateId: string, studentId: string) => NoonMarkState;
};

const PENDING: NoonMarkState = { result: "pending", done_at: null, source: null };

/**
 * 打卡台要畫的資料。當天已有紀錄就用快照（任務名稱、截止時間、名單都不受之後的修改影響，設計 §5.3）；
 * 還沒有紀錄就用目前的範本（未停用、依順序）與在籍學生，mark 一律未完成。轉出的學生不列入
 */
export function buildNoonView(day: NoonDay | null | undefined, templates: NoonItem[], students: Student[]): NoonView {
  if (!day) {
    return {
      items: templates.filter((t) => !t.archived_at).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        .map((t) => ({ template_id: t.id, day_item_id: null, name: t.name, deadline: hhmm(t.deadline), sort_order: t.sort_order })),
      students: students.filter((s) => !s.left_at).sort((a, b) => a.student_no - b.student_no)
        .map((s) => ({ student_id: s.id, student_no: s.student_no, name_zh: s.name_zh, on_leave: false })),
      mark: () => PENDING,
    };
  }
  const items = [...day.noon_day_items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const dayItemOf = new Map(items.map((i) => [i.template_id, i.id]));
  const marks = new Map(day.noon_marks.map((m) => [`${m.day_item_id}|${m.student_id}`, m]));
  return {
    items: items.map((i) => ({ template_id: i.template_id, day_item_id: i.id, name: i.name, deadline: hhmm(i.deadline), sort_order: i.sort_order })),
    students: day.noon_day_students.filter((s) => !s.removed_at).sort((a, b) => a.student_no - b.student_no)
      .map((s) => ({ student_id: s.student_id, student_no: s.student_no, name_zh: s.name_zh, on_leave: s.on_leave })),
    mark: (templateId, studentId) => {
      const dayItemId = dayItemOf.get(templateId);
      const m = dayItemId ? marks.get(`${dayItemId}|${studentId}`) : undefined;
      return m ? { result: m.result, done_at: m.done_at, source: m.source } : PENDING;
    },
  };
}

/**
 * 統計（設計 §8），輸出形狀和 SQL 的 noon_compute_summary 完全相同。
 * 請假的學生只算在任務的 leave 欄，不進分母；學生列請假時全部是 0。ontime + late + pending = total
 */
export function computeSummary(view: NoonView): NoonSummary {
  const active = view.students.filter((s) => !s.on_leave);
  const items = view.items.map((it) => {
    let ontime = 0, late = 0, pending = 0;
    for (const s of active) {
      const r = view.mark(it.template_id, s.student_id).result;
      if (r === "ontime") ontime++;
      else if (r === "late") late++;
      else pending++;
    }
    return {
      day_item_id: it.day_item_id ?? "", template_id: it.template_id, name: it.name, deadline: it.deadline, sort_order: it.sort_order,
      ontime, late, pending, leave: view.students.length - active.length, total: active.length,
    };
  });
  const students = view.students.map((s) => {
    let ontime = 0, late = 0, pending = 0;
    if (!s.on_leave) {
      for (const it of view.items) {
        const r = view.mark(it.template_id, s.student_id).result;
        if (r === "ontime") ontime++;
        else if (r === "late") late++;
        else pending++;
      }
    }
    return { ...s, ontime, late, pending, total: ontime + late + pending };
  });
  const sum = (k: "ontime" | "late" | "pending" | "total") => items.reduce((n, i) => n + i[k], 0);
  return {
    items, students,
    overall: {
      ontime: sum("ontime"), late: sum("late"), pending: sum("pending"), total: sum("total"),
      students: view.students.length, leave_students: view.students.length - active.length, items: view.items.length,
    },
  };
}

/** 比率顯示：四捨五入到小數 1 位；分母 0 顯示「0%・0 筆」（設計 §8） */
export function fmtRate(n: number, d: number): string {
  if (d <= 0) return "0%・0 筆";
  return `${(Math.round((n * 1000) / d) / 10).toFixed(1)}%`;
}
