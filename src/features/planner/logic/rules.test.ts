import { describe, expect, it } from "vitest";
import { buildRows, nextSchoolDay } from "./calendar";
import { autoCourseSocial, autoCourseZh, goesToCourse, poemRoute, splitEntries, summaryItems, summaryText } from "./rules";

const mon = (vals: Record<string, string>) => ({ vals, dow: 1 });
const wed = (vals: Record<string, string>) => ({ vals, dow: 3 });
const EMPTY = { homework: [], sign: [] };
const hw = (day: Record<string, string>, next: Parameters<typeof summaryItems>[1] = null) => summaryText(summaryItems(day, next).homework);
const sign = (day: Record<string, string>, next: Parameters<typeof summaryItems>[1] = null) => summaryText(summaryItems(day, next).sign);

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
    expect(summaryItems(day, null)).toEqual(EMPTY);
  });
  it("訂簽 → 訂簽塊，不進課堂進度", () => {
    const day = { 國課練: "L5訂簽" };
    expect(autoCourseZh(day)).toEqual([]);
    expect(sign(day)).toBe("國課練｜L5訂簽");
    expect(hw(day)).toBe("");
  });
  it("沒有數字 → 作業塊", () => expect(hw({ 字詞本: "訂正" })).toBe("字詞本｜訂正"));
  it("P.12 有數字算進度（老師確認）", () => expect(autoCourseZh({ 字詞本: "P.12" })).toEqual(["字詞本：P.12"]));
  it("換行後逐項判斷：L3 進課堂進度、訂簽進訂簽塊", () => {
    const day = { 國課練: "L3\n訂簽" };
    expect(autoCourseZh(day)).toEqual(["國課練：L3"]);
    expect(sign(day)).toBe("國課練｜訂簽");
    expect(hw(day)).toBe("");
  });
});

describe("R2 詩選（老師回條：背＋數字是作業、只有數字是進度）", () => {
  it("分流判斷", () => {
    expect(poemRoute("背12")).toBe("homework");
    expect(poemRoute("12")).toBe("course");
    expect(poemRoute("12-13")).toBe("course");
    expect(poemRoute("靜夜思")).toBe("both");
  });
  it("背12 → 只列作業總覽", () => {
    const day = { 詩選: "背12" };
    expect(autoCourseZh(day)).toEqual([]);
    expect(hw(day)).toBe("詩選｜背12");
  });
  it("12 → 只帶入課堂進度", () => {
    const day = { 詩選: "12" };
    expect(autoCourseZh(day)).toEqual(["詩選：12"]);
    expect(summaryItems(day, null)).toEqual(EMPTY);
  });
  it("其他文字 → 兩邊都列（沿用舊版）", () => {
    const day = { 詩選: "靜夜思" };
    expect(autoCourseZh(day)).toEqual(["詩選：靜夜思"]);
    expect(hw(day)).toBe("詩選｜靜夜思");
  });
});

describe("R3–R5 考試", () => {
  it("字詞考：當天進度＋前一天提醒；訂簽行進訂簽塊", () => {
    const wedVals = { 字詞考: "L3\nL2訂簽" };
    expect(autoCourseZh(wedVals)).toEqual(["字詞考：L3"]);
    expect(sign(wedVals)).toBe("字詞考｜L2訂簽");
    expect(hw({}, wed(wedVals))).toBe("週三考國L3字詞考");
  });
  it("國單元考", () => {
    const d = { 國單元考: "4-5" };
    expect(autoCourseZh(d)).toEqual(["考4-5"]);
    expect(hw({}, mon(d))).toBe("週一考國4-5單元考");
  });
  it("社單元考", () => {
    const d = { 社單元考: "2" };
    expect(autoCourseSocial(d)).toEqual(["考2"]);
    expect(hw({}, wed(d))).toBe("週三考社2單元考");
  });
  it("國語進度自動行的順序：國課練、字詞本、詩選、字詞考、單元考", () => {
    expect(autoCourseZh({ 國單元考: "3", 字詞考: "L1", 詩選: "5", 字詞本: "L2", 國課練: "L4" })).toEqual([
      "國課練：L4", "字詞本：L2", "詩選：5", "字詞考：L1", "考3",
    ]);
  });
});

describe("R6 其他作業欄", () => {
  it("生字本已拆成甲本、乙本，依欄位順序列出", () => {
    expect(hw({ 乙本: "L3", 甲本: "L3" })).toBe("甲本｜L3；乙本｜L3");
  });
  it("依欄位順序列出；隱藏的備註、堂不列入", () => {
    expect(hw({ 社習: "P.3", 國習: "P.20-21", 備註: "家長日", 堂: "2" })).toBe("國習｜P.20-21；社習｜P.3");
  });
  it("單行欄位也逐項判斷：一般作業進作業塊、訂簽進訂簽塊", () => {
    const day = { 國習: "P.20；L2訂簽" };
    expect(hw(day)).toBe("國習｜P.20");
    expect(sign(day)).toBe("國習｜L2訂簽");
  });
  it("數學、自然、其他列入總覽，排在社會之後", () => {
    const day = { 其他: "回條", 數學: "數祕本P.12", 自然: "自綠本訂簽", 社習: "P.3" };
    expect(hw(day)).toBe("社習｜P.3；數學｜數祕本P.12；其他｜回條");
    expect(sign(day)).toBe("自然｜自綠本訂簽");
  });
});

describe("R8 其他考試", () => {
  it("每個項目都在前一個上學日預告，不看有沒有數字", () => {
    expect(hw({}, wed({ 其他考試: "數L3\n自第二單元" }))).toBe("週三考數L3；週三考自第二單元");
  });
  it("考試當天不另外顯示", () => {
    const day = { 其他考試: "數L3" };
    expect(summaryItems(day, null)).toEqual(EMPTY);
    expect(autoCourseZh(day)).toEqual([]);
    expect(autoCourseSocial(day)).toEqual([]);
  });
  it("預告一律放作業塊（即使內容有訂簽）", () => {
    const s = summaryItems({}, wed({ 其他考試: "數訂簽" }));
    expect(summaryText(s.homework)).toBe("週三考數訂簽");
    expect(s.sign).toEqual([]);
  });
  it("中間隔著假日時，預告在假日前的上學日，並寫出考試當天的星期", () => {
    // 9/25（五）中秋節、9/28（一）教師節：9/24（四）的下一個上學日是 9/29（二）
    const rows = buildRows("2026-09-21", "2026-10-02", { "2026-09-25": "中秋節", "2026-09-28": "教師節" }, new Set());
    const nr = nextSchoolDay(rows, "2026-09-24")!;
    expect(hw({}, { vals: { 其他考試: "數L3" }, dow: nr.dow })).toBe("週二考數L3");
  });
});
