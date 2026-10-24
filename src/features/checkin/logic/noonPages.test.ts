import { describe, expect, it } from "vitest";
import type { NoonItem } from "../../../lib/types";
import { dateOptions, itemRowsValid, moveItem, rowsFromItems, settleFreshness, timelineValid, toItemInputs, toTimeline } from "./noonPages";

describe("dateOptions", () => {
  it("今天排第一，已封存的新到舊", () => {
    const o = dateOptions("2026-10-24", ["2026-10-21", "2026-10-23", "2026-10-22"]);
    expect(o.map((x) => x.value)).toEqual(["2026-10-24", "2026-10-23", "2026-10-22", "2026-10-21"]);
    expect(o[0].label).toBe("2026-10-24（今天）");
    expect(o[1].label).toBe("2026-10-23（已封存）");
  });
  it("今天已封存時不重複，標示已封存", () => {
    const o = dateOptions("2026-10-24", ["2026-10-24", "2026-10-23"], "", true);
    expect(o.map((x) => x.value)).toEqual(["2026-10-24", "2026-10-23"]);
    expect(o[0].label).toBe("2026-10-24（今天・已封存）");
  });
  it("網址帶來的日期不在清單裡也補上", () => {
    expect(dateOptions("2026-10-24", [], "2026-10-01").map((x) => x.value)).toEqual(["2026-10-24", "2026-10-01"]);
    expect(dateOptions("2026-10-24", [], "2026-10-24")).toHaveLength(1);
  });
});

describe("settleFreshness", () => {
  it("沒結算過", () => expect(settleFreshness(null, null, 5)).toBe("unsettled"));
  it("結算後沒有新打卡", () => expect(settleFreshness("2026-10-24T04:43:00Z", 12, 12)).toBe("fresh"));
  it("結算後又打卡", () => expect(settleFreshness("2026-10-24T04:43:00Z", 12, 13)).toBe("stale"));
  it("結算時一筆事件都沒有", () => expect(settleFreshness("2026-10-24T04:43:00Z", 0, 1)).toBe("stale"));
});

describe("moveItem", () => {
  it("上下移動，邊界不動", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

const item = (id: string, name: string, sort_order: number, archived_at: string | null = null): NoonItem =>
  ({ id, class_id: "c", name, deadline: "12:40:00", sort_order, archived_at });

describe("固定任務存檔", () => {
  const rows = rowsFromItems([item("b", "清潔桌面", 1), item("a", "喝水", 0), item("x", "舊的", 2, "2026-01-01T00:00:00Z")]);
  it("讀入：不含已停用、依順序、截止時間取到分鐘", () => {
    expect(rows.map((r) => r.name)).toEqual(["喝水", "清潔桌面"]);
    expect(rows[0].deadline).toBe("12:40");
  });
  it("依畫面順序重編 sort_order，新增的沒有 id，停用的送 archived_at 並排在最後", () => {
    const edited = [...moveItem(rows, 0, 1), { key: "n1", name: " 新任務 ", deadline: "12:50", disabled: false }];
    edited[0] = { ...edited[0], disabled: true };
    const out = toItemInputs(edited, "NOW");
    expect(out.map((o) => [o.id, o.name, o.sort_order, o.archived_at])).toEqual([
      ["a", "喝水", 0, null], [undefined, "新任務", 1, null], ["b", "清潔桌面", 2, "NOW"],
    ]);
  });
  it("名稱空白不能存，停用的列不檢查", () => {
    expect(itemRowsValid([{ key: "1", name: "  ", deadline: "12:40", disabled: false }])).toBe(false);
    expect(itemRowsValid([{ key: "1", name: "", deadline: "12:40", disabled: true }])).toBe(true);
    expect(itemRowsValid([{ key: "1", name: "a", deadline: "", disabled: false }])).toBe(false);
  });
});

describe("午餐時序", () => {
  it("每格都要有時間和文字", () => {
    expect(timelineValid([{ time: "12:30", label: "加餐" }])).toBe(true);
    expect(timelineValid([{ time: "", label: "加餐" }])).toBe(false);
    expect(timelineValid([{ time: "12:30", label: " " }])).toBe(false);
  });
  it("存檔時依時間排序並去掉文字前後空白", () => {
    expect(toTimeline([{ time: "12:45", label: " 回座 " }, { time: "12:30", label: "加餐" }]))
      .toEqual([{ time: "12:30", label: "加餐" }, { time: "12:45", label: "回座" }]);
  });
});
