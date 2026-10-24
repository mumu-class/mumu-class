import { useEffect, useState } from "react";
import { useClassData } from "../../lib/classData";
import { clockOffset, fmtClock, isAfterCutoff } from "./logic/clock";
import { useNoonToday } from "./noonApi";

/** 伺服器時間差（毫秒）：以最近一次 noon_today 回應的時間為準（設計 §4、§7.4）。還沒讀到時是 0（用裝置時間） */
function useServerOffset(classId: string): number {
  const today = useNoonToday(classId);
  return today.data ? clockOffset(today.data.now, today.dataUpdatedAt) : 0;
}

/** 伺服器校正後的「現在」。每次呼叫都重新計算，打卡當下取用 */
export function useServerNow(classId: string): () => Date {
  const offset = useServerOffset(classId);
  return () => new Date(Date.now() + offset);
}

/** 是否已過 17:00：伺服器說已過、或校正後的時鐘已到 17:00。每秒檢查，只在值改變時重畫 */
export function useAfterCutoff(classId: string): boolean {
  const today = useNoonToday(classId);
  const offset = useServerOffset(classId);
  const [after, setAfter] = useState(false);
  useEffect(() => {
    const check = () => setAfter(isAfterCutoff(new Date(Date.now() + offset)));
    check();
    const id = window.setInterval(check, 1000);
    return () => window.clearInterval(id);
  }, [offset]);
  return after || today.data?.after_cutoff === true;
}

/** HH:MM:SS（台北），每秒更新 */
export function NoonClock({ className = "" }: { className?: string }) {
  const { cls } = useClassData();
  const serverNow = useServerNow(cls.id);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <time className={`font-bold tabular-nums text-muted ${className}`} aria-label="台灣時間">{fmtClock(serverNow())}</time>;
}
