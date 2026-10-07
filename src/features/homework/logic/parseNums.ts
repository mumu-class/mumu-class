/**
 * 解析批次座號輸入，例如 "1-4,6,8-12"、"1、2 3，4"。
 * 只回傳存在於 validNos 的座號（空號自動忽略），排序且不重複。
 */
export function parseNums(text: string, validNos: number[]): number[] {
  const valid = new Set(validNos);
  const out = new Set<number>();
  for (const part of String(text).split(/[,\s、，]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*[-－~～]\s*(\d+)$/);
    if (range) {
      let a = Number(range[1]);
      let b = Number(range[2]);
      if (a > b) [a, b] = [b, a];
      for (let n = a; n <= b; n++) if (valid.has(n)) out.add(n);
    } else if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (valid.has(n)) out.add(n);
    }
  }
  return [...out].sort((x, y) => x - y);
}
