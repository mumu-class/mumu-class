import type { CheckinMark, CheckinStudentMark, NoonDayRow, NoonResult, NoonSource } from "../../../lib/types";
import { fmtRate, hhmm } from "./noon";
import type { MissingRow } from "./stats";
import { fmtStamp } from "./time";

// Excel 匯出的欄位（設計 §9）。純函式：只負責把畫面上已有的資料排成「表頭＋列」，寫檔在 exportXlsx.ts

export type Cell = string | number | null;
export type ExportSheet = { sheet: string; header: string[]; rows: Cell[][] };

const TASK_STATE: Record<CheckinMark["state"], string> = { done: "已完成", pending: "未完成", exempt: "免交" };

/** 缺交清單：一位學生一列，缺交任務用「、」串起來；scopeLabel 是「進行中」或批次名稱 */
export function missingRows(rows: MissingRow[], scopeLabel: string): ExportSheet {
  return {
    sheet: "缺交清單",
    header: ["座號", "姓名", "缺交任務", "缺幾項", "範圍"],
    rows: rows.map((r) => [r.student_no, r.name_zh, r.tasks.map((t) => t.name).join("、"), r.tasks.length, scopeLabel]),
  };
}

/** 一般任務個人紀錄：照傳入的順序輸出；batchTitle 是封存批次的 id → 名稱 */
export function taskStudentRows(marks: CheckinStudentMark[], batchTitle: Map<string, string>, sheetName = "一般任務"): ExportSheet {
  return {
    sheet: sheetName,
    header: ["日期", "任務", "狀態", "打卡時間", "來源"],
    rows: marks.map((m) => [
      m.checkin_tasks.task_date,
      m.checkin_tasks.name,
      TASK_STATE[m.state],
      m.done_at ? fmtStamp(m.done_at) : null,
      m.checkin_tasks.status === "open" ? "進行中" : batchTitle.get(m.checkin_tasks.batch_id ?? "") ?? "封存",
    ]),
  };
}

/** 中午每日統計：每個已封存日先列全班各項任務，再列個別學生。沒有 final_summary 的日子略過 */
export function noonDailyRows(days: NoonDayRow[]): ExportSheet {
  const rows: Cell[][] = [];
  for (const d of days) {
    const s = d.final_summary;
    if (!s) continue;
    for (const it of s.items) {
      rows.push([
        d.date, "全班任務", it.name, it.ontime, it.late, it.pending, it.leave, it.total,
        fmtRate(it.ontime, it.total), fmtRate(it.late, it.total), fmtRate(it.ontime + it.late, it.total),
      ]);
    }
    for (const st of s.students) {
      const who = `${st.student_no} ${st.name_zh}`;
      rows.push(st.on_leave
        ? [d.date, "個別學生", who, 0, 0, 0, 1, 0, "請假", "請假", "請假"]
        : [d.date, "個別學生", who, st.ontime, st.late, st.pending, 0, st.total,
          fmtRate(st.ontime, st.total), fmtRate(st.late, st.total), fmtRate(st.ontime + st.late, st.total)]);
    }
  }
  return {
    sheet: "中午每日統計",
    header: ["日期", "統計對象", "座號或任務", "準時", "逾時", "未完成", "請假", "應完成數", "準時率", "逾時率", "總完成率"],
    rows,
  };
}

/** 一位學生在某一天的中午紀錄（含任務快照）；由 noonApi 的 fetchNoonStudentHistory 組出來 */
export type NoonStudentDay = {
  date: string; archived: boolean; on_leave: boolean;
  items: { name: string; deadline: string; sort_order: number; result: NoonResult; done_at: string | null; source: NoonSource | null }[];
};

/** 中午個人歷程：日期新到舊，同一天依任務順序。請假的日子每項任務都是「請假」 */
export function noonStudentRows(days: NoonStudentDay[]): ExportSheet {
  const rows: Cell[][] = [];
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  for (const d of sorted) {
    for (const it of [...d.items].sort((a, b) => a.sort_order - b.sort_order)) {
      const status = d.on_leave ? "請假" : it.result === "ontime" ? "準時" : it.result === "late" ? "逾時" : "未完成";
      rows.push([
        d.date, it.name, hhmm(it.deadline), it.done_at ? fmtStamp(it.done_at) : null, status,
        it.source === "teacher" ? "老師補登" : it.source === "student" ? "學生打卡" : null,
        d.archived ? "已封存" : "進行中",
      ]);
    }
  }
  return {
    sheet: "中午歷程",
    header: ["日期", "任務", "截止時間", "實際打卡時間", "完成狀態", "來源", "封存狀態"],
    rows,
  };
}
