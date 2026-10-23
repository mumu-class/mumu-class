import { useState } from "react";
import { useClassData } from "../../lib/classData";
import type { CheckinMark, CheckinTask } from "../../lib/types";
import { Dialog } from "../../shared/Dialog";
import { useToast } from "../../shared/Toast";
import { ErrorBox, Loading } from "../../shared/ui";
import { isRejected, useArchiveTasks, useOpenTasks, useSetDone, useUndo } from "./api";
import { useClassroom } from "./classroom";
import { withLiveNames } from "./logic/stats";
import { createTapGuard } from "./logic/tapGuard";
import { TaskCard } from "./TaskCard";
import { TaskEditor } from "./TaskEditor";

const SLOTS = [1, 2, 3, 4];
type LastAction = { eventId: number; taskId: string; studentId: string; label: string };

/** 一般任務打卡台（M01）：最多 4 項任務，點名字打卡，再點一次取消 */
export function CheckinBoard() {
  const { cls, allStudents } = useClassData();
  const q = useOpenTasks(cls.id, true);
  const setDone = useSetDone(cls.id);
  const undo = useUndo(cls.id);
  const archive = useArchiveTasks();
  const { canTeach } = useClassroom();
  const toast = useToast();
  const [guard] = useState(() => createTapGuard());
  // 復原只針對這台裝置最近一次的打卡或取消，下一次操作後就換掉（設計 §6.3）
  const [last, setLast] = useState<LastAction | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [confirmRound, setConfirmRound] = useState(false);

  if (q.error) return <ErrorBox error={q.error} />;
  if (q.isLoading) return <Loading />;
  const tasks = (q.data ?? []).map((t) => withLiveNames(t, allStudents));
  const bySlot = new Map(tasks.map((t) => [t.slot, t]));

  function tap(task: CheckinTask, mark: CheckinMark) {
    if (!guard(`${task.id}:${mark.student_id}`)) return;
    setDone.mutate({ taskId: task.id, studentId: mark.student_id, done: mark.state !== "done" }, {
      onSuccess: (r) => {
        if (isRejected(r)) toast(r.rejected);
        else if (r.event_id) setLast({ eventId: r.event_id, taskId: task.id, studentId: mark.student_id, label: `${mark.name_zh} ${task.name}` });
      },
    });
  }

  function runUndo() {
    if (!last || !guard("undo")) return;
    undo.mutate(last, {
      onSuccess: (r) => {
        if (isRejected(r)) toast(r.rejected);
        setLast(null);
      },
    });
  }

  function archiveRound() {
    archive.mutate({ taskIds: tasks.map((t) => t.id), kind: "round" }, {
      onSuccess: (r) => {
        if (isRejected(r)) toast(r.rejected);
        else { toast("已封存本輪紀錄，可在「封存紀錄」查看"); setLast(null); }
        setConfirmRound(false);
      },
    });
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn py-1" disabled={!last || undo.isPending} onClick={runUndo}>
          ↶ {last ? `復原：${last.label}` : "復原上一步"}
        </button>
        <span className="text-xs text-muted">綠色 ✓ 已完成・白色 未完成・灰色「免」免交・點名字打卡，再點一次取消</span>
        {canTeach && tasks.length > 0 && (
          <button type="button" className="btn-primary ml-auto py-1" onClick={() => setConfirmRound(true)}>封存本輪紀錄</button>
        )}
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {SLOTS.map((slot) => (
          <TaskCard key={slot} slot={slot} task={bySlot.get(slot)} onTap={tap}
            onEdit={canTeach ? () => setEditing(slot) : undefined}
            onAdd={canTeach ? () => setEditing(slot) : undefined} />
        ))}
      </div>

      {/* 教室模式自動上鎖時，老師的對話框也一起關掉 */}
      {canTeach && editing !== null && (
        <TaskEditor key={editing} slot={editing} task={bySlot.get(editing)} onClose={() => setEditing(null)} />
      )}
      {canTeach && confirmRound && (
        <Dialog title="封存本輪紀錄" onClose={() => setConfirmRound(false)}>
          <p>要封存這 {tasks.length} 項任務嗎？</p>
          <p className="mt-1 font-bold">{tasks.map((t) => t.name).join("、")}</p>
          <p className="mt-2 text-sm text-muted">封存後不能再修改，打卡台會清空；紀錄可以在「封存紀錄」查看。</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setConfirmRound(false)}>取消</button>
            <button type="button" className="btn-primary" disabled={archive.isPending} onClick={archiveRound}>確定封存</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
