import { SubTabs } from "../../shared/ui";

export function CoinsTabs() {
  return <SubTabs tabs={[
    { to: "/coins", label: "全班總覽", end: true },
    { to: "/coins/new", label: "加扣 MUMU 幣" },
    { to: "/coins/history", label: "全班歷程" },
    { to: "/coins/student", label: "個別帳戶" },
  ]} />;
}
