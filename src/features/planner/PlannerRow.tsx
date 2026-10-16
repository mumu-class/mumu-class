import { memo, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { PlannerColumn } from "../../lib/types";
import { WEEKDAYS, type DayRow } from "./logic/calendar";
import { autoCourseSocial, autoCourseZh, summaryItems, type DayValues, type SummaryItem } from "./logic/rules";

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

/** 內容通常比較長、給寬一點的作業欄 */
const WIDE = new Set(["寫作", "字詞考", "國單元考", "社單元考", "其他", "其他考試"]);

function AutoTextarea({ value, onChange, onKeyDown, disabled, placeholder, colKey, className = "" }: {
  value: string; onChange: (v: string) => void; onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean; placeholder?: string; colKey: string; className?: string;
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
      onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
      className={`block w-full resize-none overflow-hidden bg-transparent px-1.5 py-1 text-left leading-snug outline-none focus:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40 ${className}`} />
  );
}

/**
 * 作業格的按鍵：Enter 跳到下一個可輸入的上學日同一欄；Alt／Option＋Enter 或 Shift＋Enter 在格子內換行。
 * 中文輸入法選字時的 Enter 不處理（Safari 選字確認時 isComposing 為 false，但 keyCode 為 229）。
 */
function cellKeys(onChange: (v: string) => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    const el = e.currentTarget;
    if (e.altKey || e.shiftKey) {
      const { selectionStart: s, selectionEnd: t, value } = el;
      onChange(`${value.slice(0, s)}\n${value.slice(t)}`);
      requestAnimationFrame(() => el.setSelectionRange(s + 1, s + 1));
      return;
    }
    let tr = el.closest("tr")?.nextElementSibling;
    while (tr) {
      const next = tr.querySelector<HTMLTextAreaElement>(`textarea[data-col="${el.dataset.col}"]:not([disabled])`);
      if (next) { next.focus(); next.select(); return; }
      tr = tr.nextElementSibling;
    }
  };
}

function SummaryBlock({ label, items, divider }: { label: string; items: SummaryItem[]; divider?: boolean }) {
  return (
    <div className={`grid grid-cols-[32px_1fr] ${divider ? "border-b border-line" : ""}`}>
      <div className="flex items-center justify-center bg-[#e3effa] text-xs font-black text-[#315a7d]">{label}</div>
      <div className="px-2 py-1">
        {items.length === 0 ? <span className="text-muted/60">—</span> : items.map((x, i) => (
          <div key={i}>{x.plain ? <b className="text-[#315a7d]">{x.text}</b> : <><b className="text-[#315a7d]">{x.label}</b>｜{x.text}</>}</div>
        ))}
      </div>
    </div>
  );
}

export const PlannerRow = memo(function PlannerRow({ row, vals, nextVals, nextDow, hwCols, fixed, onChange, failed }: Props) {
  const off = !row.isSchoolDay;
  const d = row.date;
  const bg = row.holiday ? "bg-rose/40" : row.isManualOff ? "bg-line/40" : "bg-sheet";
  const cell = `border-b border-r border-line align-top ${bg}`;
  const sum = summaryItems(vals, nextVals ? { vals: nextVals, dow: nextDow } : null);
  const zhAuto = autoCourseZh(vals);
  const soAuto = autoCourseSocial(vals);
  const set = (key: string) => (v: string) => { const c = fixed[key]; if (c) onChange(row.key, c, v); };

  return (
    <tr id={`row-${row.key}`} data-month={row.month} data-week={row.week} className={`${row.dow === 1 ? "[&>td]:border-t-2 [&>td]:border-t-muted/40" : ""} ${failed ? "outline outline-2 outline-rose-ink" : ""}`}>
      <td className={`${cell} hidden w-10 text-center font-bold text-muted md:sticky md:left-0 md:z-10 md:table-cell`}>{row.week}</td>
      <td className={`${cell} sticky left-0 z-10 w-14 min-w-14 text-center font-bold leading-tight shadow-[4px_0_6px_-5px_rgba(0,0,0,.4)] md:left-10 md:shadow-none`}>
        <div className="text-xs font-normal text-muted md:hidden">第{row.week}週</div>
        {d.getMonth() + 1}/{d.getDate()}<div className="text-xs font-normal text-muted">週{WEEKDAYS[row.dow]}</div>
      </td>
      <td className={`${cell} w-[220px] min-w-[220px] bg-[#f6fbff] text-sm leading-snug md:sticky md:left-24 md:z-10 md:shadow-[4px_0_6px_-5px_rgba(0,0,0,.4)]`}>
        <SummaryBlock label="作業" items={sum.homework} divider />
        <SummaryBlock label="訂簽" items={sum.sign} />
      </td>
      <td className={`${cell} w-[140px] min-w-[140px]`}>
        {(row.holiday || row.isManualOff) && <div className="px-1.5 pt-1 text-sm font-black text-rose-ink">{row.holiday || "自訂不上課日"}<span className="ml-1 rounded-full bg-rose px-1.5 text-xs">不上課</span></div>}
        <AutoTextarea colKey="重要行事曆" value={vals["重要行事曆"] ?? ""} onChange={set("重要行事曆")} placeholder={off ? "可補充校內行事" : "輸入校內行事"} />
      </td>
      <td className={`${cell} w-[180px] min-w-[180px]`}>
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
      {hwCols.map((c) => {
        const change = (v: string) => onChange(row.key, c, v);
        return (
          <td key={c.id} className={`${cell} ${WIDE.has(c.key) ? "w-[100px] min-w-[100px]" : "w-[72px] min-w-[72px]"}`}>
            <AutoTextarea colKey={c.key} disabled={off} value={vals[c.key] ?? ""} onChange={change} onKeyDown={cellKeys(change)} />
          </td>
        );
      })}
    </tr>
  );
});
