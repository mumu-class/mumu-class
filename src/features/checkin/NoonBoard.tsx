import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import type { NoonTimelineEntry } from "../../lib/types";
import { useToast } from "../../shared/Toast";
import { ErrorBox, Loading } from "../../shared/ui";
import { isRejected, useCheckinSettings } from "./api";
import { useClassroom } from "./classroom";
import { buildNoonView, computeSummary, type NoonViewItem, type NoonViewStudent } from "./logic/noon";
import { DEFAULT_NOON_TIMELINE } from "./logic/noonPages";
import { createTapGuard } from "./logic/tapGuard";
import { useAfterCutoff, useServerNow } from "./NoonClock";
import { NoonRow, type NoonMode } from "./NoonRow";
import {
  useNoonArchiveCatchup, useNoonDay, useNoonItems, useNoonSetDone, useNoonSetLeave, useNoonSettle, useNoonTeacherFill,
  useNoonToday, useNoonUndo,
} from "./noonApi";

const MODES: { mode: NoonMode; label: string; hint: string }[] = [
  { mode: "tap", label: "打卡", hint: "" },
  { mode: "fill", label: "補登", hint: "點未完成的名字＝老師補登（算逾時）" },
  { mode: "leave", label: "請假", hint: "點名字＝切換整天請假" },
];

type LastAction = { eventId: number; templateId: string; studentId: string; label: string };

/** 中午打卡台（M05）與 17:00 後的唯讀狀態（M09）：5 項固定任務，點名字打卡，再點一次取消 */
export function NoonBoard() {
  const { cls, students } = useClassData();
  useNoonArchiveCatchup(cls.id);
  const today = useNoonToday(cls.id);
  const date = today.data?.date ?? "";
  const dayQ = useNoonDay(cls.id, date, true);
  const itemsQ = useNoonItems(cls.id);
  const settings = useCheckinSettings(cls.id);
  const serverNow = useServerNow(cls.id);
  const afterCutoff = useAfterCutoff(cls.id);
  const setDone = useNoonSetDone(cls.id, date);
  const fill = useNoonTeacherFill(cls.id, date);
  const setLeave = useNoonSetLeave(cls.id);
  const settle = useNoonSettle(cls.id, date);
  const undo = useNoonUndo(cls.id, date);
  const { canTeach } = useClassroom();
  const navigate = useNavigate();
  const toast = useToast();
  const [guard] = useState(() => createTapGuard());
  const [mode, setMode] = useState<NoonMode>("tap");
  // 復原只針對這台裝置最近一次的打卡、取消或補登，下一次操作後就換掉（設計 §6.3）
  const [last, setLast] = useState<LastAction | null>(null);

  // 教室模式自動上鎖時，老師的模式也一起收掉
  useEffect(() => { if (!canTeach) setMode("tap"); }, [canTeach]);

  const view = useMemo(() => buildNoonView(dayQ.data, itemsQ.data ?? [], students), [dayQ.data, itemsQ.data, students]);
  const summary = useMemo(() => computeSummary(view), [view]);

  const error = today.error ?? dayQ.error ?? itemsQ.error;
  if (error) return <ErrorBox error={error} />;
  if (!today.data || dayQ.isPending || itemsQ.isPending) return <Loading />;

  const archived = today.data.status === "archived" || dayQ.data?.status === "archived";
  const locked = archived || afterCutoff;
  // 17:00 之後老師只能用請假；不是老師就一律是打卡
  const effMode: NoonMode = !canTeach ? "tap" : locked && mode !== "leave" ? "tap" : mode;
  const timeline = settings.data === undefined && !settings.isError ? null
    : settings.data?.noon_timeline?.length ? settings.data.noon_timeline : DEFAULT_NOON_TIMELINE;

  function tap(item: NoonViewItem, s: NoonViewStudent) {
    if (!guard(`${item.template_id}:${s.student_id}`)) return;
    const ids = { templateId: item.template_id, studentId: s.student_id };
    const remember = (r: { event_id: number | null }) => {
      if (r.event_id) setLast({ eventId: r.event_id, ...ids, label: `${s.name_zh} ${item.name}` });
    };
    if (effMode === "leave") {
      setLeave.mutate({ date, studentId: s.student_id, onLeave: !s.on_leave }, {
        onSuccess: (r) => { if (isRejected(r)) toast(r.rejected); },
      });
      return;
    }
    if (locked || s.on_leave) return;
    const result = view.mark(item.template_id, s.student_id).result;
    if (effMode === "fill") {
      if (result !== "pending") return;
      fill.mutate(ids, { onSuccess: (r) => { if (isRejected(r)) toast(r.rejected); else remember(r); } });
      return;
    }
    // 送「設為完成／設為未完成」；at 用伺服器校正後的時間，樂觀更新用它判定準時或逾時
    setDone.mutate({ ...ids, done: result === "pending", at: serverNow() }, {
      onSuccess: (r) => { if (isRejected(r)) toast(r.rejected); else remember(r); },
    });
  }

  function runUndo() {
    if (!last || !guard("undo")) return;
    undo.mutate(last, {
      onSuccess: (r) => { if (isRejected(r)) toast(r.rejected); setLast(null); },
    });
  }

  function runSettle() {
    settle.mutate(undefined, {
      onSuccess: (r) => {
        if (isRejected(r)) toast(r.rejected);
        else navigate("/checkin/noon/summary");
      },
    });
  }

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {timeline && <Timeline entries={timeline} />}
        <Legend />
        {!locked && (
          <button type="button" className="btn max-w-64 px-3! py-1! text-sm" disabled={!last || undo.isPending} onClick={runUndo}>
            <span className="truncate">↶ {last ? `復原：${last.label}` : "復原上一步"}</span>
          </button>
        )}
        {canTeach && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-muted">{MODES.find((m) => m.mode === effMode)?.hint}</span>
            <div className="flex gap-1" role="group" aria-label="老師的模式">
              {MODES.map((m) => (
                <button key={m.mode} type="button" className={`${effMode === m.mode ? "chip-on" : "chip"} px-2.5! py-1! disabled:opacity-50`}
                  aria-pressed={effMode === m.mode} disabled={locked && m.mode !== "leave"} onClick={() => setMode(m.mode)}>{m.label}</button>
              ))}
            </div>
            {!archived && (
              <button type="button" className="btn-primary px-3! py-1! text-sm" disabled={settle.isPending} onClick={runSettle}>結算今日紀錄</button>
            )}
          </div>
        )}
        {(archived || !canTeach) && (
          <Link to="/checkin/noon/summary" className={`btn px-3! py-1! text-sm ${canTeach ? "" : "ml-auto"}`}>查看當日結算</Link>
        )}
      </div>
      {locked && (
        <p role="status" className="mb-1.5 text-sm font-bold text-orange-700">
          {archived ? "今天已於 17:00 封存・以下為唯讀紀錄" : "已過 17:00，等待封存・以下為唯讀紀錄"}
          {effMode !== "leave" && "，打卡與取消已鎖定"}
        </p>
      )}
      <div className="space-y-1.5">
        {view.items.map((item, i) => (
          <NoonRow key={item.template_id} item={item} students={view.students} mark={view.mark} counts={summary.items[i]}
            mode={effMode} locked={locked} onTap={tap} />
        ))}
        {view.items.length === 0 && <div className="card p-6 text-center text-muted">還沒有設定中午的固定任務，請老師到「名單、設定與備份」新增。</div>}
      </div>
    </>
  );
}

function Timeline({ entries }: { entries: NoonTimelineEntry[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 rounded-lg bg-sage-soft px-3 py-1 text-sm">
      <span className="text-xs text-muted">午餐時序</span>
      {entries.map((e) => (
        <span key={`${e.time}${e.label}`}><b className="text-sage tabular-nums">{e.time}</b> {e.label}</span>
      ))}
    </div>
  );
}

/** 圖例：顏色之外一定有符號或文字 */
function Legend() {
  const box = "mr-1 inline-flex h-4 min-w-4 items-center justify-center rounded border px-0.5 text-[10px] font-bold leading-none";
  return (
    <div className="flex items-center gap-2.5 text-xs text-muted" aria-label="圖例">
      <span><span className={`${box} border-sage-soft bg-sage-soft text-sage`}>✓</span>準時</span>
      <span><span className={`${box} border-orange-300 bg-orange-100 text-orange-800`}>逾</span>逾時</span>
      <span><span className={`${box} border-line bg-sheet`}>&nbsp;</span>未完成</span>
      <span><span className={`${box} border-line bg-paper`}>假</span>請假</span>
    </div>
  );
}
