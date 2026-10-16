import { describe, expect, it } from "vitest";
import { missingByStudent, moveItem, sortOpen } from "./order";

const a = (id: string, sort_order: number, assigned_date: string, created_at = `${assigned_date}T08:00:00Z`) =>
  ({ id, sort_order, assigned_date, created_at });

describe("sortOpen", () => {
  it("sort_order 小的在前", () => {
    expect(sortOpen([a("x", 2, "2026-10-10"), a("y", 1, "2026-10-01")]).map((v) => v.id)).toEqual(["y", "x"]);
  });
  it("sort_order 相同時，日期新的在前，再比建立時間", () => {
    const list = [a("old", 0, "2026-10-01"), a("new", 0, "2026-10-05"), a("later", 0, "2026-10-05", "2026-10-05T09:00:00Z")];
    expect(sortOpen(list).map((v) => v.id)).toEqual(["later", "new", "old"]);
  });
  it("新建立的作業（0）排在已排序過的（1 起）前面", () => {
    expect(sortOpen([a("p", 1, "2026-10-10"), a("fresh", 0, "2026-10-01")]).map((v) => v.id)).toEqual(["fresh", "p"]);
  });
  it("不改動傳入的陣列", () => {
    const list = [a("x", 2, "2026-10-10"), a("y", 1, "2026-10-01")];
    sortOpen(list);
    expect(list.map((v) => v.id)).toEqual(["x", "y"]);
  });
});

describe("moveItem", () => {
  it("往前、往後移一格", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });
  it("超出範圍時原樣回傳", () => {
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("missingByStudent", () => {
  const students = [{ id: "s3", student_no: 3 }, { id: "s1", student_no: 1 }, { id: "s2", student_no: 2 }];
  const hw = (id: string, missing: string[]) => ({
    id, homework_checks: students.map((s) => ({ student_id: s.id, status: missing.includes(s.id) ? "missing" as const : "done" as const })),
  });

  it("只列有缺交的學生，依座號排序，作業依傳入順序", () => {
    const rows = missingByStudent([hw("國習", ["s3", "s1"]), hw("數祕本", ["s3"])], students);
    expect(rows.map((r) => [r.student.student_no, r.assignments.map((x) => x.id)])).toEqual([
      [1, ["國習"]],
      [3, ["國習", "數祕本"]],
    ]);
  });
  it("全部交齊時回傳空陣列", () => {
    expect(missingByStudent([hw("國習", [])], students)).toEqual([]);
  });
});
