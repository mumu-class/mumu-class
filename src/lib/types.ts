export type Cls = { id: string; name: string; school_year: number };
export type Student = {
  id: string; class_id: string; student_no: number; name_zh: string; name_en: string | null; left_at: string | null;
};
export type HomeworkItem = { id: string; subject: string; name: string; sort_order: number; archived_at: string | null };
export type Check = { student_id: string; status: "done" | "missing" };
export type Assignment = {
  id: string; class_id: string; item_id: string; note: string; assigned_date: string;
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
  item_id: string | null; sort_order: number; in_summary: boolean;
};
export type PlannerEntry = { id: string; semester_id: string; date: string; column_id: string; value: string };
