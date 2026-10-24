import type { NoonSummaryItem } from "../../lib/types";
import type { NoonMarkState, NoonViewItem, NoonViewStudent } from "./logic/noon";

export type NoonMode = "tap" | "fill" | "leave";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 中午打卡台的一列：左邊任務名稱、截止時間與計數，右邊全班名字（設計 §7.2）。沒有傳 onTap 的名字不能點 */
export function NoonRow({ item, students, mark, counts, mode, locked, onTap }: {
  item: NoonViewItem;
  students: NoonViewStudent[];
  mark: (templateId: string, studentId: string) => NoonMarkState;
  /** computeSummary 算出的這一列計數 */
  counts: NoonSummaryItem | undefined;
  mode: NoonMode;
  /** 17:00 之後或已封存：打卡與補登都不能點，只有請假模式可以 */
  locked: boolean;
  onTap: (item: NoonViewItem, student: NoonViewStudent) => void;
}) {
  return (
    <section className="card px-2 py-1 sm:flex sm:gap-2" aria-label={item.name}>
      <div className="px-1 py-0.5 sm:w-[150px] sm:shrink-0">
        <h2 className="truncate text-base font-black leading-tight">{item.name}</h2>
        <div className="text-sm font-bold leading-tight text-sage">{item.deadline} 前完成</div>
        <div className="text-xs leading-tight text-muted tabular-nums">
          準時 {counts?.ontime ?? 0}・逾時 {counts?.late ?? 0}・未完 {counts?.pending ?? 0}
        </div>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-5 content-start gap-1.5 sm:grid-cols-8 lg:grid-cols-10">
        {students.map((s) => {
          const m = mark(item.template_id, s.student_id);
          const enabled = mode === "leave" || (!locked && !s.on_leave && (mode === "tap" || m.result === "pending"));
          return <NameButton key={s.student_id} student={s} mark={m} mode={mode} onTap={enabled ? () => onTap(item, s) : undefined} />;
        })}
      </div>
    </section>
  );
}

const STATUS_TEXT = { ontime: "準時", late: "逾時", pending: "未完成" } as const;

/** 姓名按鈕：高 32pt、單點。準時綠底＋✓、逾時橘底＋「逾」、未完成白、請假灰＋「假」；符號放右上角，不佔姓名的寬度 */
function NameButton({ student, mark, mode, onTap }: {
  student: NoonViewStudent; mark: NoonMarkState; mode: NoonMode; onTap?: () => void;
}) {
  const leave = student.on_leave;
  const look = leave ? "border-line bg-paper text-muted"
    : mark.result === "ontime" ? "border-sage-soft bg-sage-soft text-sage"
    : mark.result === "late" ? "border-orange-300 bg-orange-100 text-orange-800" : "border-line bg-sheet";
  const symbol = leave ? "假" : mark.result === "ontime" ? "✓" : mark.result === "late" ? "逾" : null;
  const status = leave ? "請假" : STATUS_TEXT[mark.result];
  return (
    <button type="button" disabled={!onTap} onClick={onTap}
      aria-pressed={mode === "leave" ? leave : mark.result !== "pending"}
      aria-label={`${student.student_no} ${student.name_zh}，${status}`}
      className={`relative flex h-8 min-w-0 touch-manipulation items-center gap-1 rounded-md border px-1 text-xs font-bold disabled:cursor-default sm:text-sm ${look}`}>
      <span className="hidden text-[11px] opacity-70 tabular-nums sm:inline">{pad2(student.student_no)}</span>
      <span className="min-w-0 flex-1 truncate text-left">{student.name_zh}</span>
      {symbol && <span aria-hidden className="absolute right-0.5 top-0 text-[10px] leading-3">{symbol}</span>}
    </button>
  );
}
