import { describe, expect, it } from "vitest";
import { clockOffset, fmtClock, isAfterCutoff, taipeiMinuteTime } from "./clock";

// 台北 = UTC+8：12:40:59 台北 = 04:40:59Z
describe("clockOffset", () => {
  it("伺服器比裝置快 2 秒", () => {
    expect(clockOffset("2026-10-21T04:40:00Z", Date.parse("2026-10-21T04:39:58Z"))).toBe(2000);
  });
  it("伺服器比裝置慢", () => {
    expect(clockOffset("2026-10-21T04:40:00Z", Date.parse("2026-10-21T04:40:03Z"))).toBe(-3000);
  });
});

describe("fmtClock／taipeiMinuteTime", () => {
  it("以台北時間顯示", () => {
    const d = new Date("2026-10-21T04:40:59Z");
    expect(fmtClock(d)).toBe("12:40:59");
    expect(taipeiMinuteTime(d)).toBe("12:40");
  });
  it("午夜是 00 不是 24", () => {
    const d = new Date("2026-10-20T16:05:09Z");
    expect(fmtClock(d)).toBe("00:05:09");
    expect(taipeiMinuteTime(d)).toBe("00:05");
  });
});

describe("isAfterCutoff", () => {
  it("16:59:59 還沒到，17:00:00 起鎖定", () => {
    expect(isAfterCutoff(new Date("2026-10-21T08:59:59Z"))).toBe(false);
    expect(isAfterCutoff(new Date("2026-10-21T09:00:00Z"))).toBe(true);
    expect(isAfterCutoff(new Date("2026-10-21T15:00:00Z"))).toBe(true);
  });
  it("台北隔天凌晨是新的一天，不算過了 17:00", () => expect(isAfterCutoff(new Date("2026-10-21T16:30:00Z"))).toBe(false));
});
