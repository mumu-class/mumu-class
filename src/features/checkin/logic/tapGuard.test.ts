import { describe, expect, it } from "vitest";
import { createTapGuard } from "./tapGuard";

describe("createTapGuard", () => {
  it("同一顆按鈕 600ms 內的第二次點擊忽略", () => {
    const g = createTapGuard();
    expect(g("a", 1000)).toBe(true);
    expect(g("a", 1300)).toBe(false);
    expect(g("a", 1600)).toBe(true);
  });
  it("被忽略的點擊不延長等待時間", () => {
    const g = createTapGuard();
    g("a", 0);
    g("a", 500);
    expect(g("a", 600)).toBe(true);
  });
  it("不同按鈕互不影響", () => {
    const g = createTapGuard();
    expect(g("a", 0)).toBe(true);
    expect(g("b", 10)).toBe(true);
  });
});
