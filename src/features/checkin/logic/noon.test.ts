import { describe, expect, it } from "vitest";
import type { NoonDay, NoonItem, NoonMark, Student } from "../../../lib/types";
import { buildNoonView, computeSummary, fmtRate, judge } from "./noon";

// 台北 = UTC+8
const at = (hhmmss: string) => new Date(`2026-10-21T${hhmmss}+08:00`);

describe("judge", () => {
  it("12:40 截止：12:39:59、12:40:59 準時，12:41:00 起逾時", () => {
    expect(judge("12:40", at("12:39:59"))).toBe("ontime");
    expect(judge("12:40", at("12:40:00"))).toBe("ontime");
    expect(judge("12:40", at("12:40:59"))).toBe("ontime");
    expect(judge("12:40", at("12:41:00"))).toBe("late");
    expect(judge("12:40", at("16:59:59"))).toBe("late");
  });
  it("Postgres 的 time 帶秒數也能比", () => expect(judge("12:40:00", at("12:40:59"))).toBe("ontime"));
  it("不同截止時間", () => expect(judge("12:30", at("12:31:00"))).toBe("late"));
});

describe("fmtRate", () => {
  it("四捨五入到小數 1 位", () => {
    expect(fmtRate(121, 150)).toBe("80.7%");
    expect(fmtRate(15, 150)).toBe("10.0%");
    expect(fmtRate(1, 3)).toBe("33.3%");
    expect(fmtRate(2, 3)).toBe("66.7%");
    expect(fmtRate(1, 16)).toBe("6.3%");
  });
  it("0% 與 100%", () => {
    expect(fmtRate(0, 150)).toBe("0.0%");
    expect(fmtRate(150, 150)).toBe("100.0%");
  });
  it("分母是 0", () => expect(fmtRate(0, 0)).toBe("0%・0 筆"));
});

const templates: NoonItem[] = [
  { id: "t2", class_id: "c", name: "清潔桌面", deadline: "12:40:00", sort_order: 1, archived_at: null },
  { id: "t1", class_id: "c", name: "喝水、上廁所", deadline: "12:40:00", sort_order: 0, archived_at: null },
  { id: "t3", class_id: "c", name: "已停用", deadline: "12:40:00", sort_order: 2, archived_at: "2026-10-01T00:00:00Z" },
];
const stu = (n: number, left_at: string | null = null): Student =>
  ({ id: `s${n}`, class_id: "c", student_no: n, name_zh: `生${n}`, name_en: null, left_at });

describe("buildNoonView：還沒有紀錄", () => {
  const students = [stu(3), stu(1), stu(2, "2026-10-01T00:00:00Z")];
  const v = buildNoonView(null, templates, students);
  it("用範本（未停用、依順序）與在籍學生（依座號）", () => {
    expect(v.items.map((i) => [i.template_id, i.day_item_id, i.deadline])).toEqual([["t1", null, "12:40"], ["t2", null, "12:40"]]);
    expect(v.students.map((s) => s.student_no)).toEqual([1, 3]);
  });
  it("全部未完成、沒人請假", () => {
    expect(v.mark("t1", "s1")).toEqual({ result: "pending", done_at: null, source: null });
    expect(v.students.every((s) => !s.on_leave)).toBe(true);
  });
});

/** 30 人、5 項任務的一天：第 1、2 號請假；第 3 號各項都準時；第 4 號各項都逾時（補登）；其餘未完成 */
function day30(): NoonDay {
  const dayItems = [0, 1, 2, 3, 4].map((i) => ({
    id: `di${i}`, day_id: "d", template_id: `t${i}`, name: `任務${i}`, deadline: "12:40:00", sort_order: i,
  }));
  const dayStudents = Array.from({ length: 30 }, (_, k) => ({
    day_id: "d", student_id: `s${k + 1}`, student_no: k + 1, name_zh: `生${k + 1}`, on_leave: k < 2, removed_at: null as string | null,
  }));
  dayStudents.push({ day_id: "d", student_id: "sx", student_no: 31, name_zh: "轉出", on_leave: false, removed_at: "2026-10-21T01:00:00Z" });
  const marks: NoonMark[] = [];
  for (const di of dayItems) {
    for (const s of dayStudents) {
      let m: Pick<NoonMark, "result" | "done_at" | "source"> = { result: "pending", done_at: null, source: null };
      if (s.student_id === "s3") m = { result: "ontime", done_at: "2026-10-21T04:30:00Z", source: "student" };
      if (s.student_id === "s4") m = { result: "late", done_at: "2026-10-21T04:50:00Z", source: "teacher" };
      if (s.student_id === "s1") m = { result: "ontime", done_at: "2026-10-21T04:30:00Z", source: "student" }; // 請假前打的卡：不計
      marks.push({ day_item_id: di.id, student_id: s.student_id, day_id: "d", ...m });
    }
  }
  return {
    id: "d", class_id: "c", date: "2026-10-21", status: "open", settled_at: null, settled_version: null, settled_summary: null,
    scheduled_archive_at: "2026-10-21T09:00:00Z", archived_at: null, archived_by: null, final_summary: null, revised_at: null,
    noon_day_items: dayItems, noon_day_students: dayStudents, noon_marks: marks,
  };
}

describe("buildNoonView：有紀錄就用快照", () => {
  it("用快照的名稱與名單，轉出的不列入", () => {
    const d = day30();
    d.noon_day_items[0].name = "快照名稱";
    const v = buildNoonView(d, [{ ...templates[0], id: "t0", name: "新名稱" }], [stu(99)]);
    expect(v.items[0]).toMatchObject({ template_id: "t0", day_item_id: "di0", name: "快照名稱" });
    expect(v.students).toHaveLength(30);
    expect(v.students[0]).toMatchObject({ student_id: "s1", on_leave: true });
    expect(v.mark("t0", "s3").result).toBe("ontime");
    expect(v.mark("t0", "s4")).toEqual({ result: "late", done_at: "2026-10-21T04:50:00Z", source: "teacher" });
    expect(v.mark("nope", "s3").result).toBe("pending");
  });
});

describe("computeSummary", () => {
  const sum = computeSummary(buildNoonView(day30(), [], []));
  it("請假 2 人：每項任務分母 28，請假數記在 leave", () => {
    expect(sum.items).toHaveLength(5);
    for (const it of sum.items) expect(it).toMatchObject({ ontime: 1, late: 1, pending: 26, leave: 2, total: 28 });
  });
  it("ontime + late + pending = total（任務與學生）", () => {
    for (const it of sum.items) expect(it.ontime + it.late + it.pending).toBe(it.total);
    for (const s of sum.students) expect(s.ontime + s.late + s.pending).toBe(s.total);
  });
  it("請假學生整列都是 0（即使請假前已打卡）", () => {
    expect(sum.students[0]).toEqual({ student_id: "s1", student_no: 1, name_zh: "生1", on_leave: true, ontime: 0, late: 0, pending: 0, total: 0 });
  });
  it("一般學生的分母是任務數", () => {
    expect(sum.students[2]).toMatchObject({ student_id: "s3", ontime: 5, late: 0, pending: 0, total: 5 });
    expect(sum.students[3]).toMatchObject({ student_id: "s4", ontime: 0, late: 5, pending: 0, total: 5 });
    expect(sum.students[4]).toMatchObject({ pending: 5, total: 5 });
  });
  it("全班合計：只算沒轉出的學生", () => {
    expect(sum.overall).toEqual({ ontime: 5, late: 5, pending: 130, total: 140, students: 30, leave_students: 2, items: 5 });
  });
  it("欄位與 SQL 的 JSON 形狀一致", () => {
    expect(Object.keys(sum).sort()).toEqual(["items", "overall", "students"]);
    expect(Object.keys(sum.items[0]).sort()).toEqual(
      ["day_item_id", "deadline", "late", "leave", "name", "ontime", "pending", "sort_order", "template_id", "total"]);
    expect(Object.keys(sum.students[0]).sort()).toEqual(["late", "name_zh", "on_leave", "ontime", "pending", "student_id", "student_no", "total"]);
    expect(sum.items[0]).toMatchObject({ day_item_id: "di0", template_id: "t0", deadline: "12:40", sort_order: 0 });
  });
  it("沒有紀錄的預覽：全部未完成，day_item_id 是空字串", () => {
    const s = computeSummary(buildNoonView(null, templates, [stu(1), stu(2)]));
    expect(s.items.map((i) => [i.pending, i.total, i.day_item_id])).toEqual([[2, 2, ""], [2, 2, ""]]);
    expect(s.overall).toMatchObject({ pending: 4, total: 4, students: 2, items: 2 });
  });
  it("沒有學生：分母 0", () => {
    const s = computeSummary(buildNoonView(null, templates, []));
    expect(s.overall).toMatchObject({ total: 0, students: 0 });
    expect(fmtRate(s.overall.ontime, s.overall.total)).toBe("0%・0 筆");
  });
  it("總完成率", () => expect(fmtRate(sum.overall.ontime + sum.overall.late, sum.overall.total)).toBe("7.1%"));
});
