import { useState } from "react";
import { useClassData } from "../../lib/classData";
import { useToast } from "../../shared/Toast";
import { ErrorBox, Loading, PageTitle } from "../../shared/ui";
import { useTxs, useVoid } from "./api";
import { CoinsTabs } from "./CoinsTabs";
import { downloadText, signed, toCsv } from "./logic/money";

const dt = (iso: string) => new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export function CoinsHistory() {
  const { cls, allStudents } = useClassData();
  const q = useTxs(cls.id);
  const voider = useVoid(cls.id);
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [sid, setSid] = useState("");
  const [type, setType] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  if (q.error) return <ErrorBox error={q.error} />;
  if (q.isLoading || !q.data) return <Loading />;

  const byId = new Map(allStudents.map((s) => [s.id, s]));
  const label = (id: string) => { const s = byId.get(id); return s ? `${s.student_no}號｜${s.name_zh}` : "已移除學生"; };
  const rows = q.data.filter((t) => {
    if (!showVoided && t.voided_at) return false;
    const text = `${label(t.student_id)} ${t.reason} ${t.note}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (!sid || t.student_id === sid) && (!type || (type === "deposit" ? t.delta > 0 : t.delta < 0));
  });

  function exportCsv() {
    const live = [...q.data!].filter((t) => !t.voided_at).reverse();
    const csv = toCsv([["時間", "座號", "姓名", "理由", "補充說明", "MUMU幣變動"],
      ...live.map((t) => { const s = byId.get(t.student_id); return [new Date(t.created_at).toLocaleString("zh-TW"), s?.student_no ?? "", s?.name_zh ?? "已移除學生", t.reason, t.note, t.delta]; })]);
    downloadText(`MUMU幣銀行歷程_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <>
      <PageTitle right={<button className="btn" onClick={exportCsv}>匯出 CSV</button>}>MUMU 幣</PageTitle>
      <CoinsTabs />
      <div className="card p-4">
        <div className="mb-3 grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
          <input id="h-search" className="input" placeholder="搜尋學生、理由、補充說明" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select id="h-student" className="input" value={sid} onChange={(e) => setSid(e.target.value)}>
            <option value="">全部學生</option>
            {allStudents.map((s) => <option key={s.id} value={s.id}>{label(s.id)}</option>)}
          </select>
          <select id="h-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">全部類型</option><option value="deposit">存款</option><option value="withdraw">扣款</option>
          </select>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap"><input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />顯示已作廢</label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-paper text-sm text-muted"><tr><th className="p-2">時間</th><th className="p-2">學生</th><th className="p-2">理由</th><th className="p-2">補充</th><th className="p-2 text-right">變動</th><th className="p-2 text-right">操作</th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-muted">目前沒有符合的紀錄</td></tr> : rows.slice(0, 500).map((t) => (
                <tr key={t.id} className={`border-t border-line ${t.voided_at ? "text-muted line-through" : ""}`}>
                  <td className="p-2 tabular-nums">{dt(t.created_at)}</td>
                  <td className="p-2">{label(t.student_id)}</td>
                  <td className="p-2">{t.reason}</td>
                  <td className="p-2">{t.note}</td>
                  <td className={`p-2 text-right text-lg font-black tabular-nums ${t.delta >= 0 ? "text-sage" : "text-rose-ink"}`}>{signed(t.delta)}</td>
                  <td className="p-2 text-right no-underline">
                    {t.voided_at
                      ? <button className="text-sm font-bold text-sage underline" onClick={() => voider.mutate({ id: t.id, voided: false })}>復原</button>
                      : <button className="text-sm font-bold text-rose-ink underline" onClick={() => voider.mutate({ id: t.id, voided: true }, {
                          onSuccess: () => toast("已作廢 1 筆交易", { label: "復原", run: () => voider.mutate({ id: t.id, voided: false }) }),
                        })}>作廢</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 500 && <p className="mt-2 text-sm text-muted">只顯示最近 500 筆，請用篩選縮小範圍。</p>}
      </div>
    </>
  );
}
