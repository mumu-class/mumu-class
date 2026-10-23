import { Link } from "react-router-dom";
import type { CheckinMark, CheckinTask } from "../../lib/types";
import { countTask, visibleMarks } from "./logic/stats";

const pad2 = (n: number) => String(n).padStart(2, "0");
const md = (date: string) => date.slice(5).replace("-", "/");

/** 一格任務：打卡台與封存紀錄共用。沒有傳 onTap 就是唯讀 */
export function TaskCard({ slot, task, onTap, onEdit, onAdd }: {
  slot: number;
  task?: CheckinTask;
  onTap?: (task: CheckinTask, mark: CheckinMark) => void;
  onEdit?: () => void;
  onAdd?: () => void;
}) {
  if (!task) {
    return (
      <section className="card flex min-h-40 flex-col items-center justify-center gap-3 p-3 text-muted">
        <span className="font-bold">{pad2(slot)}・尚未設定</span>
        {onAdd && <button type="button" className="btn-soft" onClick={onAdd}>＋ 新增任務</button>}
      </section>
    );
  }
  const marks = visibleMarks(task);
  const { done, total } = countTask(task.checkin_task_marks);
  const left = total - done;
  const missingLink = task.status === "open"
    ? `/checkin/missing?task=${task.id}`
    : `/checkin/missing?batch=${task.batch_id}&task=${task.id}`;
  return (
    <section className="card p-3" aria-label={task.name}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted tabular-nums">{pad2(slot)}</span>
        <h2 className="min-w-0 flex-1 truncate text-xl font-black">{task.name}</h2>
        <span className="shrink-0 font-bold tabular-nums">{done} / {total} 完成</span>
        {onEdit && <button type="button" className="btn px-2 py-1 text-sm" onClick={onEdit}>編輯</button>}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">
          {[task.task_date, task.due_date && `截止 ${md(task.due_date)}`, task.note].filter(Boolean).join("・")}
        </span>
        {left > 0 && <Link className="shrink-0 font-bold text-rose-ink" to={missingLink}>未完成 {left} 人 →</Link>}
      </div>
      <div className="my-2 h-1 rounded bg-line">
        <div className="h-1 rounded bg-sage" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {marks.map((m) => <NameButton key={m.student_id} mark={m} onTap={onTap && (() => onTap(task, m))} />)}
      </div>
    </section>
  );
}

/** 姓名按鈕：高 44pt、單點（設計 §3.3）。顏色之外一定有文字或符號 */
function NameButton({ mark, onTap }: { mark: CheckinMark; onTap?: () => void }) {
  const look = mark.state === "done" ? "border-sage-soft bg-sage-soft text-sage"
    : mark.state === "exempt" ? "border-line bg-paper text-muted" : "border-line bg-sheet";
  return (
    <button type="button" disabled={!onTap || mark.state === "exempt"} onClick={onTap} aria-pressed={mark.state === "done"}
      className={`flex h-11 min-w-0 touch-manipulation items-center gap-1 rounded-lg border px-1.5 text-sm font-bold disabled:cursor-default ${look}`}>
      <span className="text-xs opacity-70 tabular-nums">{pad2(mark.student_no)}</span>
      <span className="min-w-0 flex-1 truncate text-left">{mark.name_zh}</span>
      {mark.state === "done" && <span aria-label="已完成">✓</span>}
      {mark.state === "exempt" && <span>免</span>}
    </button>
  );
}
