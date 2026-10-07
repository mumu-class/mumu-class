import { describe, expect, it } from "vitest";
import { fmt, isToday, signed, toCsv } from "./money";

describe("money", () => {
  it("千分位與小數", () => {
    expect(fmt(1234.5)).toBe("1,234.5");
    expect(fmt("1.85")).toBe("1.85");
  });
  it("帶正負號", () => {
    expect(signed(5)).toBe("+5");
    expect(signed(-1000)).toBe("-1,000");
  });
  it("CSV 有 BOM 且跳脫雙引號", () => {
    expect(toCsv([["a", 'b"c'], [1, null]])).toBe('﻿"a","b""c"\n"1",""');
  });
  it("判斷今天", () => {
    const now = new Date(2026, 9, 7, 12);
    expect(isToday(new Date(2026, 9, 7, 8).toISOString(), now)).toBe(true);
    expect(isToday(new Date(2026, 9, 6, 23).toISOString(), now)).toBe(false);
  });
});
