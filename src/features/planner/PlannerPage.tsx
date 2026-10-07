import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useClassData } from "../../lib/classData";
import type { PlannerColumn } from "../../lib/types";
import { downloadText, toCsv } from "../coins/logic/money";
import { ErrorBox, Loading, PageTitle } from "../../shared/ui";
import { useColumns, useEntries, useHolidays, useOffDays, useSaveCell, useSemester, useSemesterMutations } from "./api";
import { buildRows, nextSchoolDay, WEEKDAYS } from "./logic/calendar";
import { autoCourseSocial, autoCourseZh, summaryItems, summaryText, type DayValues } from "./logic/rules";
import { PlannerRow } from "./PlannerRow";

const GROUP_BG: Record<string, string> = {
  "國語｜核心": "bg-[#eaf3ff]", "國語｜補充與複習": "bg-[#fff7df]", "社會": "bg-[#eaf8ef]", "其他": "bg-[#fff0f3]",
};

export function PlannerPage() {
  const { cls } = useClassData();
  const sem = useSemester(cls.id);
  const cols = useColumns();
  const hol = useHolidays();
  const off = useOffDays(sem.data?.id);
  const entries = useEntries(sem.data?.id);
  const err = sem.error || cols.error || hol.error || off.error || entries.error;
  if (err) return <ErrorBox error={err} />;
  if (!sem.data || !cols.data || !hol.data || !off.data || !entries.data) return <Loading />;
  return <PlannerTable key={sem.data.id} />;
}

function PlannerTable() {
  const { cls } = useClassData();
  const sem = useSemester(cls.id).data!;
  const columns = useColumns().data!;
  const holidays = useHolidays().data!;
  const offDays = useOffDays(sem.id).data!;
  const entries = useEntries(sem.id).data!;
  const saveCell = useSaveCell(sem.id).mutate; // mutate 是穩定的函式，讓 memo 的列不會因每次 render 重繪
  const semM = useSemesterMutations(cls.id, sem.id);
  const wrapRef = useRef<HTMLDivElement>(null);

  const colById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const fixed = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c])) as Record<string, PlannerColumn | undefined>, [columns]);
  const hwCols = useMemo(() => columns.filter((c) => c.kind === "text" || c.kind === "multiline"), [columns]);

  // 畫面上的格子內容：日期 → 欄位 key → 值。只在載入時從資料庫初始化一次，之後以畫面為準、逐格寫回。
  const [values, setValues] = useState<Record<string, DayValues>>(() => {
    const v: Record<string, DayValues> = {};
    for (const e of entries) { const c = colById.get(e.column_id); if (c) (v[e.date] ??= {})[c.key] = e.value; }
    return v;
  });
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, { t: number; run: () => void }>());

  const onChange = useCallback((date: string, col: PlannerColumn, value: string) => {
    setValues((prev) => ({ ...prev, [date]: { ...prev[date], [col.key]: value } }));
    const k = `${date}|${col.id}`;
    const old = timers.current.get(k);
    if (old) window.clearTimeout(old.t);
    const run = () => {
      timers.current.delete(k);
      saveCell({ date, columnId: col.id, value: value.trim() === "" ? "" : value }, {
        onSuccess: () => setFailed((f) => { if (!f.has(date)) return f; const n = new Set(f); n.delete(date); return n; }),
        onError: () => setFailed((f) => new Set(f).add(date)),
      });
    };
    timers.current.set(k, { t: window.setTimeout(run, 400), run });
  }, [saveCell]);

  // 離開頁面前把還沒送出的格子立刻送出
  useEffect(() => {
    const pending = timers.current;
    const warn = (e: BeforeUnloadEvent) => { if (pending.size) { pending.forEach((p) => { window.clearTimeout(p.t); p.run(); }); e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); pending.forEach((p) => { window.clearTimeout(p.t); p.run(); }); };
  }, []);

  const offSet = useMemo(() => new Set(offDays.map((o) => o.date)), [offDays]);
  const rows = useMemo(() => buildRows(sem.start_date, sem.end_date, holidays, offSet), [sem.start_date, sem.end_date, holidays, offSet]);
  const nextKey = useMemo(() => new Map(rows.map((r) => [r.key, nextSchoolDay(rows, r.key)?.key ?? null])), [rows]);
  const months = [...new Set(rows.map((r) => r.month))];
  const weeks = [...new Set(rows.map((r) => r.week))];
  const groups = hwCols.reduce<{ name: string; span: number }[]>((acc, c) => {
    const last = acc[acc.length - 1];
    if (last && last.name === c.group_name) last.span++; else acc.push({ name: c.group_name, span: 1 });
    return acc;
  }, []);
  const [newOff, setNewOff] = useState({ date: "", reason: "" });

  function jump(selector: string) {
    const row = wrapRef.current?.querySelector<HTMLElement>(selector);
    if (!row || !wrapRef.current) return;
    wrapRef.current.scrollTop = Math.max(0, row.offsetTop - 80);
    row.animate([{ backgroundColor: "#f5ead2" }, { backgroundColor: "transparent" }], { duration: 1600 });
  }

  function exportCsv() {
    const header = ["週次", "日期", "星期", "是否上課", "國定假日／補假", "重要行事曆", "當日作業總覽", "堂", "國語課程進度", "社會課程進度", ...hwCols.map((c) => c.key)];
    const body = rows.map((r) => {
      const v = values[r.key] ?? {};
      const nk = nextKey.get(r.key);
      const merge = (manual: string | undefined, auto: string[]) => [manual?.trim(), ...auto].filter(Boolean).join("\n");
      return [r.week, r.key, `週${WEEKDAYS[r.dow]}`, r.isSchoolDay ? "上課" : "不上課", r.holiday || (r.isManualOff ? "自訂不上課日" : ""),
        v["重要行事曆"] ?? "", summaryText(summaryItems(v, nk ? values[nk] ?? {} : null)), v["堂"] ?? "",
        merge(v["國語課程進度"], autoCourseZh(v)), merge(v["社會課程進度"], autoCourseSocial(v)),
        ...hwCols.map((c) => v[c.key] ?? "")];
    });
    downloadText("MuMu整學期課程進度規劃表.csv", toCsv([header, ...body]));
  }

  const th = "border-b border-r border-line px-1 py-2 text-center font-black text-sm";
  const stickyTh = `${th} sticky z-30 bg-[#f6f2ff]`;

  return (
    <div className="planner">
      <style>{`@media print { @page { size: A3 landscape; margin: 7mm; } .planner-wrap { max-height: none !important; overflow: visible !important; } }`}</style>
      <PageTitle>📚 整學期課程進度規劃表</PageTitle>
      <div className="card mb-3 flex flex-wrap items-end gap-3 p-3 print:hidden">
        <div><label className="label" htmlFor="sem-start">學期開始</label>
          <input id="sem-start" type="date" className="input" defaultValue={sem.start_date} onBlur={(e) => e.target.value && e.target.value !== sem.start_date && semM.update.mutate({ start_date: e.target.value })} /></div>
        <div><label className="label" htmlFor="sem-end">學期結束</label>
          <input id="sem-end" type="date" className="input" defaultValue={sem.end_date} onBlur={(e) => e.target.value && e.target.value !== sem.end_date && semM.update.mutate({ end_date: e.target.value })} /></div>
        <div><label className="label" htmlFor="jump-month">跳到月份</label>
          <select id="jump-month" className="input" value="" onChange={(e) => e.target.value && jump(`tr[data-month="${e.target.value}"]`)}>
            <option value="">選擇月份</option>{months.map((m) => <option key={m} value={m}>{m.slice(0, 4)} 年 {Number(m.slice(5))} 月</option>)}
          </select></div>
        <div><label className="label" htmlFor="jump-week">跳到週次</label>
          <select id="jump-week" className="input" value="" onChange={(e) => e.target.value && jump(`tr[data-week="${e.target.value}"]`)}>
            <option value="">選擇週次</option>{weeks.map((w) => <option key={w} value={w}>第 {w} 週</option>)}
          </select></div>
        <button className="btn" onClick={exportCsv}>匯出 CSV</button>
        <button className="btn" onClick={() => window.print()}>列印</button>
        <details className="w-full">
          <summary className="cursor-pointer text-sm font-bold text-muted">自訂不上課日（{offDays.length} 天）</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {offDays.map((o) => (
              <span key={o.id} className="chip">{o.date}{o.reason && `｜${o.reason}`}
                <button className="ml-1 text-rose-ink" aria-label={`移除 ${o.date}`} onClick={() => semM.removeOff.mutate(o.id)}>×</button></span>
            ))}
            <input id="off-date" type="date" className="input w-auto" value={newOff.date} onChange={(e) => setNewOff({ ...newOff, date: e.target.value })} />
            <input id="off-reason" className="input w-40" placeholder="原因（可不填）" value={newOff.reason} onChange={(e) => setNewOff({ ...newOff, reason: e.target.value })} />
            <button className="btn-soft" disabled={!newOff.date} onClick={() => { semM.addOff.mutate(newOff); setNewOff({ date: "", reason: "" }); }}>加入</button>
          </div>
        </details>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm print:hidden">
        <span className="chip">上學日：{rows.filter((r) => r.isSchoolDay).length} 天</span>
        <span className="chip">週次：{weeks.length} 週</span>
        <span className="chip">學期內國定假日／補假：{rows.filter((r) => r.holiday).length} 天</span>
      </div>

      <div ref={wrapRef} className="planner-wrap card max-h-[calc(100vh-260px)] overflow-auto">
        <table className="w-max border-separate border-spacing-0 text-[15px]">
          <thead className="sticky top-0 z-20">
            <tr>
              <th rowSpan={2} className={`${stickyTh} left-0 w-12 bg-sheet`}>週次</th>
              <th rowSpan={2} className={`${stickyTh} left-12 w-[70px] bg-sheet`}>日期</th>
              <th rowSpan={2} className={`${stickyTh} left-[118px] w-[170px] bg-[#fff8e8]`}>重要行事曆</th>
              <th rowSpan={2} className={`${stickyTh} left-[288px] w-[240px] bg-[#eef7ff]`}>當日作業總覽</th>
              <th rowSpan={2} className={`${stickyTh} left-[528px] w-11`}>堂</th>
              <th rowSpan={2} className={`${stickyTh} left-[572px] w-[220px]`}>課堂進度</th>
              {groups.map((g) => <th key={g.name} colSpan={g.span} className={`${th} ${GROUP_BG[g.name] ?? "bg-paper"}`}>{g.name}</th>)}
            </tr>
            <tr>
              {hwCols.map((c) => <th key={c.id} className={`${th} ${GROUP_BG[c.group_name] ?? "bg-paper"}`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const nk = nextKey.get(r.key);
              return (
                <PlannerRow key={r.key} row={r} vals={values[r.key] ?? EMPTY} nextVals={nk ? values[nk] ?? EMPTY : null}
                  hwCols={hwCols} fixed={fixed} onChange={onChange} failed={failed.has(r.key)} />
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-muted print:hidden">
        國定假日依行政院人事行政總處辦公日曆內建，學校實際放假以校方行事曆為準。綠色字是依作業欄自動帶入的課堂進度，不需要手動輸入。
      </p>
    </div>
  );
}

const EMPTY: DayValues = {};
