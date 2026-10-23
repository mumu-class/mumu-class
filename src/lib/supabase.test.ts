import { describe, expect, it } from "vitest";
import { fetchAll, normalizeSupabaseUrl } from "./supabase";

describe("normalizeSupabaseUrl", () => {
  it("保留正確的專案網址", () => expect(normalizeSupabaseUrl("https://abc.supabase.co")).toBe("https://abc.supabase.co"));
  it("去掉 /rest/v1 與結尾斜線", () => {
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl(" https://abc.supabase.co/ ")).toBe("https://abc.supabase.co");
  });
  it("空值回傳 undefined", () => expect(normalizeSupabaseUrl("")).toBeUndefined());
});

describe("fetchAll", () => {
  it("分頁讀到不滿一頁為止", async () => {
    const data = [0, 1, 2, 3, 4];
    const calls: [number, number][] = [];
    const rows = await fetchAll<number>((from, to) => {
      calls.push([from, to]);
      return Promise.resolve({ data: data.slice(from, to + 1), error: null });
    }, 2);
    expect(rows).toEqual([0, 1, 2, 3, 4]);
    expect(calls).toEqual([[0, 1], [2, 3], [4, 5]]);
  });
  it("剛好整頁時多讀一次空頁", async () => {
    const rows = await fetchAll<number>((from) => Promise.resolve({ data: from === 0 ? [1, 2] : [], error: null }), 2);
    expect(rows).toEqual([1, 2]);
  });
  it("有錯誤就丟出", async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
