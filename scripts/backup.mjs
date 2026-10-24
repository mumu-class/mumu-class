// 以 service_role 匯出所有業務資料表（含 audit_log）成 JSON，輸出到 stdout。
// 由 .github/workflows/backup.yml 每晚執行；這也是讓免費專案保持活躍的訊號。
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const db = createClient(url, key, { auth: { persistSession: false } });
const TABLES = ["classes", "students", "homework_items", "homework_assignments", "homework_checks", "coin_transactions",
  "seating_layouts", "seat_assignments", "semesters", "semester_off_days", "planner_columns", "planner_entries",
  "checkin_settings", "checkin_batches", "checkin_tasks", "checkin_task_marks", "checkin_events", "holidays", "audit_log"];
const PAGE = 1000;
// 分頁要依唯一鍵排序，否則每頁的順序不保證一致；沒列出的表用 id
const KEYS = {
  holidays: ["date"], homework_checks: ["assignment_id", "student_id"], seat_assignments: ["layout_id", "row", "col"],
  checkin_settings: ["class_id"], checkin_task_marks: ["task_id", "student_id"],
};

const out = { exported_at: new Date().toISOString() };
for (const t of TABLES) {
  const rows = [];
  // 讀到空頁才停：即使正式站的 max_rows 比 PAGE 小也不會少資料（同 src/lib/fetchAll.ts）
  for (;;) {
    const query = (KEYS[t] ?? ["id"]).reduce((q, k) => q.order(k), db.from(t).select("*"));
    const { data, error } = await query.range(rows.length, rows.length + PAGE - 1);
    if (error) { console.error(`${t}: ${error.message}`); process.exit(1); }
    if (!data.length) break;
    rows.push(...data);
  }
  out[t] = rows;
  console.error(`${t}: ${rows.length}`);
}
process.stdout.write(JSON.stringify(out));
