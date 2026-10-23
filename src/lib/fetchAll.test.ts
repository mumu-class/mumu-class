import { describe, expect, it } from "vitest";
import { fetchAll, type Page } from "./fetchAll";

/** 模擬 PostgREST：.range(from, to) 之外，每次最多再被 max_rows 截斷 */
function fakeTable(n: number, maxRows: number) {
  const all = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  const page: Page<number> = async (from, to) => {
    calls.push([from, to]);
    return { data: all.slice(from, Math.min(to + 1, from + maxRows)), error: null };
  };
  return { all, calls, page };
}

describe("fetchAll", () => {
  it("超過 max_rows 時分頁讀完全部", async () => {
    const t = fakeTable(2500, 1000);
    expect(await fetchAll(t.page)).toEqual(t.all);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]]);
  });
  it("max_rows 比每頁大小還小也不會少資料", async () => {
    const t = fakeTable(1200, 500);
    expect(await fetchAll(t.page)).toEqual(t.all);
  });
  it("剛好整頁的倍數", async () => {
    const t = fakeTable(2000, 1000);
    expect(await fetchAll(t.page)).toEqual(t.all);
  });
  it("空表回傳空陣列", async () => {
    expect(await fetchAll(fakeTable(0, 1000).page)).toEqual([]);
  });
  it("任何一頁出錯就丟例外", async () => {
    const err = new Error("boom");
    await expect(fetchAll(async (from) => (from === 0 ? { data: [1], error: null } : { data: null, error: err }))).rejects.toBe(err);
  });
});
