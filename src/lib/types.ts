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
  /** 中午事件才有（一般任務的查詢不選這四欄） */
  day_id?: string | null; day_item_id?: string | null;
  next: { state?: string; done_at?: string | null; result?: NoonResult; on_leave?: boolean } | null;
  checkin_tasks?: { name: string } | null;
  noon_day_items?: { name: string } | null; noon_days?: { date: string } | null;
};
export type CheckinSettings = {
  class_id: string; pin_hash: string | null; pin_salt: string | null; noon_timeline: NoonTimelineEntry[];
};
/** task_set_done、task_set_exempt、checkin_undo 的回傳值；沒有實際寫入時 event_id 是 null */
export type CheckinSetResult = { state: CheckinMark["state"]; done_at: string | null; event_id: number | null };

// ───────────── 中午時段（設計 §5.3；SQL 的 noon_compute_summary 與前端 computeSummary 共用 NoonSummary 的形狀） ─────────────

export type NoonResult = "pending" | "ontime" | "late";
export type NoonSource = "student" | "teacher";
/** 午餐時序的一格，例如 { time: "12:30", label: "加餐、倒餐" } */
export type NoonTimelineEntry = { time: string; label: string };
/** 固定任務的範本。deadline 是 Postgres 的 time，讀出來可能是 "12:40:00"，比較前先取前 5 碼 */
export type NoonItem = { id: string; class_id: string; name: string; deadline: string; sort_order: number; archived_at: string | null };
export type NoonDayItem = { id: string; day_id: string; template_id: string; name: string; deadline: string; sort_order: number };
export type NoonDayStudent = {
  day_id: string; student_id: string; student_no: number; name_zh: string; on_leave: boolean; removed_at: string | null;
};
export type NoonMark = {
  day_item_id: string; student_id: string; day_id: string; result: NoonResult; done_at: string | null; source: NoonSource | null;
};
export type NoonSummaryItem = {
  /** 沒有紀錄（只有範本預覽）時前端算出的統計是空字串 */
  day_item_id: string; template_id: string; name: string; deadline: string; sort_order: number;
  ontime: number; late: number; pending: number; leave: number; total: number;
};
export type NoonSummaryStudent = {
  student_id: string; student_no: number; name_zh: string; on_leave: boolean;
  ontime: number; late: number; pending: number; total: number;
};
export type NoonSummary = {
  items: NoonSummaryItem[]; students: NoonSummaryStudent[];
  overall: { ontime: number; late: number; pending: number; total: number; students: number; leave_students: number; items: number };
};
export type NoonDayRow = {
  id: string; class_id: string; date: string; status: "open" | "archived";
  settled_at: string | null; settled_version: number | null; settled_summary: NoonSummary | null;
  scheduled_archive_at: string; archived_at: string | null; archived_by: "schedule" | "catchup" | null;
  final_summary: NoonSummary | null; revised_at: string | null;
};
export type NoonDay = NoonDayRow & { noon_day_items: NoonDayItem[]; noon_day_students: NoonDayStudent[]; noon_marks: NoonMark[] };
/** 學生在某一天的打卡（含任務快照與日期），給學生歷程頁用 */
export type NoonStudentMark = NoonMark & {
  noon_day_items: { name: string; deadline: string; sort_order: number }; noon_days: { date: string; status: "open" | "archived" };
};
/** noon_today：不寫入，只回傳伺服器時間與今天紀錄的狀態；沒有紀錄時 day_id、status 是 null，version 是 0 */
export type NoonToday = {
  now: string; date: string; after_cutoff: boolean; day_id: string | null; status: "open" | "archived" | null; version: number;
};
/** noon_set_done、noon_teacher_fill、checkin_undo（中午事件）的回傳值；沒有實際寫入時 event_id 是 null */
export type NoonSetResult = {
  result: NoonResult; done_at: string | null; source: NoonSource | null; event_id: number | null; day_id: string;
};
export type NoonLeaveResult = { on_leave: boolean; event_id: number | null; day_id: string };
