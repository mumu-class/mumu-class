import type { CheckinMark, CheckinTask, Student } from "../../../lib/types";

export type TaskCount = { done: number; total: number; exempt: number };

/** 一般任務的完成數：應完成數不含免交與轉出（設計 §8）。資料庫的 checkin_task_stats 用同一個規則 */
export function countTask(marks: CheckinMark[]): TaskCount {
  let done = 0, total = 0, exempt = 0;
  for (const m of marks) {
    if (m.removed_at) continue;
    if (m.state === "exempt") exempt++;
    else {
      total++;
      if (m.state === "done") done++;
    }
  }
  return { done, total, exempt };
}

/** 卡片上要顯示的名字：轉出的不顯示，依座號排序 */
export function visibleMarks(task: CheckinTask): CheckinMark[] {
  return task.checkin_task_marks.filter((m) => !m.removed_at).sort((a, b) => a.student_no - b.student_no);
}

/** 進行中的任務以目前名單的座號姓名顯示；封存的任務維持封存當下的快照（設計 §5.2） */
export function withLiveNames(task: CheckinTask, students: Student[]): CheckinTask {
  if (task.status !== "open") return task;
  const byId = new Map(students.map((s) => [s.id, s]));
  return {
    ...task,
    checkin_task_marks: task.checkin_task_marks.map((m) => {
      const s = byId.get(m.student_id);
      return s ? { ...m, student_no: s.student_no, name_zh: s.name_zh } : m;
    }),
  };
}

export type MissingRow = { student_id: string; student_no: number; name_zh: string; tasks: CheckinTask[] };

/** 缺交總覽：只要有一項未完成就列出一次；免交、轉出不算缺交 */
export function missingByStudent(tasks: CheckinTask[]): MissingRow[] {
  const rows = new Map<string, MissingRow>();
  for (const t of tasks) {
    for (const m of t.checkin_task_marks) {
      if (m.removed_at || m.state !== "pending") continue;
      const row = rows.get(m.student_id) ?? { student_id: m.student_id, student_no: m.student_no, name_zh: m.name_zh, tasks: [] };
      row.tasks.push(t);
      rows.set(m.student_id, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.student_no - b.student_no);
}

/** 搜尋：輸入數字就比對座號，否則比對姓名 */
export function matchStudent(query: string, no: number, name: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return /^\d+$/.test(q) ? Number(q) === no : name.includes(q);
}
