import { SubTabs } from "../../shared/ui";

export function HomeworkTabs() {
  return <SubTabs tabs={[
    { to: "/homework", label: "今日作業", end: true },
    { to: "/homework/missing", label: "缺交總覽" },
    { to: "/homework/history", label: "學生歷程" },
  ]} />;
}
