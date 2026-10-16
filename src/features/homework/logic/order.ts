type Orderable = { sort_order: number; assigned_date: string; created_at: string };

/**
 * 進行中作業的顯示順序（2026-10-16 回饋設計 §5.1）：sort_order 小的在前；相同時日期新的在前，再比建立時間。
 * 老師調整過順序後會編為 1、2、3…，新建立的作業是 0，所以一定排在最前面。
 */
export function sortOpen<T extends Orderable>(list: T[]): T[] {
  return [...list].sort((x, y) =>
    x.sort_order - y.sort_order || y.assigned_date.localeCompare(x.assigned_date) || y.created_at.localeCompare(x.created_at));
}

/** 把第 index 個往前（-1）或往後（+1）移一格；超出範圍時原樣回傳 */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

type WithChecks = { id: string; homework_checks: { student_id: string; status: "done" | "missing" }[] };

/** 依學生整理缺交：只列出有缺交的學生，依座號排序；每位學生的作業依傳入的順序 */
export function missingByStudent<A extends WithChecks, S extends { id: string; student_no: number }>(
  open: A[], students: S[],
): { student: S; assignments: A[] }[] {
  return students
    .map((student) => ({
      student,
      assignments: open.filter((a) => a.homework_checks.some((c) => c.student_id === student.id && c.status === "missing")),
    }))
    .filter((r) => r.assignments.length > 0)
    .sort((x, y) => x.student.student_no - y.student.student_no);
}
