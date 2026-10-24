import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { SaveStatus } from "../../shared/SaveStatus";
import { useToast } from "../../shared/Toast";
import { PageTitle, SubTabs } from "../../shared/ui";
import { useCheckinSettings } from "./api";
import { useClassroom } from "./classroom";
import { NoonClock } from "./NoonClock";
import { PinPad } from "./PinPad";

const TABS = [
  { to: "/checkin", label: "打卡台", end: true },
  { to: "/checkin/missing", label: "缺交總覽" },
  { to: "/checkin/history", label: "學生歷程" },
  { to: "/checkin/archive", label: "封存紀錄" },
];

const NOON_TABS = [
  { to: "/checkin/noon", label: "中午打卡台", end: true },
  { to: "/checkin/noon/summary", label: "每日結算" },
  { to: "/checkin/noon/history", label: "學生歷程" },
  { to: "/checkin/noon/archive", label: "每日封存" },
];

/** 目前在哪個系列：/checkin/noon 開頭是中午時段，其餘是一般任務 */
const useIsNoon = () => useLocation().pathname.startsWith("/checkin/noon");

/** 系列切換（任務打卡｜中午時段）。教室模式的標題列用 compact 縮小，讓一列放得下 */
function SeriesSwitch({ compact = false }: { compact?: boolean }) {
  const noon = useIsNoon();
  const base = compact ? "px-2.5 py-1 text-xs" : "px-4 py-1.5 text-sm";
  const seg = (on: boolean) => `${base} rounded-full font-bold whitespace-nowrap ${on ? "bg-ink text-sheet" : "text-muted"}`;
  return (
    <nav aria-label="任務系列" className="inline-flex shrink-0 gap-0.5 rounded-full border border-line bg-paper p-0.5">
      <Link to="/checkin" aria-current={noon ? undefined : "page"} className={seg(!noon)}>任務打卡</Link>
      <Link to="/checkin/noon" aria-current={noon ? "page" : undefined} className={seg(noon)}>中午時段</Link>
    </nav>
  );
}

/** /checkin/* 的外框：一般模式用工作台的標題與分頁；教室模式只有一列精簡的標題列 */
export function CheckinShell() {
  const { classroom } = useClassroom();
  const noon = useIsNoon();
  if (classroom) {
    return (
      <>
        <ClassroomBar />
        <div className="px-3 py-2"><Outlet /></div>
      </>
    );
  }
  return (
    <>
      <PageTitle right={<div className="flex items-center gap-3">{noon && <NoonClock className="text-xl" />}<EnterClassroom /></div>}>
        {noon ? "任務打卡・中午時段" : "任務打卡"}
      </PageTitle>
      <div className="mb-3"><SeriesSwitch /></div>
      <SubTabs tabs={noon ? NOON_TABS : TABS} />
      <Outlet />
    </>
  );
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

function EnterClassroom() {
  const { cls } = useClassData();
  const settings = useCheckinSettings(cls.id);
  const { enter } = useClassroom();
  const navigate = useNavigate();
  const noon = useIsNoon();
  const toast = useToast();
  const hasPin = !!settings.data?.pin_hash;
  return (
    <div className="flex items-center gap-2">
      {settings.data !== undefined && !hasPin && <Link to="/settings" className="text-sm text-muted underline">先到設定頁設定 PIN</Link>}
      <button type="button" className="btn-primary" disabled={!hasPin} onClick={() => {
        enter();
        navigate(noon ? "/checkin/noon" : "/checkin");
        if (!isStandalone()) toast("建議把網站「加入主畫面」，用全螢幕開啟");
      }}>進入教室模式</button>
    </div>
  );
}

/** 教室模式的標題列：一列、高度 ≤ 56pt（設計 §7.2）。老師的工具要先用 PIN 解鎖 */
function ClassroomBar() {
  const { cls } = useClassData();
  const settings = useCheckinSettings(cls.id);
  const { unlocked, unlock, lock, exit } = useClassroom();
  const navigate = useNavigate();
  const noon = useIsNoon();
  const [askPin, setAskPin] = useState(false);
  // 中午系列多了切換與時鐘，標題列的按鈕與分頁都縮小一點，保持一列（≤ 56pt）
  const small = "px-2.5! py-1! text-xs!";
  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-line bg-sheet px-3"
      style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <span className="shrink-0 font-black">✅ 任務打卡</span>
      <SeriesSwitch compact />
      <nav className="flex gap-1">
        {(noon ? NOON_TABS : TABS).map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `${isActive ? "chip-on" : "chip"} ${small}`}>{t.label}</NavLink>
        ))}
      </nav>
      <span className="ml-auto flex shrink-0 items-center gap-3">
        {noon && <NoonClock />}
        <SaveStatus />
      </span>
      {unlocked ? (
        <>
          <button type="button" className={`btn ${small}`} onClick={() => { exit(); navigate("/settings"); }}>名單、設定與備份</button>
          <button type="button" className={`btn ${small}`} onClick={exit}>離開教室模式</button>
          <button type="button" className={`btn-primary ${small}`} onClick={lock}>上鎖</button>
        </>
      ) : (
        <button type="button" className={`btn ${small}`} onClick={() => setAskPin(true)}>🔒 老師</button>
      )}
      {askPin && (
        <PinPad salt={settings.data?.pin_salt ?? null} hash={settings.data?.pin_hash ?? null}
          onSuccess={() => { setAskPin(false); unlock(); }} onCancel={() => setAskPin(false)} />
      )}
    </header>
  );
}
