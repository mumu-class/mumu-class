// 時間一律以台北時間顯示（設計 §4）；資料庫存的是 timestamptz
const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function parts(d: Date): Record<string, string> {
  return Object.fromEntries(FMT.formatToParts(d).map((p) => [p.type, p.value]));
}

/** 12:25 */
export function fmtTime(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.hour}:${p.minute}`;
}

/** 10/24 00:05 */
export function fmtDateTime(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

/** 今天的台北日期，2026-10-24 */
export function taipeiToday(now = new Date()): string {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 2026-10-24 12:25，匯出 Excel 用（台北時間） */
export function fmtStamp(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
