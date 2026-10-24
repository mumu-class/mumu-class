import { describe, expect, it } from "vitest";
import type { CheckinMark, CheckinTask, Student } from "../../../lib/types";
import { countTask, matchStudent, missingByStudent, visibleMarks, withLiveNames } from "./stats";

const mark = (student_no: number, state: CheckinMark["state"], extra: Partial<CheckinMark> = {}): CheckinMark => ({
  student_id: `s${student_no}`, student_no, name_zh: `學生${student_no}`, state,
  done_at: state === "done" ? "2026-10-23T04:25:00Z" : null, removed_at: null, ...extra,
});
const task = (name: string, marks: CheckinMark[], extra: Partial<CheckinTask> = {}): CheckinTask => ({
  id: name, class_id: "c1", slot: 1, name, task_date: "2026-10-23", due_date: null, note: "",
  status: "open", batch_id: null, archived_at: null, checkin_task_marks: marks, ...extra,
});
const REMOVED = "2026-10-23T05:00:00Z";

describe("countTask", () => {
  it("應完成數不含免交與轉出", () => {
    expect(countTask([mark(1, "done"), mark(2, "pending"), mark(3, "exempt"), mark(4, "done", { removed_at: REMOVED })]))
      .toEqual({ done: 1, total: 2, exempt: 1 });
  });
  it("沒有學生時都是 0", () => expect(countTask([])).toEqual({ done: 0, total: 0, exempt: 0 }));
});

describe("visibleMarks", () => {
  it("隱藏轉出的學生並依座號排序，不改動原本的陣列", () => {
    const t = task("t", [mark(3, "pending"), mark(1, "done"), mark(2, "pending", { removed_at: REMOVED })]);
    expect(visibleMarks(t).map((m) => m.student_no)).toEqual([1, 3]);
    expect(t.checkin_task_marks.map((m) => m.student_no)).toEqual([3, 1, 2]);
  });
});

describe("withLiveNames", () => {
  const students: Student[] = [{ id: "s1", class_id: "c1", student_no: 7, name_zh: "新名字", name_en: null, left_at: null }];
  it("進行中的任務用目前名單的座號與姓名", () => {
    const m = withLiveNames(task("t", [mark(1, "done")]), students).checkin_task_marks[0];
    expect([m.student_no, m.name_zh]).toEqual([7, "新名字"]);
  });
  it("封存的任務維持封存當下的快照", () => {
    const m = withLiveNames(task("t", [mark(1, "done")], { status: "archived" }), students).checkin_task_marks[0];
    expect([m.student_no, m.name_zh]).toEqual([1, "學生1"]);
  });
});

describe("missingByStudent", () => {
  it("有一項未完成就列出一次；免交與轉出不算缺交；依座號排序", () => {
    const rows = missingByStudent([
      task("閱讀", [mark(2, "pending"), mark(1, "pending"), mark(3, "exempt")]),
      task("聯絡單", [mark(2, "pending"), mark(1, "done"), mark(4, "pending", { removed_at: REMOVED })]),
    ]);
    expect(rows.map((r) => [r.student_no, r.tasks.map((t) => t.name)])).toEqual([[1, ["閱讀"]], [2, ["閱讀", "聯絡單"]]]);
  });
});

describe("matchStudent", () => {
  it("空字串全部符合", () => expect(matchStudent(" ", 3, "王小明")).toBe(true));
  it("數字比對座號（完全相同）", () => {
    expect(matchStudent("3", 3, "王小明")).toBe(true);
    expect(matchStudent("3", 13, "王小明")).toBe(false);
  });
  it("文字比對姓名", () => {
    expect(matchStudent("小明", 3, "王小明")).toBe(true);
    expect(matchStudent("小華", 3, "王小明")).toBe(false);
  });
});
