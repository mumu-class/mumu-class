import { describe, expect, it } from "vitest";
import { buildRows, nextSchoolDay, prevSchoolDay } from "./calendar";

const holidays = { "2026-09-25": "中秋節", "2026-09-28": "教師節" };

describe("buildRows", () => {
  const rows = buildRows("2026-09-21", "2026-10-02", holidays, new Set(["2026-09-30"]));
  it("只列平日", () => expect(rows.map((r) => r.key)).toEqual([
    "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25",
    "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
  ]));
  it("週次從週一起算", () => {
    expect(rows[0].week).toBe(1);
    expect(rows[5].week).toBe(2);
  });
  it("國定假日與自訂不上課日不算上學日", () => {
    expect(rows.find((r) => r.key === "2026-09-25")).toMatchObject({ holiday: "中秋節", isSchoolDay: false });
    expect(rows.find((r) => r.key === "2026-09-30")).toMatchObject({ isManualOff: true, isSchoolDay: false });
    expect(rows.filter((r) => r.isSchoolDay)).toHaveLength(7);
  });
  it("前後一個上學日會跳過假日", () => {
    expect(nextSchoolDay(rows, "2026-09-24")?.key).toBe("2026-09-29");
    expect(prevSchoolDay(rows, "2026-09-29")?.key).toBe("2026-09-24");
  });
  it("開始晚於結束回傳空陣列", () => expect(buildRows("2026-10-02", "2026-09-01", {}, new Set())).toEqual([]));
});
