import { describe, expect, it } from "vitest";
import { allSeats, groupName, groupNo, randomAssign } from "./seating";

describe("seating", () => {
  it("最右欄是第一組、最左欄是第六組", () => {
    expect(groupNo(5, 6)).toBe(1);
    expect(groupNo(0, 6)).toBe(6);
    expect(groupName(5, 6)).toBe("第一組");
    expect(groupName(0, 6)).toBe("第六組");
  });
  it("5×6 共 30 個座位", () => expect(allSeats(5, 6)).toHaveLength(30));
  it("隨機排座位不重複且全部排入", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `s${i}`);
    const out = randomAssign(ids, 5, 6);
    expect(new Set(out.map((s) => s.student_id)).size).toBe(30);
  });
  it("學生少於座位時其餘為空位", () => {
    const out = randomAssign(["a", "b"], 2, 2, () => 0);
    expect(out.filter((s) => s.student_id === null)).toHaveLength(2);
  });
});
