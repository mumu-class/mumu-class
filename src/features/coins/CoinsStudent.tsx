import { useNavigate, useParams } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { ErrorBox, Loading, PageTitle } from "../../shared/ui";
import { balances, useTxs } from "./api";
import { CoinsTabs } from "./CoinsTabs";
import { fmt, signed } from "./logic/money";

export function CoinsStudent() {
  const { cls, students } = useClassData();
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useTxs(cls.id);
  if (q.error) return <ErrorBox error={q.error} />;
  if (q.isLoading || !q.data) return <Loading />;

  const student = students.find((s) => s.id === id) ?? students[0];
  if (!student) return <><PageTitle>MUMU 幣</PageTitle><CoinsTabs /><div className="card p-6 text-center text-muted">尚未建立學生名單</div></>;
  const txs = q.data.filter((t) => t.student_id === student.id && !t.voided_at);
  const bal = balances(q.data).get(student.id) ?? 0;
  const plus = txs.filter((t) => t.delta > 0).reduce((s, t) => s + t.delta, 0);
  const minus = txs.filter((t) => t.delta < 0).reduce((s, t) => s + t.delta, 0);

  return (
    <>
      <PageTitle>MUMU 幣</PageTitle>
      <CoinsTabs />
      <div className="card p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-48">
            <label className="label" htmlFor="acct">選擇學生</label>
            <select id="acct" className="input" value={student.id} onChange={(e) => navigate(`/coins/student/${e.target.value}`, { replace: true })}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.student_no}號｜{s.name_zh}</option>)}
            </select>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted">目前總額</div>
            <div className={`text-4xl font-black tabular-nums ${bal < 0 ? "text-rose-ink" : ""}`}>{fmt(bal)} 幣</div>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="stat"><div className="stat-label">累積存款</div><div className="stat-num">+{fmt(plus)}</div></div>
          <div className="stat"><div className="stat-label">累積扣款</div><div className="stat-num">{fmt(minus)}</div></div>
          <div className="stat"><div className="stat-label">交易筆數</div><div className="stat-num">{txs.length}</div></div>
        </div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-black">個人歷程</h3>
          <button className="btn-soft" onClick={() => navigate("/coins/new", { state: { studentId: student.id } })}>替此學生加扣幣</button>
        </div>
        <div className="space-y-2">
          {txs.length === 0 ? <div className="p-6 text-center text-muted">這位學生目前還沒有 MUMU 幣紀錄</div> : txs.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
              <div className="min-w-0">
                <div className="truncate font-bold">{t.reason}{t.note && `｜${t.note}`}</div>
                <div className="text-xs text-muted">{new Date(t.created_at).toLocaleString("zh-TW")}</div>
              </div>
              <div className={`text-xl font-black tabular-nums ${t.delta >= 0 ? "text-sage" : "text-rose-ink"}`}>{signed(t.delta)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
