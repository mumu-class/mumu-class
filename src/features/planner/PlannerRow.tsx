import { memo, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { PlannerColumn } from "../../lib/types";
import { WEEKDAYS, type DayRow } from "./logic/calendar";
import { autoCourseSocial, autoCourseZh, summaryItems, type DayValues } from "./logic/rules";

type Props = {
  row: DayRow;
  vals: DayValues;
  nextVals: DayValues | null;
  nextDow: number;
  hwCols: PlannerColumn[];
  fixed: Record<string, PlannerColumn | undefined>;
  onChange: (date: string, col: PlannerColumn, value: string) => void;
  failed: boolean;
};

function AutoTextarea({ value, onChange, disabled, placeholder, colKey, className = "" }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string; colKey: string; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(34, el.scrollHeight)}px`;
  }, [value]);
  return (
    <textarea ref={ref} rows={1} data-col={colKey} value={value} disabled={disabled} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`block w-full resize-none overflow-hidden bg-transparent px-1.5 py-1 text-left leading-snug outline-none focus:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40 ${className}`} />
  );
}

/** Enter 跳到下一個可輸入的上學日同一欄 */
function moveDown(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const col = e.currentTarget.dataset.col;
  let tr = e.currentTarget.closest("tr")?.nextElementSibling;
  while (tr) {
    const next = tr.querySelector<HTMLInputElement>(`input[data-col="${col}"]:not([disabled])`);
    if (next) { next.focus(); next.select(); return; }
    tr = tr.nextElementSibling;
  }
}

export const PlannerRow = memo(function PlannerRow({ row, vals, nextVals, nextDow, hwCols, fixed, onChange, failed }: Props) {
  const off = !row.isSchoolDay;
  const d = row.date;
  const bg = row.holiday ? "bg-rose/40" : row.isManualOff ? "bg-line/40" : "bg-sheet";
  const cell = `border-b border-r border-line align-top ${bg}`;
  const sticky = `sticky z-10 ${cell}`;
  const items = summaryItems(vals, nextVals ? { vals: nextVals, dow: nextDow } : null);
  const zhAuto = autoCourseZh(vals);
  const soAuto = autoCourseSocial(vals);
  const set = (key: string) => (v: string) => { const c = fixed[key]; if (c) onChange(row.key, c, v); };

  return (
    <tr id={`row-${row.key}`} data-month={row.month} data-week={row.week} className={`${row.dow === 1 ? "[&>td]:border-t-2 [&>td]:border-t-muted/40" : ""} ${failed ? "outline outline-2 outline-rose-ink" : ""}`}>
      <td className={`${sticky} left-0 w-12 text-center font-bold text-muted`}>{row.week}</td>
      <td className={`${sticky} left-12 w-[70px] text-center font-bold leading-tight`}>
        {d.getMonth() + 1}/{d.getDate()}<div className="text-xs font-normal text-muted">週{WEEKDAYS[row.dow]}</div>
      </td>
      <td className={`${sticky} left-[118px] w-[170px]`}>
        {(row.holiday || row.isManualOff) && <div className="px-1.5 pt-1 text-sm font-black text-rose-ink">{row.holiday || "自訂不上課日"}<span className="ml-1 rounded-full bg-rose px-1.5 text-xs">不上課</span></div>}
        <AutoTextarea colKey="重要行事曆" value={vals["重要行事曆"] ?? ""} onChange={set("重要行事曆")} placeholder={off ? "可補充校內行事" : "輸入校內行事"} />
      </td>
      <td className={`${sticky} left-[288px] w-[240px] bg-[#f6fbff] px-2 py-1 text-sm leading-snug`}>
        {items.length === 0 ? <span className="text-muted/60">—</span> : items.map((x, i) => (
          <div key={i}>{x.plain ? <b className="text-[#315a7d]">{x.text}</b> : <><b className="text-[#315a7d]">{x.label}</b>｜{x.text}</>}</div>
        ))}
      </td>
      <td className={`${sticky} left-[528px] w-11`}>
        <input data-col="堂" disabled={off} value={vals["堂"] ?? ""} onChange={(e) => set("堂")(e.target.value)} onKeyDown={moveDown}
          className="h-full min-h-16 w-full bg-transparent text-center outline-none focus:bg-gold-soft disabled:opacity-40" />
      </td>
      <td className={`${sticky} left-[572px] w-[220px] shadow-[4px_0_6px_-5px_rgba(0,0,0,.4)]`}>
        <div className="grid grid-cols-[36px_1fr] border-b border-line">
          <div className="flex items-center justify-center bg-[#f6f2ff] text-sm font-black">國語</div>
          <div>
            <AutoTextarea colKey="國語課程進度" disabled={off} value={vals["國語課程進度"] ?? ""} onChange={set("國語課程進度")} />
            {zhAuto.map((l, i) => <div key={i} className="px-1.5 pb-0.5 text-sm text-sage">{l}</div>)}
          </div>
        </div>
        <div className="grid grid-cols-[36px_1fr]">
          <div className="flex items-center justify-center bg-[#f6f2ff] text-sm font-black">社會</div>
          <div>
            <AutoTextarea colKey="社會課程進度" disabled={off} value={vals["社會課程進度"] ?? ""} onChange={set("社會課程進度")} />
            {soAuto.map((l, i) => <div key={i} className="px-1.5 pb-0.5 text-sm text-sage">{l}</div>)}
          </div>
        </div>
      </td>
      {hwCols.map((c) => (
        <td key={c.id} className={`${cell} ${["寫作", "字詞考", "國單元考", "社單元考", "其他", "備註"].includes(c.key) ? "min-w-[120px]" : "min-w-[92px]"}`}>
          {c.kind === "multiline" ? (
            <AutoTextarea colKey={c.key} disabled={off} value={vals[c.key] ?? ""} onChange={(v) => onChange(row.key, c, v)} />
          ) : (
            <input data-col={c.key} disabled={off} value={vals[c.key] ?? ""} onChange={(e) => onChange(row.key, c, e.target.value)} onKeyDown={moveDown}
              className="h-10 w-full bg-transparent px-1.5 text-center outline-none focus:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40" />
          )}
        </td>
      ))}
    </tr>
  );
});
