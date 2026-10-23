import { describe, expect, it } from "vitest";
import { fmtDateTime, fmtTime, taipeiToday } from "./time";

describe("台北時間", () => {
  it("fmtTime 換算成台北時間", () => expect(fmtTime("2026-10-23T04:25:00Z")).toBe("12:25"));
  it("fmtDateTime 跨日時日期也換算", () => expect(fmtDateTime("2026-10-23T16:05:00Z")).toBe("10/24 00:05"));
  it("taipeiToday 以台北日期為準", () => expect(taipeiToday(new Date("2026-10-23T16:05:00Z"))).toBe("2026-10-24"));
});
