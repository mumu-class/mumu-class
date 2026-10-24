import type { NoonItem, NoonTimelineEntry } from "../../../lib/types";
import { hhmm } from "./noon";

// 中午的結算、歷程、封存、設定頁共用的純函式

export type DateOption = { value: string; label: string };

/**
 * 日期下拉：今天排第一（還沒有紀錄也列出來），後面是已封存的日期，新到舊。
 * selected 是網址帶來的日期，不在清單裡也補上，讓下拉不會顯示成空白
 */
export function dateOptions(today: string, archived: string[], selected = "", todayArchived = false): DateOption[] {
  const opts: DateOption[] = [{ value: today, label: `${today}（今天${todayArchived ? "・已封存" : ""}）` }];
  for (const d of [...new Set(archived)].filter((d) => d !== today).sort().reverse()) opts.push({ value: d, label: `${d}（已封存）` });
  if (selected && !opts.some((o) => o.value === selected)) opts.push({ value: selected, label: selected });
  return opts;
}

/** 今天的結算狀態：從沒結算、最新、或結算之後又有打卡（version 是當天事件數，設計文件差異表） */
export function settleFreshness(settledAt: string | null, settledVersion: number | null, version: number): "unsettled" | "fresh" | "stale" {
  if (!settledAt) return "unsettled";
  return version > (settledVersion ?? 0) ? "stale" : "fresh";
}

/** 把第 i 個往上（-1）或往下（+1）移一格；超出範圍就原樣回傳 */
export function moveItem<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const DEFAULT_NOON_TIMELINE: NoonTimelineEntry[] = [
  { time: "12:30", label: "加餐、倒餐" }, { time: "12:40", label: "全班收餐" }, { time: "12:45", label: "回到座位" },
];

/** 設定頁上一列固定任務。id 沒有表示還沒存過；disabled 是已按停用、儲存時才會寫入 archived_at */
export type ItemRow = { key: string; id?: string; name: string; deadline: string; disabled: boolean };

export function rowsFromItems(items: NoonItem[]): ItemRow[] {
  return items.filter((i) => !i.archived_at).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((i) => ({ key: i.id, id: i.id, name: i.name, deadline: hhmm(i.deadline), disabled: false }));
}

/** 啟用中的任務名稱不能空白，截止時間一定要有 */
export function itemRowsValid(rows: ItemRow[]): boolean {
  return rows.filter((r) => !r.disabled).every((r) => r.name.trim() !== "" && /^\d{2}:\d{2}$/.test(r.deadline));
}

/** 存檔內容：啟用的依畫面順序重編 sort_order；停用的（已存過的）送 archived_at，排在最後 */
export function toItemInputs(rows: ItemRow[], nowIso: string) {
  const active = rows.filter((r) => !r.disabled);
  const off = rows.filter((r) => r.disabled && r.id);
  return [
    ...active.map((r, i) => ({ ...(r.id ? { id: r.id } : {}), name: r.name.trim(), deadline: r.deadline, sort_order: i, archived_at: null })),
    ...off.map((r, i) => ({ id: r.id, name: r.name.trim() || "（未命名）", deadline: r.deadline, sort_order: active.length + i, archived_at: nowIso })),
  ];
}

/** 午餐時序：每一格都要有時間和文字，存檔時依時間排序 */
export function timelineValid(rows: NoonTimelineEntry[]): boolean {
  return rows.every((r) => /^\d{2}:\d{2}$/.test(r.time) && r.label.trim() !== "");
}

export function toTimeline(rows: NoonTimelineEntry[]): NoonTimelineEntry[] {
  return rows.map((r) => ({ time: r.time, label: r.label.trim() })).sort((a, b) => a.time.localeCompare(b.time));
}
