// 中午打卡台的時鐘：以伺服器時間為準（設計 §4、§7.4），裝置時鐘可能快慢
const FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function parts(d: Date): Record<string, string> {
  return Object.fromEntries(FMT.formatToParts(d).map((p) => [p.type, p.value]));
}

/** 伺服器時間 − 裝置時間（毫秒）。之後「伺服器現在」＝ Date.now() + offset */
export function clockOffset(serverIso: string, deviceNowMs: number): number {
  return new Date(serverIso).getTime() - deviceNowMs;
}

/** 12:40:59（台北） */
export function fmtClock(d: Date): string {
  const p = parts(d);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** 12:40（台北）。判定準時／逾時只比到分鐘（設計 §4），和 SQL 的 date_trunc('minute', …) 一致 */
export function taipeiMinuteTime(d: Date): string {
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
}

/** 台北時間是否已到 17:00 */
export function isAfterCutoff(d: Date): boolean {
  return taipeiMinuteTime(d) >= "17:00";
}
