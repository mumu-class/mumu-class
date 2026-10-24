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
