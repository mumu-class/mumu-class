import { useState } from "react";
import { Link } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import type { NoonDayRow } from "../../lib/types";
import { useToast } from "../../shared/Toast";
import { Empty, ErrorBox, Loading } from "../../shared/ui";
import { isRejected } from "./api";
import { useClassroom } from "./classroom";
import { fmtRate } from "./logic/noon";
import { fmtDateTime, fmtTime } from "./logic/time";
import { useNoonArchiveCatchup, useNoonDay, useNoonDays, useNoonSetLeave } from "./noonApi";

/** 每日封存（M08）：已封存的日子，新到舊。老師可以展開一天補標請假（設計 §7.3；17:00 後請假是唯一能改的） */
export function NoonArchive() {
  const { cls } = useClassData();
  const { canTeach } = useClassroom();
  const days = useNoonDays(cls.id);
  const [openId, setOpenId] = useState<string | null>(null);
  useNoonArchiveCatchup(cls.id);

  if (days.error) return <ErrorBox error={days.error} />;
  if (days.isLoading) return <Loading />;

  return (
    <>
      <p className="mb-3 text-sm text-muted">每天 17:00 保留最終結果，隔天使用新的固定任務。封存後打卡不能再改，只有請假可以補標。</p>
      {!days.data?.length ? (
        <Empty>還沒有封存紀錄。每天 17:00 會自動封存當天的中午紀錄。</Empty>
      ) : (
        <div className="space-y-3">
          {days.data.map((d) => <DayCard key={d.id} day={d} canTeach={canTeach} open={openId === d.id} onToggle={() => setOpenId(openId === d.id ? null : d.id)} />)}
        </div>
      )}
    </>
  );
}

function DayCard({ day, canTeach, open, onToggle }: { day: NoonDayRow; canTeach: boolean; open: boolean; onToggle: () => void }) {
  const o = day.final_summary!.overall;
  const catchup = day.archived_by === "catchup";
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div>
          <h2 className="text-xl font-black">{day.date} 中午任務紀錄</h2>
          <p className="mt-1 text-muted">
            {o.students - o.leave_students} 位學生・{o.items} 項任務・準時 {fmtRate(o.ontime, o.total)}・<span className="text-orange-700">逾時 {fmtRate(o.late, o.total)}</span>
            {o.leave_students > 0 && `・請假 ${o.leave_students} 位`}
          </p>
        </div>
        <span className="ml-auto flex gap-2">
          {canTeach && <button type="button" className="btn" aria-expanded={open} onClick={onToggle}>{open ? "收起" : "修改請假"}</button>}
          <Link className="btn" to={`/checkin/noon/summary?date=${day.date}`}>查看每日結算</Link>
        </span>
      </div>
      <p className={`mt-2 text-sm ${catchup ? "font-bold text-orange-700" : "text-muted"}`}>
        排定封存 {day.date} {fmtTime(day.scheduled_archive_at)}
        <span className="mx-2">｜</span>
        {catchup ? `於 ${fmtDateTime(day.archived_at!)} 開啟時補封存` : `實際執行 ${fmtDateTime(day.archived_at!)}`}
      </p>
      {day.revised_at && <p className="mt-1 text-sm text-muted">已於 {fmtDateTime(day.revised_at)} 修改請假</p>}
      {open && canTeach && <LeaveEditor date={day.date} />}
    </section>
  );
}

/** 展開後的名單：每人一顆切換鈕。伺服器會重算這一天的最終結果並記下修改時間 */
function LeaveEditor({ date }: { date: string }) {
  const { cls } = useClassData();
  const toast = useToast();
  const q = useNoonDay(cls.id, date);
  const setLeave = useNoonSetLeave(cls.id);
  const [busy, setBusy] = useState<string | null>(null);

  if (q.error) return <div className="mt-3"><ErrorBox error={q.error} /></div>;
  if (q.isLoading) return <Loading />;
  const students = (q.data?.noon_day_students ?? []).filter((s) => !s.removed_at).sort((a, b) => a.student_no - b.student_no);

  function toggle(studentId: string, name: string, onLeave: boolean) {
    setBusy(studentId);
    setLeave.mutate({ date, studentId, onLeave }, {
      onSuccess: (r) => toast(isRejected(r) ? r.rejected : `${name} ${onLeave ? "已標為請假" : "已取消請假"}`),
      onError: () => toast("儲存失敗，請再試一次"),
      onSettled: () => setBusy(null),
    });
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="mb-2 text-sm text-muted">點名字切換這天的請假，切換後會重算這一天的最終結果。</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {students.map((s) => (
          <button key={s.student_id} type="button" aria-pressed={s.on_leave} disabled={busy === s.student_id}
            className={`btn justify-start ${s.on_leave ? "bg-line" : ""}`}
            onClick={() => toggle(s.student_id, s.name_zh, !s.on_leave)}>
            <span className="tabular-nums text-muted">{s.student_no}</span> {s.name_zh}{s.on_leave && <span className="ml-auto text-sm text-muted">假</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
