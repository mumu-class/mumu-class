export type DayRow = {
  key: string; // YYYY-MM-DD
  date: Date;
  dow: number;
  month: string; // YYYY-MM
  week: number;
  holiday: string;
  isManualOff: boolean;
  isSchoolDay: boolean;
};

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const pad = (n: number) => String(n).padStart(2, "0");
export const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function mondayKey(d: Date): string {
  const m = new Date(d);
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return fmtDate(m);
}

/** 學期內所有平日。國定假日與自訂不上課日也列出，但 isSchoolDay = false。 */
export function buildRows(start: string, end: string, holidays: Record<string, string>, offDays: Set<string>): DayRow[] {
  const s = parseLocalDate(start), e = parseLocalDate(end);
  if (!(s <= e)) return [];
  const rows: DayRow[] = [];
  let week = 0, lastWeek = "";
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const key = fmtDate(d);
    const wk = mondayKey(d);
    if (wk !== lastWeek) { week++; lastWeek = wk; }
    const holiday = holidays[key] ?? "";
    const isManualOff = offDays.has(key);
    rows.push({ key, date: new Date(d), dow, month: key.slice(0, 7), week, holiday, isManualOff, isSchoolDay: !holiday && !isManualOff });
  }
  return rows;
}

export function nextSchoolDay(rows: DayRow[], key: string): DayRow | null {
  const i = rows.findIndex((r) => r.key === key);
  if (i < 0) return null;
  for (let j = i + 1; j < rows.length; j++) if (rows[j].isSchoolDay) return rows[j];
  return null;
}

export function prevSchoolDay(rows: DayRow[], key: string): DayRow | null {
  const i = rows.findIndex((r) => r.key === key);
  for (let j = i - 1; j >= 0; j--) if (rows[j].isSchoolDay) return rows[j];
  return null;
}
