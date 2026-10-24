import type { CheckinEvent } from "../../../lib/types";

const ACTION_TEXT: Record<Exclude<CheckinEvent["action"], "undo">, string> = {
  done: "完成打卡", cancel: "取消打卡", exempt: "標為免交", unexempt: "取消免交",
  leave: "標為請假", unleave: "取消請假", teacher_fill: "老師補登",
};

const NOON_BACK_TO = { ontime: "準時", late: "逾時", pending: "未完成" };

type EventLike = Pick<CheckinEvent, "action" | "next" | "checkin_tasks" | "noon_day_items">;

/** 學生歷程的一行：「完成打卡・閱讀認證」。任務名稱優先用一般任務的，沒有就用中午當天的快照；請假沒有任務名稱 */
export function eventText(e: EventLike): string {
  let what: string;
  if (e.action !== "undo") what = ACTION_TEXT[e.action];
  else if (e.next?.result) what = `復原（回到${NOON_BACK_TO[e.next.result]}）`; // 中午事件記的是 result
  else what = `復原（回到${e.next?.state === "done" ? "已完成" : "未完成"}）`;
  return [what, e.checkin_tasks?.name ?? e.noon_day_items?.name].filter(Boolean).join("・");
}
