import { describe, expect, it } from "vitest";
import type { CheckinStudentMark, CheckinTask, NoonDayRow, NoonSummary } from "../../../lib/types";
import { missingRows, noonDailyRows, noonStudentRows, taskStudentRows, type NoonStudentDay } from "./exportRows";

const task = (name: string): CheckinTask => ({
  id: name, class_id: "c", slot: 1, name, task_date: "2026-10-20", due_date: null, note: "", status: "open", batch_id: null, archived_at: null, checkin_task_marks: [],
});

describe("missingRows", () => {
  it("表頭與一列：任務用「、」串起來", () => {
    const s = missingRows([{ student_id: "a", student_no: 3, name_zh: "王小明", tasks: [task("國語習作"), task("數學卷")] }], "進行中");
    expect(s.header).toEqual(["座號", "姓名", "缺交任務", "缺幾項", "範圍"]);
    expect(s.rows).toEqual([[3, "王小明", "國語習作、數學卷", 2, "進行中"]]);
  });
  it("沒有資料只有表頭", () => expect(missingRows([], "進行中").rows).toEqual([]));
});

describe("taskStudentRows", () => {
  const mark = (state: "done" | "pending" | "exempt", done_at: string | null, status: "open" | "archived", batch: string | null): CheckinStudentMark => ({
    task_id: "t", student_id: "s", student_no: 1, name_zh: "甲", state, done_at, removed_at: null,
    checkin_tasks: { name: "國語習作", slot: 1, task_date: "2026-10-20", status, batch_id: batch },
  });
  it("表頭、已完成列（台北時間）、來源是批次名稱", () => {
    const s = taskStudentRows([mark("done", "2026-10-20T04:25:00Z", "archived", "b1")], new Map([["b1", "第一週"]]));
    expect(s.header).toEqual(["日期", "任務", "狀態", "打卡時間", "來源"]);
    expect(s.rows[0]).toEqual(["2026-10-20", "國語習作", "已完成", "2026-10-20 12:25", "第一週"]);
  });
  it("未完成沒有打卡時間、免交、進行中", () => {
    const s = taskStudentRows([mark("pending", null, "open", null), mark("exempt", null, "open", null)], new Map());
    expect(s.rows[0]).toEqual(["2026-10-20", "國語習作", "未完成", null, "進行中"]);
    expect(s.rows[1][2]).toBe("免交");
  });
  it("批次名稱找不到時寫「封存」", () => {
    expect(taskStudentRows([mark("done", null, "archived", "x")], new Map()).rows[0][4]).toBe("封存");
  });
});

const summary: NoonSummary = {
  items: [{ day_item_id: "i1", template_id: "t1", name: "收簿本", deadline: "12:40", sort_order: 0, ontime: 1, late: 1, pending: 0, leave: 1, total: 2 }],
  students: [
    { student_id: "a", student_no: 1, name_zh: "甲", on_leave: false, ontime: 1, late: 0, pending: 0, total: 1 },
    { student_id: "b", student_no: 2, name_zh: "乙", on_leave: false, ontime: 0, late: 1, pending: 0, total: 1 },
    { student_id: "c", student_no: 3, name_zh: "丙", on_leave: true, ontime: 0, late: 0, pending: 0, total: 0 },
  ],
  overall: { ontime: 1, late: 1, pending: 0, total: 2, students: 3, leave_students: 1, items: 1 },
};
const day = (date: string, final_summary: NoonSummary | null): NoonDayRow => ({
  id: date, class_id: "c", date, status: "archived", settled_at: null, settled_version: null, settled_summary: null,
  scheduled_archive_at: "", archived_at: null, archived_by: "schedule", final_summary, revised_at: null,
});

describe("noonDailyRows", () => {
  const s = noonDailyRows([day("2026-10-23", summary)]);
  it("表頭", () => expect(s.header).toEqual(["日期", "統計對象", "座號或任務", "準時", "逾時", "未完成", "請假", "應完成數", "準時率", "逾時率", "總完成率"]));
  it("先全班任務再個別學生", () => {
    expect(s.rows.map((r) => r[1])).toEqual(["全班任務", "個別學生", "個別學生", "個別學生"]);
    expect(s.rows[0]).toEqual(["2026-10-23", "全班任務", "收簿本", 1, 1, 0, 1, 2, "50.0%", "50.0%", "100.0%"]);
    expect(s.rows[1]).toEqual(["2026-10-23", "個別學生", "1 甲", 1, 0, 0, 0, 1, "100.0%", "0.0%", "100.0%"]);
  });
  it("請假學生：請假 1、其他 0、比率欄「請假」", () => {
    expect(s.rows[3]).toEqual(["2026-10-23", "個別學生", "3 丙", 0, 0, 0, 1, 0, "請假", "請假", "請假"]);
  });
  it("沒有 final_summary 的日子略過；沒有日子是空", () => {
    expect(noonDailyRows([day("2026-10-22", null)]).rows).toEqual([]);
    expect(noonDailyRows([]).rows).toEqual([]);
  });
  it("分母是 0 時比率照 fmtRate", () => {
    const zero: NoonSummary = { ...summary, items: [{ ...summary.items[0], ontime: 0, late: 0, total: 0 }], students: [] };
    expect(noonDailyRows([day("d", zero)]).rows[0].slice(8)).toEqual(["0%・0 筆", "0%・0 筆", "0%・0 筆"]);
  });
});

describe("noonStudentRows", () => {
  const d = (date: string, on_leave: boolean, archived = true): NoonStudentDay => ({
    date, archived, on_leave,
    items: [
      { name: "交聯絡簿", deadline: "12:40:00", sort_order: 1, result: "late", done_at: "2026-10-23T04:41:00Z", source: "teacher" },
      { name: "收簿本", deadline: "12:30:00", sort_order: 0, result: "ontime", done_at: "2026-10-23T04:20:00Z", source: "student" },
      { name: "倒餐", deadline: "12:45:00", sort_order: 2, result: "pending", done_at: null, source: null },
    ],
  });
  it("表頭、依任務順序、狀態與來源", () => {
    const s = noonStudentRows([d("2026-10-23", false)]);
    expect(s.header).toEqual(["日期", "任務", "截止時間", "實際打卡時間", "完成狀態", "來源", "封存狀態"]);
    expect(s.rows[0]).toEqual(["2026-10-23", "收簿本", "12:30", "2026-10-23 12:20", "準時", "學生打卡", "已封存"]);
    expect(s.rows[1]).toEqual(["2026-10-23", "交聯絡簿", "12:40", "2026-10-23 12:41", "逾時", "老師補登", "已封存"]);
    expect(s.rows[2]).toEqual(["2026-10-23", "倒餐", "12:45", null, "未完成", null, "已封存"]);
  });
  it("請假的日子每項都是請假；進行中；日期新到舊", () => {
    const s = noonStudentRows([d("2026-10-22", true), d("2026-10-24", false, false)]);
    expect(s.rows[0][0]).toBe("2026-10-24");
    expect(s.rows[0][6]).toBe("進行中");
    expect(s.rows.filter((r) => r[0] === "2026-10-22").every((r) => r[4] === "請假")).toBe(true);
  });
  it("沒有資料是空", () => expect(noonStudentRows([]).rows).toEqual([]));
});
