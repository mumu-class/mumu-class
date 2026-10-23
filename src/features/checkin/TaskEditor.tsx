import { useState } from "react";
import { useClassData } from "../../lib/classData";
import type { CheckinTask } from "../../lib/types";
import { Dialog } from "../../shared/Dialog";
import { useToast } from "../../shared/Toast";
import { isRejected, useArchiveTasks, useCreateTask, useSetExempt, useUpdateTask } from "./api";
import { visibleMarks } from "./logic/stats";
import { taipeiToday } from "./logic/time";

/** 新增或編輯一格任務、標免交、單項封存（設計 §7.3、第 24 題）。只有老師能開 */
export function TaskEditor({ slot, task, onClose }: { slot: number; task?: CheckinTask; onClose: () => void }) {
  const { cls } = useClassData();
  const toast = useToast();
  const create = useCreateTask(cls.id);
  const update = useUpdateTask(cls.id);
  const setExempt = useSetExempt(cls.id);
  const archive = useArchiveTasks();
  const [name, setName] = useState(task?.name ?? "");
  const [taskDate, setTaskDate] = useState(task?.task_date ?? taipeiToday());
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [confirmArchive, setConfirmArchive] = useState(false);

  function save() {
    const fields = { name: name.trim(), task_date: taskDate, due_date: dueDate || null, note: note.trim() };
    if (!fields.name) { toast("請輸入任務名稱"); return; }
    if (!task) {
      create.mutate({ slot, name: fields.name, taskDate: fields.task_date, dueDate: fields.due_date, note: fields.note }, {
        onSuccess: (r) => { if (isRejected(r)) toast(r.rejected); else onClose(); },
      });
    } else {
      update.mutate({ id: task.id, patch: fields }, { onSuccess: onClose });
    }
  }

  function archiveOne() {
    if (!task) return;
    archive.mutate({ taskIds: [task.id], kind: "single" }, {
      onSuccess: (r) => {
        if (isRejected(r)) { toast(r.rejected); return; }
        toast(`已封存「${task.name}」，可在「封存紀錄」查看`);
        onClose();
      },
    });
  }

  return (
    <Dialog title={task ? `編輯任務 ${slot}` : `新增任務 ${slot}`} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="task-name">任務名稱</label>
          <input id="task-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：閱讀認證" />
        </div>
        <div>
          <label className="label" htmlFor="task-date">日期</label>
          <input id="task-date" type="date" className="input" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="task-due">截止日（選填，只顯示）</label>
          <input id="task-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="task-note">說明（選填）</label>
          <input id="task-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <button type="button" className="btn-primary mt-3 w-full py-3" disabled={create.isPending || update.isPending} onClick={save}>
        {task ? "儲存" : "建立任務"}
      </button>

      {task && (
        <>
          <h3 className="mt-5 font-black">免交</h3>
          <p className="mb-2 text-sm text-muted">點名字切換。免交的同學不算進應完成數，也不會出現在缺交總覽。</p>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {visibleMarks(task).map((m) => (
              <button key={m.student_id} type="button" aria-pressed={m.state === "exempt"}
                className={m.state === "exempt" ? "chip-on" : "chip"}
                onClick={() => setExempt.mutate(
                  { taskId: task.id, studentId: m.student_id, exempt: m.state !== "exempt" },
                  { onSuccess: (r) => { if (isRejected(r)) toast(r.rejected); } },
                )}>
                {m.student_no} {m.name_zh}{m.state === "exempt" ? "・免" : ""}
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            {confirmArchive ? (
              <div className="space-y-2">
                <p className="text-sm">封存「{task.name}」後不能再修改，這一格會清空；紀錄可以在「封存紀錄」查看。</p>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn" onClick={() => setConfirmArchive(false)}>取消</button>
                  <button type="button" className="btn-primary" disabled={archive.isPending} onClick={archiveOne}>確定封存這一項</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn w-full" onClick={() => setConfirmArchive(true)}>封存這一項</button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
