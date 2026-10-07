import { describe, expect, it } from "vitest";
import { autoCourseSocial, autoCourseZh, goesToCourse, splitEntries, summaryItems, summaryText } from "./rules";

describe("splitEntries / goesToCourse", () => {
  it("以換行、全形與半形分號分割", () => expect(splitEntries("L3\nL2訂簽；L1;")).toEqual(["L3", "L2訂簽", "L1"]));
  it("有數字（含國字數字）且無訂簽才算進度", () => {
    expect(goesToCourse("L3")).toBe(true);
    expect(goesToCourse("第三課")).toBe(true);
    expect(goesToCourse("L3訂簽")).toBe(false);
    expect(goesToCourse("訂正")).toBe(false);
  });
});

describe("R1 國課練、字詞本", () => {
  it("有數字 → 課堂進度，不列入總覽", () => {
    const day = { 國課練: "L5" };
    expect(autoCourseZh(day)).toEqual(["國課練：L5"]);
    expect(summaryItems(day, null)).toEqual([]);
  });
  it("訂簽 → 總覽，不進課堂進度", () => {
    const day = { 國課練: "L5訂簽" };
    expect(autoCourseZh(day)).toEqual([]);
    expect(summaryText(summaryItems(day, null))).toBe("國課練｜L5訂簽");
  });
  it("沒有數字 → 總覽", () => expect(summaryText(summaryItems({ 字詞本: "訂正" }, null))).toBe("字詞本｜訂正"));
  it("P.12 因為有數字會算成進度（⏳ 待朋友確認）", () => expect(autoCourseZh({ 字詞本: "P.12" })).toEqual(["字詞本：P.12"]));
});

describe("R2 詩選", () => {
  it("同時出現在課堂進度與總覽", () => {
    const day = { 詩選: "靜夜思" };
    expect(autoCourseZh(day)).toEqual(["詩選：靜夜思"]);
    expect(summaryText(summaryItems(day, null))).toBe("詩選｜靜夜思");
  });
});

describe("R3–R5 考試", () => {
  it("字詞考：當天進度＋前一天提醒；訂簽行留在總覽", () => {
    const wed = { 字詞考: "L3\nL2訂簽" };
    expect(autoCourseZh(wed)).toEqual(["字詞考：L3"]);
    expect(summaryText(summaryItems(wed, null))).toBe("字詞考｜L2訂簽");
    expect(summaryText(summaryItems({}, wed))).toBe("明天考國L3字詞考");
  });
  it("國單元考", () => {
    const d = { 國單元考: "4-5" };
    expect(autoCourseZh(d)).toEqual(["考4-5"]);
    expect(summaryText(summaryItems({}, d))).toBe("明天考國4-5單元考");
  });
  it("社單元考", () => {
    const d = { 社單元考: "2" };
    expect(autoCourseSocial(d)).toEqual(["考2"]);
    expect(summaryText(summaryItems({}, d))).toBe("明天考社2單元考");
  });
  it("國語進度自動行的順序：國課練、字詞本、詩選、字詞考、單元考", () => {
    expect(autoCourseZh({ 國單元考: "3", 字詞考: "L1", 詩選: "春曉", 字詞本: "L2", 國課練: "L4" })).toEqual([
      "國課練：L4", "字詞本：L2", "詩選：春曉", "字詞考：L1", "考3",
    ]);
  });
});

describe("R6 其他欄位", () => {
  it("依欄位順序列出，備註不列入", () => {
    expect(summaryText(summaryItems({ 社習: "P.3", 國習: "P.20-21", 備註: "家長日" }, null))).toBe("國習｜P.20-21；社習｜P.3");
  });
});
