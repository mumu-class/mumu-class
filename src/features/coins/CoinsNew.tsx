import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { useToast } from "../../shared/Toast";
import { PageTitle } from "../../shared/ui";
import { useRecord, useVoid } from "./api";
import { CoinsTabs } from "./CoinsTabs";
import { AMOUNTS, REASON_GROUPS, fmt } from "./logic/money";

export function CoinsNew() {
  const { cls, students } = useClassData();
  const location = useLocation();
  const preset = (location.state as { studentId?: string } | null)?.studentId;
  const [selected, setSelected] = useState<Set<string>>(new Set(preset ? [preset] : []));
  const [type, setType] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("存款");
  const [note, setNote] = useState("");
  const record = useRecord(cls.id);
  const voider = useVoid(cls.id);
  const toast = useToast();
  const navigate = useNavigate();

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function submit() {
    const delta = type === "deposit" ? amount : -amount;
    const n = selected.size;
    record.mutate({ studentIds: [...selected], delta, reason, note: note.trim() }, {
      onSuccess: (batchId) => {
        toast(`已記錄 ${n} 位學生 ${delta > 0 ? "+" : ""}${fmt(delta)} 幣`, { label: "復原", run: () => voider.mutate({ batchId, voided: true }) });
        setSelected(new Set());
        setNote("");
        navigate("/coins");
      },
      onError: () => toast("記錄失敗，沒有寫入任何資料，請再試一次"),
    });
  }

  return (
    <>
      <PageTitle>MUMU 幣</PageTitle>
      <CoinsTabs />
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">1. 選擇學生</h2>
            <span className="text-sm text-muted">已選 {selected.size} 人</span>
          </div>
          <div className="mb-3 flex gap-2">
            <button className="btn-soft" onClick={() => setSelected(new Set(students.map((s) => s.id)))}>全選</button>
            <button className="btn" onClick={() => setSelected(new Set())}>清除</button>
          </div>
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-auto sm:grid-cols-4">
            {students.map((s) => (
              <button key={s.id} onClick={() => toggle(s.id)}
                className={`rounded-lg border p-2 text-left font-bold ${selected.has(s.id) ? "border-sage bg-sage-soft" : "border-line bg-sheet"}`}>
                <span className="mr-1 text-sm text-sage">{s.student_no}</span>{s.name_zh}
              </button>
            ))}
          </div>
        </div>
        <div className="card space-y-4 p-4">
          <h2 className="text-lg font-black">2. 設定 MUMU 幣</h2>
          <div className="flex gap-2">
            <button className={type === "deposit" ? "chip-on" : "chip"} onClick={() => setType("deposit")}>＋ 存款</button>
            <button className={type === "withdraw" ? "chip bg-rose-ink border-rose-ink text-white" : "chip"} onClick={() => setType("withdraw")}>－ 扣款</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {AMOUNTS.map((v) => (
              <button key={v} onClick={() => setAmount(v)}
                className={`rounded-lg border py-2 font-black ${amount === v ? (type === "deposit" ? "border-sage bg-sage-soft text-sage" : "border-rose-ink bg-rose text-rose-ink") : "border-line bg-sheet"}`}>
                {type === "deposit" ? "+" : "−"}{fmt(v)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="reason">理由</label>
              <select id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASON_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.reasons.map((r) => <option key={r}>{r}</option>)}</optgroup>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="note">補充說明（可不填）</label>
              <input id="note" className="input" placeholder="例如：主動幫忙整理書櫃" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <p className="rounded-lg bg-paper p-3 text-sm text-muted">同一筆會套用到所有選取的學生，每位學生各自留下紀錄。</p>
          <button className="btn-primary w-full py-3" disabled={!selected.size || record.isPending} onClick={submit}>
            {record.isPending ? "記錄中…" : `確認記錄（${selected.size} 人 ${type === "deposit" ? "+" : "−"}${fmt(amount)}）`}
          </button>
        </div>
      </div>
    </>
  );
}
