import type { CheckinEvent } from "../../../lib/types";

const ACTION_TEXT: Record<Exclude<CheckinEvent["action"], "undo">, string> = {
  done: "完成打卡", cancel: "取消打卡", exempt: "標為免交", unexempt: "取消免交",
  leave: "標為請假", unleave: "取消請假", teacher_fill: "老師補登",
};

/** 學生歷程的一行：「完成打卡・閱讀認證」 */
export function eventText(e: Pick<CheckinEvent, "action" | "next" | "checkin_tasks">): string {
  const what = e.action === "undo" ? `復原（回到${e.next?.state === "done" ? "已完成" : "未完成"}）` : ACTION_TEXT[e.action];
  return [what, e.checkin_tasks?.name].filter(Boolean).join("・");
}
