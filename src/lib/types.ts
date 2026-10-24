export type Cls = { id: string; name: string; school_year: number };
export type Student = {
  id: string; class_id: string; student_no: number; name_zh: string; name_en: string | null; left_at: string | null;
};
export type HomeworkItem = { id: string; subject: string; name: string; sort_order: number; archived_at: string | null };
export type Check = { student_id: string; status: "done" | "missing" };
export type Assignment = {
  id: string; class_id: string; item_id: string; note: string; assigned_date: string; sort_order: number;
  status: "open" | "archived"; archived_at: string | null; created_at: string; homework_checks: Check[];
};
export type CoinTx = {
  id: string; class_id: string; student_id: string; delta: number; reason: string; note: string;
  batch_id: string; voided_at: string | null; created_at: string;
};
export type Layout = { id: string; class_id: string; name: string; rows: number; cols: number; is_current: boolean; created_at: string };
export type Seat = { layout_id: string; row: number; col: number; student_id: string | null; is_leader: boolean };
export type Semester = { id: string; class_id: string; name: string; start_date: string; end_date: string };
export type OffDay = { id: string; semester_id: string; date: string; reason: string };
export type PlannerColumn = {
  id: string; key: string; label: string; group_name: string;
  kind: "calendar" | "period" | "course_zh" | "course_social" | "text" | "multiline";
  item_id: string | null; sort_order: number; in_summary: boolean; hidden: boolean;
};
export type PlannerEntry = { id: string; semester_id: string; date: string; column_id: string; value: string };

export type CheckinMark = {
  student_id: string; student_no: number; name_zh: string;
  state: "pending" | "done" | "exempt"; done_at: string | null; removed_at: string | null;
};
export type CheckinTask = {
  id: string; class_id: string; slot: number; name: string; task_date: string; due_date: string | null; note: string;
  status: "open" | "archived"; batch_id: string | null; archived_at: string | null; checkin_task_marks: CheckinMark[];
};
export type CheckinBatch = { id: string; class_id: string; kind: "round" | "single"; title: string; archived_at: string };
export type CheckinTaskStat = {
  task_id: string; class_id: string; batch_id: string | null; name: string; slot: number; task_date: string;
  status: "open" | "archived"; total: number; done: number; exempt: number;
};
export type CheckinStudentMark = CheckinMark & {
  task_id: string;
  checkin_tasks: { name: string; slot: number; task_date: string; status: "open" | "archived"; batch_id: string | null };
};
export type CheckinEvent = {
  id: number; action: "done" | "cancel" | "undo" | "exempt" | "unexempt" | "leave" | "unleave" | "teacher_fill";
  actor: "student" | "teacher"; at: string; task_id: string | null;
  next: { state?: string; done_at?: string | null } | null; checkin_tasks: { name: string } | null;
};
export type CheckinSettings = { class_id: string; pin_hash: string | null; pin_salt: string | null };
/** task_set_done、task_set_exempt、checkin_undo 的回傳值；沒有實際寫入時 event_id 是 null */
export type CheckinSetResult = { state: CheckinMark["state"]; done_at: string | null; event_id: number | null };
