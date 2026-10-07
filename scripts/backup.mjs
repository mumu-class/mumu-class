// 以 service_role 匯出所有業務資料表（含 audit_log）成 JSON，輸出到 stdout。
// 由 .github/workflows/backup.yml 每晚執行；這也是讓免費專案保持活躍的訊號。
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const db = createClient(url, key, { auth: { persistSession: false } });
const TABLES = ["classes", "students", "homework_items", "homework_assignments", "homework_checks", "coin_transactions",
  "seating_layouts", "seat_assignments", "semesters", "semester_off_days", "planner_columns", "planner_entries", "holidays", "audit_log"];
const PAGE = 1000;

const out = { exported_at: new Date().toISOString() };
for (const t of TABLES) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(t).select("*").range(from, from + PAGE - 1);
    if (error) { console.error(`${t}: ${error.message}`); process.exit(1); }
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  out[t] = rows;
  console.error(`${t}: ${rows.length}`);
}
process.stdout.write(JSON.stringify(out));
