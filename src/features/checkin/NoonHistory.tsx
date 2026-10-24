import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { Empty, ErrorBox, Loading } from "../../shared/ui";
import { eventText } from "./logic/events";
import { buildNoonView, computeSummary, fmtRate } from "./logic/noon";
import { dateOptions } from "./logic/noonPages";
import { fmtTime } from "./logic/time";
import { useNoonArchiveCatchup, useNoonDay, useNoonDays, useNoonStudentEvents, useNoonToday } from "./noonApi";

type Status = "ontime" | "late" | "pending" | "leave";
const STATUS_TEXT: Record<Status, string> = { ontime: "準時完成", late: "逾時完成", pending: "未完成", leave: "請假" };
const STATUS_LOOK: Record<Status, string> = { ontime: "text-sage", late: "text-orange-700", pending: "text-rose-ink", leave: "text-muted" };

/** 學生歷程（中午，M07）：某一天各項任務的狀態與打卡時間，下面是完整的操作歷程。網址 ?student=…&date=… */
export function NoonHistory() {
  const { cls, allStudents } = useClassData();
  useNoonArchiveCatchup(cls.id);
  const [params, setParams] = useSearchParams();
  const sid = params.get("student") ?? allStudents.find((s) => !s.left_at)?.id ?? "";
  const today = useNoonToday(cls.id);
  const days = useNoonDays(cls.id);
  const date = params.get("date") || today.data?.date || "";
  const day = useNoonDay(cls.id, date);
  const events = useNoonStudentEvents(sid);

  // 用當天的快照畫，才看得到請假和「沒有任何打卡」的任務；當天沒有紀錄就是 null
  const view = useMemo(() => (day.data ? buildNoonView(day.data, [], []) : null), [day.data]);
  const stat = useMemo(() => (view ? computeSummary(view).students.find((s) => s.student_id === sid) : undefined), [view, sid]);

  const error = today.error || days.error || day.error || events.error;
  if (error) return <ErrorBox error={error} />;
  if (today.isLoading || days.isLoading || !today.data) return <Loading />;

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && !(key === "date" && value === today.data.date)) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const student = allStudents.find((s) => s.id === sid);
  const options = dateOptions(today.data.date, (days.data ?? []).map((d) => d.date), date, date === today.data.date && day.data?.status === "archived");
  const total = stat?.total ?? 0;

  const rows = view && stat ? view.items.map((it) => {
    const m = view.mark(it.template_id, sid);
    const status: Status = stat.on_leave ? "leave" : m.result;
    return { ...it, status, m };
  }) : [];

  return (
    <>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <select aria-label="學生" className="input" value={sid} onChange={(e) => set("student", e.target.value)}>
          {allStudents.map((s) => <option key={s.id} value={s.id}>{s.student_no} {s.name_zh}{s.left_at ? "（已轉出）" : ""}</option>)}
        </select>
        <select aria-label="日期" className="input" value={date} onChange={(e) => set("date", e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {day.isLoading ? <Loading /> : !day.data ? (
        <Empty>這天沒有中午紀錄。</Empty>
      ) : !stat ? (
        <Empty>這位學生不在 {date} 的中午名單內。</Empty>
      ) : (
        <>
          <div className="card mb-3 flex flex-wrap items-baseline gap-x-8 gap-y-1 p-4">
            <span className="text-xl font-black">{student?.student_no} {student?.name_zh}</span>
            {stat.on_leave ? <span className="text-xl font-bold text-muted">這天請假，不計算比率</span> : (
              <>
                <span className="text-xl font-bold text-sage">準時 {fmtRate(stat.ontime, total)}　{stat.ontime} / {total}</span>
                <span className="text-xl font-bold text-orange-700">逾時 {fmtRate(stat.late, total)}　{stat.late} / {total}</span>
                <span className="text-muted">未完成 {stat.pending} 項・總完成率 {fmtRate(stat.ontime + stat.late, total)}</span>
              </>
            )}
            {day.data.status === "archived" && <span className="chip ml-auto">已封存</span>}
          </div>

          <div className="card mb-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left">
              <thead>
                <tr className="bg-sage-soft text-sm text-sage">
                  <th className="p-2">任務</th><th className="p-2">截止時間</th><th className="p-2">完成狀態</th><th className="p-2">打卡時間</th><th className="p-2">來源</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.template_id} className="border-t border-line">
                    <td className="p-2 font-bold">{r.name}</td>
                    <td className="p-2 tabular-nums">{r.deadline}</td>
                    <td className={`p-2 font-bold ${STATUS_LOOK[r.status]}`}>{STATUS_TEXT[r.status]}</td>
                    <td className="p-2 tabular-nums">{r.m.done_at ? fmtTime(r.m.done_at) : "—"}</td>
                    <td className="p-2">{r.m.source === "teacher" ? "老師補登" : r.m.source === "student" ? "學生打卡" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="mb-2 text-lg font-black">打卡與取消歷程</h2>
      {events.isLoading ? <Loading /> : (
        <ul className="card divide-y divide-line">
          {!events.data?.length ? <li className="p-3 text-muted">沒有操作紀錄</li> : events.data.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 p-3">
              <span className="shrink-0 tabular-nums text-muted">{e.noon_days?.date ?? ""} {fmtTime(e.at)}</span>
              <span>{eventText(e)}</span>
              {e.actor === "teacher" && <span className="chip py-0">老師</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
