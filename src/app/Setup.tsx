import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DEFAULT_ITEMS, DEFAULT_PLANNER_COLUMNS, DEFAULT_SEMESTER } from "../lib/defaults";
import { must, supabase } from "../lib/supabase";
import { parseRoster } from "../features/roster/logic/parseRoster";

/** 初次使用：建立班級、貼上名單，並放入預設的作業項目、規劃表欄位、學期與座位表 */
export function Setup() {
  const qc = useQueryClient();
  const [name, setName] = useState("311");
  const [year, setYear] = useState(115);
  const [roster, setRoster] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parsed = parseRoster(roster);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const cls = await must(supabase.from("classes").insert({ name, school_year: year }).select("id").single<{ id: string }>());
      if (parsed.rows.length) {
        await must(supabase.from("students").insert(parsed.rows.map((r) => ({ ...r, class_id: cls.id }))));
      }
      const existing = await must(supabase.from("homework_items").select("id").limit(1));
      if (!existing.length) {
        const rows = Object.entries(DEFAULT_ITEMS).flatMap(([subject, names]) => names.map((n, i) => ({ subject, name: n, sort_order: i })));
        await must(supabase.from("homework_items").insert(rows));
      }
      const cols = await must(supabase.from("planner_columns").select("id").limit(1));
      if (!cols.length) {
        // 欄位名稱和作業項目同名時記下 item_id，日後「規劃表 → 作業小管家」串接會用到
        const all = await must(supabase.from("homework_items").select("id,name").returns<{ id: string; name: string }[]>());
        const idByName = new Map(all.map((i) => [i.name, i.id]));
        await must(supabase.from("planner_columns").insert(
          DEFAULT_PLANNER_COLUMNS.map((c, i) => ({ ...c, sort_order: i, item_id: idByName.get(c.key) ?? null })),
        ));
      }
      await must(supabase.from("semesters").insert({ ...DEFAULT_SEMESTER, class_id: cls.id }));
      await must(supabase.from("seating_layouts").insert({ class_id: cls.id, name: "目前座位", rows: 5, cols: 6, is_current: true }));
      await qc.invalidateQueries();
    } catch (e) {
      setError((e as { message?: string }).message ?? String(e));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-black">歡迎使用 MuMu 班級工作台</h1>
      <p className="text-muted">先建立班級並貼上學生名單。名單之後可以在「設定」中修改。</p>
      <p className="text-sm text-muted">如果不想存完整姓名，可以只填遮蔽後的名字（例如「1 陳O聖」），英文名也可以不填。</p>
      <div className="card space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="cls-name">班級</label><input id="cls-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label" htmlFor="cls-year">學年度</label><input id="cls-year" type="number" className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
        </div>
        <div>
          <label className="label" htmlFor="roster">學生名單（每行一位：座號 中文名 英文名）</label>
          <textarea id="roster" className="input min-h-60 font-mono text-sm" placeholder={"1 王小明 Ming\n2 李小華 Hua"} value={roster} onChange={(e) => setRoster(e.target.value)} />
          <p className="mt-1 text-sm text-muted">
            已辨識 {parsed.rows.length} 位
            {parsed.errors.length > 0 && <span className="text-rose-ink">；第 {parsed.errors.join("、")} 行無法辨識</span>}
          </p>
        </div>
        {error && <p className="rounded-lg bg-rose p-3 text-sm text-rose-ink">建立失敗：{error}</p>}
        <button className="btn-primary w-full py-3" disabled={busy || !name.trim() || parsed.errors.length > 0} onClick={create}>
          {busy ? "建立中…" : `建立班級（${parsed.rows.length} 位學生）`}
        </button>
      </div>
    </div>
  );
}
