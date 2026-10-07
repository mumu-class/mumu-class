import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SUBJECTS, useClassData } from "../../lib/classData";
import { must, supabase } from "../../lib/supabase";
import type { Student } from "../../lib/types";
import { downloadText } from "../coins/logic/money";
import { useToast } from "../../shared/Toast";
import { PageTitle } from "../../shared/ui";
import { parseRoster } from "./logic/parseRoster";

export function SettingsPage() {
  return (
    <>
      <PageTitle>設定</PageTitle>
      <div className="space-y-4">
        <RosterSection />
        <ItemsSection />
        <BackupSection />
      </div>
    </>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

function RosterSection() {
  const { cls, allStudents } = useClassData();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [bulk, setBulk] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  const parsed = parseRoster(bulk);

  const update = useMutation({
    mutationFn: (v: { id: string; patch: Partial<Student> }) => must(supabase.from("students").update(v.patch).eq("id", v.id)),
    onSettled: () => invalidate("students"),
    onError: (e: { code?: string }) => toast(e.code === "23505" ? "這個座號已經有在籍學生了" : "儲存失敗，請再試一次"),
  });
  const add = useMutation({
    mutationFn: () => must(supabase.from("students").insert(parsed.rows.map((r) => ({ ...r, class_id: cls.id })))),
    onSuccess: () => { toast(`已新增 ${parsed.rows.length} 位學生`); setBulk(""); },
    onSettled: () => invalidate("students"),
    onError: (e: { code?: string }) => toast(e.code === "23505" ? "有座號和在籍學生重複，沒有新增任何人" : "新增失敗，請再試一次"),
  });

  const list = allStudents.filter((s) => showLeft || !s.left_at);
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black">學生名單｜{cls.name}（{allStudents.filter((s) => !s.left_at).length} 位在籍）</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} />顯示已轉出</label>
      </div>
      <p className="mb-3 text-sm text-muted">直接修改後點旁邊任意處即儲存。轉出的學生不會刪除，MUMU 幣與作業紀錄都會保留。</p>
      <div className="space-y-2">
        {list.map((s) => (
          <div key={s.id} className={`grid grid-cols-[64px_1fr_1fr_auto] items-center gap-2 ${s.left_at ? "opacity-50" : ""}`}>
            <input aria-label="座號" type="number" className="input" defaultValue={s.student_no}
              onBlur={(e) => Number(e.target.value) !== s.student_no && Number(e.target.value) > 0 && update.mutate({ id: s.id, patch: { student_no: Number(e.target.value) } })} />
            <input aria-label="中文名" className="input" defaultValue={s.name_zh}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.name_zh && update.mutate({ id: s.id, patch: { name_zh: e.target.value.trim() } })} />
            <input aria-label="英文名" className="input" defaultValue={s.name_en ?? ""}
              onBlur={(e) => e.target.value.trim() !== (s.name_en ?? "") && update.mutate({ id: s.id, patch: { name_en: e.target.value.trim() || null } })} />
            {s.left_at
              ? <button className="btn-soft" onClick={() => update.mutate({ id: s.id, patch: { left_at: null } })}>復學</button>
              : <button className="btn-danger" onClick={() => {
                  update.mutate({ id: s.id, patch: { left_at: new Date().toISOString() } });
                  toast(`${s.name_zh} 已設為轉出`, { label: "復原", run: () => update.mutate({ id: s.id, patch: { left_at: null } }) });
                }}>轉出</button>}
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <label className="label" htmlFor="bulk-add">新增學生（每行一位：座號 中文名 英文名）</label>
        <textarea id="bulk-add" className="input min-h-20 font-mono text-sm" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="33 新同學 New" />
        <div className="mt-2 flex items-center gap-3">
          <button className="btn-primary" disabled={!parsed.rows.length || parsed.errors.length > 0 || add.isPending} onClick={() => add.mutate()}>新增 {parsed.rows.length} 位</button>
          {parsed.errors.length > 0 && <span className="text-sm text-rose-ink">第 {parsed.errors.join("、")} 行無法辨識</span>}
        </div>
      </div>
    </section>
  );
}

function ItemsSection() {
  const { items } = useClassData();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => must(supabase.from("homework_items").insert({ subject, name: name.trim(), sort_order: items.filter((i) => i.subject === subject).length })),
    onSuccess: () => setName(""),
    onSettled: () => invalidate("items"),
    onError: (e: { code?: string }) => toast(e.code === "23505" ? "這個項目已經存在" : "新增失敗，請再試一次"),
  });
  const archive = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) => must(supabase.from("homework_items").update({ archived_at: v.archived ? new Date().toISOString() : null }).eq("id", v.id)),
    onSettled: () => invalidate("items"),
  });
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-lg font-black">作業項目（簿本清單）</h2>
      <p className="mb-3 text-sm text-muted">作業小管家的下拉選單會用這份清單。停用的項目不會出現在選單，但過去的紀錄會保留。</p>
      <div className="space-y-3">
        {SUBJECTS.map((sub) => (
          <div key={sub}>
            <div className="mb-1 text-sm font-black text-sage">{sub}</div>
            <div className="flex flex-wrap gap-2">
              {items.filter((i) => i.subject === sub).map((i) => (
                <span key={i.id} className="chip">{i.name}
                  <button className="ml-1 text-muted hover:text-rose-ink" aria-label={`停用 ${i.name}`} onClick={() => {
                    archive.mutate({ id: i.id, archived: true });
                    toast(`已停用「${i.name}」`, { label: "復原", run: () => archive.mutate({ id: i.id, archived: false }) });
                  }}>×</button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <select id="item-subject" className="input w-auto" value={subject} onChange={(e) => setSubject(e.target.value)}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
        <input id="item-name" className="input w-48" placeholder="例：數習" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>新增項目</button>
      </div>
    </section>
  );
}

const BACKUP_TABLES = ["classes", "students", "homework_items", "homework_assignments", "homework_checks", "coin_transactions",
  "seating_layouts", "seat_assignments", "semesters", "semester_off_days", "planner_columns", "planner_entries"];

function BackupSection() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function backup() {
    setBusy(true);
    try {
      const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
      for (const t of BACKUP_TABLES) out[t] = await must(supabase.from(t).select("*").limit(50000));
      downloadText(`MuMu班級工作台備份_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), "application/json");
    } catch {
      toast("備份失敗，請再試一次");
    }
    setBusy(false);
  }
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-lg font-black">備份與帳號</h2>
      <p className="mb-3 text-sm text-muted">資料已經存在雲端，系統每晚也會自動備份。這裡可以另外下載一份完整資料到這台裝置。</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy} onClick={backup}>{busy ? "準備中…" : "下載備份（JSON）"}</button>
        <button className="btn-danger" onClick={() => supabase.auth.signOut()}>登出</button>
      </div>
    </section>
  );
}
