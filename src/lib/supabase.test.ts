import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "./supabase";

describe("normalizeSupabaseUrl", () => {
  it("保留正確的專案網址", () => expect(normalizeSupabaseUrl("https://abc.supabase.co")).toBe("https://abc.supabase.co"));
  it("去掉 /rest/v1 與結尾斜線", () => {
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(normalizeSupabaseUrl(" https://abc.supabase.co/ ")).toBe("https://abc.supabase.co");
  });
  it("空值回傳 undefined", () => expect(normalizeSupabaseUrl("")).toBeUndefined());
});
