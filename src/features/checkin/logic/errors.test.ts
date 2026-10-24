import { describe, expect, it } from "vitest";
import { checkinErrorText, isRuleError } from "./errors";

describe("checkinErrorText／isRuleError", () => {
  it("RPC 拒絕的原因轉成中文", () => {
    expect(isRuleError({ message: "checkin_stale" })).toBe(true);
    expect(checkinErrorText({ message: "checkin_stale" })).toBe("狀態已變動，無法復原");
  });
  it("中午時段的拒絕原因", () => {
    for (const [code, text] of [
      ["noon_closed", "已過 17:00，今天的紀錄已鎖定"], ["noon_on_leave", "這位同學今天請假"],
      ["noon_no_item", "任務已更新，請重新整理"], ["noon_no_day", "那天沒有中午紀錄"],
    ]) {
      expect(isRuleError({ message: code })).toBe(true);
      expect(checkinErrorText({ message: code })).toBe(text);
    }
  });
  it("同一格重複建立任務", () => {
    expect(isRuleError({ code: "23505", message: "duplicate key value" })).toBe(true);
    expect(checkinErrorText({ code: "23505", message: "duplicate key value" })).toBe("這一格已經有任務了，請重新整理");
  });
  it("網路錯誤不是規則錯誤", () => {
    expect(isRuleError(new TypeError("Failed to fetch"))).toBe(false);
    expect(checkinErrorText(new TypeError("Failed to fetch"))).toBe("儲存失敗，請再試一次");
  });
  it("物件原型上的名字不算", () => expect(isRuleError({ message: "toString" })).toBe(false));
});
