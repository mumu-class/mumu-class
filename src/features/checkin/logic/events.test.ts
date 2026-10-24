import { describe, expect, it } from "vitest";
import { eventText } from "./events";

const task = { name: "閱讀認證" };

describe("eventText", () => {
  it("打卡與取消", () => {
    expect(eventText({ action: "done", next: { state: "done" }, checkin_tasks: task })).toBe("完成打卡・閱讀認證");
    expect(eventText({ action: "cancel", next: { state: "pending" }, checkin_tasks: task })).toBe("取消打卡・閱讀認證");
  });
  it("復原寫出回到哪個狀態", () => {
    expect(eventText({ action: "undo", next: { state: "done" }, checkin_tasks: task })).toBe("復原（回到已完成）・閱讀認證");
    expect(eventText({ action: "undo", next: { state: "pending" }, checkin_tasks: task })).toBe("復原（回到未完成）・閱讀認證");
  });
  it("免交", () => expect(eventText({ action: "exempt", next: { state: "exempt" }, checkin_tasks: task })).toBe("標為免交・閱讀認證"));
});

describe("eventText：中午時段", () => {
  const item = { name: "清潔桌面" };
  it("打卡、取消、補登用中午當天的任務名稱", () => {
    expect(eventText({ action: "done", next: { result: "ontime" }, checkin_tasks: null, noon_day_items: item })).toBe("完成打卡・清潔桌面");
    expect(eventText({ action: "cancel", next: { result: "pending" }, checkin_tasks: null, noon_day_items: item })).toBe("取消打卡・清潔桌面");
    expect(eventText({ action: "teacher_fill", next: { result: "late" }, checkin_tasks: null, noon_day_items: item })).toBe("老師補登・清潔桌面");
  });
  it("復原依 result 寫出回到準時、逾時或未完成", () => {
    expect(eventText({ action: "undo", next: { result: "ontime" }, checkin_tasks: null, noon_day_items: item })).toBe("復原（回到準時）・清潔桌面");
    expect(eventText({ action: "undo", next: { result: "late" }, checkin_tasks: null, noon_day_items: item })).toBe("復原（回到逾時）・清潔桌面");
    expect(eventText({ action: "undo", next: { result: "pending" }, checkin_tasks: null, noon_day_items: item })).toBe("復原（回到未完成）・清潔桌面");
  });
  it("請假沒有任務名稱", () => {
    expect(eventText({ action: "leave", next: { on_leave: true }, checkin_tasks: null, noon_day_items: null })).toBe("標為請假");
    expect(eventText({ action: "unleave", next: { on_leave: false } })).toBe("取消請假");
  });
  it("一般任務的名稱優先", () => {
    expect(eventText({ action: "done", next: { state: "done" }, checkin_tasks: task, noon_day_items: item })).toBe("完成打卡・閱讀認證");
  });
});
