/** 白板可能把一次觸控送成兩次點擊：同一顆按鈕 600ms 內的第二次點擊忽略（設計 §3.3） */
export function createTapGuard(windowMs = 600) {
  const last = new Map<string, number>();
  return (key: string, now: number = Date.now()): boolean => {
    const prev = last.get(key);
    if (prev !== undefined && now - prev < windowMs) return false;
    last.set(key, now);
    return true;
  };
}
