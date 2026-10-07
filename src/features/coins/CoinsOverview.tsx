import { Link, useNavigate } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { useToast } from "../../shared/Toast";
import { ErrorBox, Loading, PageTitle } from "../../shared/ui";
import { balances, useInterest, useRecord, useTxs, useVoid } from "./api";
import { CoinsTabs } from "./CoinsTabs";
import { fmt, isToday } from "./logic/money";

export function CoinsOverview() {
  const { cls, students } = useClassData();
  const q = useTxs(cls.id);
  const record = useRecord(cls.id);
  const interest = useInterest(cls.id);
  const voider = useVoid(cls.id);
  const toast = useToast();
  const navigate = useNavigate();
  if (q.error) return <ErrorBox error={q.error} />;
  if (q.isLoading || !q.data) return <Loading />;

  const live = q.data.filter((t) => !t.voided_at);
  const bal = balances(q.data);
  const total = live.reduce((s, t) => s + t.delta, 0);
  const todayPlus = live.filter((t) => isToday(t.created_at) && t.delta > 0).reduce((s, t) => s + t.delta, 0);
  const todayMinus = live.filter((t) => isToday(t.created_at) && t.delta < 0).reduce((s, t) => s + t.delta, 0);
  const busy = record.isPending || interest.isPending;

  function quick(studentId: string, name: string, delta: number) {
    record.mutate({ studentIds: [studentId], delta, reason: delta > 0 ? "存款" : "提款", note: "" }, {
      onSuccess: (batchId) => toast(`${name} ${delta > 0 ? "+" : ""}${fmt(delta)} 幣`, { label: "復原", run: () => voider.mutate({ batchId, voided: true }) }),
      onError: () => toast("記錄失敗，請再試一次"),
    });
  }
  function addInterest(studentId: string, name: string) {
    interest.mutate(studentId, {
      onSuccess: (v) => toast(Number(v) > 0 ? `${name} 獲得利息 +${fmt(v)} 幣` : `${name} 餘額為 0 或負數，不計利息`),
      onError: () => toast("計算利息失敗，請再試一次"),
    });
  }

  return (
    <>
      <PageTitle right={<Link to="/coins/new" className="btn-soft">新增一筆</Link>}>MUMU 幣</PageTitle>
      <CoinsTabs />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="stat"><div className="stat-label">全班 MUMU 幣總額</div><div className="stat-num">{fmt(total)}</div></div>
        <div className="stat"><div className="stat-label">今日存入</div><div className="stat-num text-sage">+{fmt(todayPlus)}</div></div>
        <div className="stat col-span-2 sm:col-span-1"><div className="stat-label">今日扣除</div><div className="stat-num text-rose-ink">{fmt(todayMinus)}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {students.map((s) => {
          const b = bal.get(s.id) ?? 0;
          return (
            <div key={s.id} className="card flex cursor-pointer flex-col justify-between gap-2 p-3 hover:shadow" onClick={() => navigate(`/coins/student/${s.id}`)}>
              <div className="flex items-center gap-2 font-bold">
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-sage-soft text-sm text-sage">{s.student_no}</span>
                <span className="truncate">{s.name_zh}</span>
              </div>
              <div className={`text-2xl font-black tabular-nums ${b < 0 ? "text-rose-ink" : ""}`}>{fmt(b)} <span className="text-sm font-normal text-muted">幣</span></div>
              <div className="grid grid-cols-3 gap-1" onClick={(e) => e.stopPropagation()}>
                <button disabled={busy} className="rounded-md bg-sage-soft py-1.5 text-xs font-black text-sage" onClick={() => quick(s.id, s.name_zh, 1000)}>＋1000</button>
                <button disabled={busy} className="rounded-md bg-rose py-1.5 text-xs font-black text-rose-ink" onClick={() => quick(s.id, s.name_zh, -1000)}>－1000</button>
                <button disabled={busy} className="rounded-md bg-gold-soft py-1.5 text-xs font-black text-gold-ink" onClick={() => addInterest(s.id, s.name_zh)}>＋5%</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
