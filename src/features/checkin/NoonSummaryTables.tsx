import type { NoonSummary } from "../../lib/types";
import { fmtRate } from "./logic/noon";

const th = "p-2 whitespace-nowrap";
// 逾時用橘色，旁邊一定有「逾時」字樣，不單靠顏色（設計 §7.3）
const LATE = "text-orange-700";

function StatCard({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="stat">
      <div className={`text-3xl font-black tabular-nums ${tone}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/** 每日結算與每日封存共用：四張數字卡、全班各項任務表、個別學生表（設計 §7.3、§8）。傳進來的 summary 已經是算好的 */
export function NoonSummaryTables({ summary }: { summary: NoonSummary }) {
  const o = summary.overall;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard value={fmtRate(o.ontime, o.total)} label={`準時 ${o.ontime} / ${o.total}`} tone="text-sage" />
        <StatCard value={fmtRate(o.late, o.total)} label={`逾時 ${o.late} / ${o.total}`} tone={LATE} />
        <StatCard value={String(o.pending)} label="未完成項次" tone="text-rose-ink" />
        <StatCard value={fmtRate(o.ontime + o.late, o.total)} label={`總完成 ${o.ontime + o.late} / ${o.total}`} tone="text-sage" />
      </div>

      <h2 className="mb-2 text-lg font-black">全班各項任務完成率</h2>
      <div className="card mb-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left">
          <thead>
            <tr className="bg-sage-soft text-sm text-sage">
              <th className={th}>固定任務</th><th className={th}>準時人數</th><th className={th}>準時率</th>
              <th className={th}>逾時人數</th><th className={th}>逾時率</th><th className={th}>未完成</th><th className={th}>請假</th>
            </tr>
          </thead>
          <tbody>
            {summary.items.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-center text-muted">沒有任務</td></tr>
            ) : summary.items.map((i) => (
              <tr key={i.template_id} className="border-t border-line">
                <td className="p-2 font-bold">{i.name}</td>
                <td className="p-2 tabular-nums">{i.ontime} / {i.total}</td>
                <td className="p-2 tabular-nums text-sage">{fmtRate(i.ontime, i.total)}</td>
                <td className="p-2 tabular-nums">{i.late} / {i.total}</td>
                <td className={`p-2 tabular-nums ${LATE}`}>{fmtRate(i.late, i.total)}</td>
                <td className="p-2 tabular-nums">{i.pending}</td>
                <td className="p-2 tabular-nums text-muted">{i.leave > 0 ? `${i.leave} 人` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-2 flex flex-wrap items-baseline gap-x-4">
        <h2 className="text-lg font-black">個別學生完成率</h2>
        <span className="text-sm text-muted">分母是 {o.items} 項任務；全班 {o.students} 位學生{o.leave_students > 0 ? `（請假 ${o.leave_students} 位不計）` : ""}</span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left">
          <thead>
            <tr className="bg-sage-soft text-sm text-sage">
              <th className={th}>學生</th><th className={th}>準時項數</th><th className={th}>準時率</th>
              <th className={th}>逾時項數</th><th className={th}>逾時率</th><th className={th}>未完成</th>
            </tr>
          </thead>
          <tbody>
            {summary.students.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted">沒有學生</td></tr>
            ) : summary.students.map((s) => (
              <tr key={s.student_id} className="border-t border-line">
                <td className="p-2 font-bold whitespace-nowrap"><span className="tabular-nums">{String(s.student_no).padStart(2, "0")}</span> {s.name_zh}</td>
                {s.on_leave ? (
                  <>
                    <td className="p-2 font-bold text-muted">請假</td>
                    <td className="p-2 text-muted">—</td><td className="p-2 text-muted">—</td><td className="p-2 text-muted">—</td><td className="p-2 text-muted">—</td>
                  </>
                ) : (
                  <>
                    <td className="p-2 tabular-nums">{s.ontime} / {s.total}</td>
                    <td className="p-2 tabular-nums text-sage">{fmtRate(s.ontime, s.total)}</td>
                    <td className="p-2 tabular-nums">{s.late} / {s.total}</td>
                    <td className={`p-2 tabular-nums ${LATE}`}>{fmtRate(s.late, s.total)}</td>
                    <td className="p-2 tabular-nums">{s.pending}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
