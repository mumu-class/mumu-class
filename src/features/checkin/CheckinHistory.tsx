import { useSearchParams } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import type { CheckinMark } from "../../lib/types";
import { ErrorBox, Loading } from "../../shared/ui";
import { useBatches, useStudentEvents, useStudentMarks } from "./api";
import { useXlsxExport } from "./exportXlsx";
import { eventText } from "./logic/events";
import { taskStudentRows } from "./logic/exportRows";
import { fmtDateTime, fmtTime } from "./logic/time";

const STATE_TEXT: Record<CheckinMark["state"], string> = { done: "已完成", pending: "未完成", exempt: "免交" };
const STATE_LOOK: Record<CheckinMark["state"], string> = { done: "text-sage", pending: "text-rose-ink", exempt: "text-muted" };

/** 學生歷程：摘要、逐項表格、完整操作歷程（設計 §7.3、第 23 題）。網址 ?student=…&scope=… */
export function CheckinHistory() {
  const { cls, allStudents } = useClassData();
  const [params, setParams] = useSearchParams();
  const sid = params.get("student") ?? allStudents.find((s) => !s.left_at)?.id ?? "";
  const scope = params.get("scope") ?? ""; // "" 全部、"open" 進行中、其他是封存批次的 id
  const marks = useStudentMarks(sid);
  const events = useStudentEvents(sid);
  const batches = useBatches(cls.id);
  const exporter = useXlsxExport();

  const error = marks.error || events.error || batches.error;
  if (error) return <ErrorBox error={error} />;
  if (marks.isLoading || events.isLoading || batches.isLoading) return <Loading />;

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const batchTitle = new Map((batches.data ?? []).map((b) => [b.id, b.title]));
  const rows = (marks.data ?? [])
    .filter((m) => !m.removed_at)
    .filter((m) => !scope || (scope === "open" ? m.checkin_tasks.status === "open" : m.checkin_tasks.batch_id === scope))
    .sort((a, b) => b.checkin_tasks.task_date.localeCompare(a.checkin_tasks.task_date) || a.checkin_tasks.slot - b.checkin_tasks.slot);
  const inScope = new Set(rows.map((m) => m.task_id));
  const evs = (events.data ?? []).filter((e) => !scope || (e.task_id !== null && inScope.has(e.task_id)));
  const count = (state: CheckinMark["state"]) => rows.filter((m) => m.state === state).length;
  const student = allStudents.find((s) => s.id === sid);

  return (
    <>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <select aria-label="學生" className="input" value={sid} onChange={(e) => set("student", e.target.value)}>
          {allStudents.map((s) => <option key={s.id} value={s.id}>{s.student_no} {s.name_zh}{s.left_at ? "（已轉出）" : ""}</option>)}
        </select>
        <select aria-label="範圍" className="input" value={scope} onChange={(e) => set("scope", e.target.value)}>
          <option value="">全部任務</option>
          <option value="open">進行中的任務</option>
          {batches.data?.map((b) => <option key={b.id} value={b.id}>{b.title}{b.kind === "single" ? "（單項）" : ""}</option>)}
        </select>
      </div>

      <div className="card mb-3 flex flex-wrap items-baseline gap-x-8 gap-y-1 p-4">
        <span className="text-xl font-black">{student?.student_no} {student?.name_zh}</span>
        <button type="button" className="btn order-last ml-auto" disabled={rows.length === 0 || exporter.busy}
          onClick={() => exporter.run(`一般任務_${String(student?.student_no ?? "").padStart(2, "0")}${student?.name_zh ?? ""}.xlsx`, () => [taskStudentRows(rows, batchTitle)])}>匯出 Excel</button>
        <span className="text-xl font-bold text-sage">已完成 {count("done")} 項</span>
        <span className="text-xl font-bold text-rose-ink">未完成 {count("pending")} 項</span>
        {count("exempt") > 0 && <span className="text-xl font-bold text-muted">免交 {count("exempt")} 項</span>}
      </div>

      <div className="card mb-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left">
          <thead>
            <tr className="bg-sage-soft text-sm text-sage">
              <th className="p-2">日期</th><th className="p-2">任務</th><th className="p-2">狀態</th><th className="p-2">打卡時間</th><th className="p-2">來源</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-muted">沒有紀錄</td></tr>
            ) : rows.map((m) => (
              <tr key={m.task_id} className="border-t border-line">
                <td className="p-2 tabular-nums">{m.checkin_tasks.task_date}</td>
                <td className="p-2">{m.checkin_tasks.name}</td>
                <td className={`p-2 font-bold ${STATE_LOOK[m.state]}`}>{STATE_TEXT[m.state]}</td>
                <td className="p-2 tabular-nums">{m.done_at ? fmtTime(m.done_at) : "—"}</td>
                <td className="p-2">{m.checkin_tasks.status === "open" ? "進行中" : batchTitle.get(m.checkin_tasks.batch_id ?? "") ?? "封存"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-black">打卡與取消歷程</h2>
      <ul className="card divide-y divide-line">
        {evs.length === 0 ? <li className="p-3 text-muted">沒有操作紀錄</li> : evs.map((e) => (
          <li key={e.id} className="flex gap-3 p-3">
            <span className="shrink-0 tabular-nums text-muted">{fmtDateTime(e.at)}</span>
            <span>{eventText(e)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
