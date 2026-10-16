import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ClassProvider, useClassQuery, useItemsQuery, useStudentsQuery } from "../lib/classData";
import { SaveStatus } from "../shared/SaveStatus";
import { ErrorBox, Loading } from "../shared/ui";
import { Setup } from "./Setup";

const NAV = [
  { to: "/homework", icon: "✏️", label: "作業小管家" },
  { to: "/coins", icon: "🪙", label: "MUMU 幣" },
  { to: "/seating", icon: "🪑", label: "座位表" },
  { to: "/planner", icon: "📚", label: "課程規劃" },
  { to: "/settings", icon: "⚙️", label: "設定" },
];

/** 載入班級、名單、作業項目；還沒有班級時顯示初次設定 */
export function ClassGate({ children }: { children: ReactNode }) {
  const cls = useClassQuery();
  const students = useStudentsQuery(cls.data?.id);
  const items = useItemsQuery();
  if (cls.error || students.error || items.error) return <div className="p-4"><ErrorBox error={cls.error || students.error || items.error} /></div>;
  if (cls.isLoading || items.isLoading) return <Loading />;
  if (!cls.data) return <Setup />;
  if (students.isLoading || !students.data || !items.data) return <Loading />;
  const allStudents = students.data;
  return (
    <ClassProvider value={{ cls: cls.data, allStudents, students: allStudents.filter((s) => !s.left_at), items: items.data }}>
      {children}
    </ClassProvider>
  );
}

const SIDEBAR_KEY = "mumu.sidebar";

/** 電腦版左側選單可收成只剩圖示的窄欄；記在這台裝置的瀏覽器（讀不到就預設展開） */
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === "collapsed"; } catch { return false; }
  });
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(SIDEBAR_KEY, c ? "open" : "collapsed"); } catch { /* 無痕模式等情況寫不進去，只影響下次開啟 */ }
    return !c;
  });
  return [collapsed, toggle] as const;
}

export function Layout() {
  const [collapsed, toggle] = useSidebarCollapsed();
  // 課程規劃表是寬表格，不受內容最大寬度限制
  const wide = useLocation().pathname.startsWith("/planner");
  return (
    <div className="min-h-screen md:flex">
      <aside className={`print:hidden hidden md:flex md:flex-col md:border-r md:border-line md:bg-sheet md:sticky md:top-0 md:h-screen ${collapsed ? "md:w-16 md:p-2" : "md:w-52 md:p-4"}`}>
        {!collapsed && <div className="mb-6 text-lg font-black">MuMu 班級工作台</div>}
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} title={collapsed ? n.label : undefined} aria-label={collapsed ? n.label : undefined}
              className={({ isActive }) => `rounded-lg py-2 font-bold ${collapsed ? "text-center text-lg" : "px-3"} ${isActive ? "bg-sage text-white" : "hover:bg-sage-soft"}`}>
              {collapsed ? n.icon : <><span className="mr-2">{n.icon}</span>{n.label}</>}
            </NavLink>
          ))}
        </nav>
        <button onClick={toggle} aria-label={collapsed ? "展開選單" : "收合選單"} title={collapsed ? "展開選單" : "收合選單"}
          className={`mt-auto rounded-lg py-2 text-sm font-bold text-muted hover:bg-sage-soft ${collapsed ? "text-center" : "px-3 text-left"}`}>
          {collapsed ? "»" : "« 收合選單"}
        </button>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="print:hidden sticky top-0 z-20 flex items-center justify-end gap-3 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
          <span className="mr-auto font-black md:hidden">MuMu 班級工作台</span>
          <SaveStatus />
        </header>
        <main className={`mx-auto px-4 pb-28 pt-4 md:pb-10 ${wide ? "" : "max-w-6xl"}`}>
          <Outlet />
        </main>
      </div>

      <nav className="print:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-sheet/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to}
            className={({ isActive }) => `flex flex-col items-center py-2 text-xs font-bold ${isActive ? "text-sage" : "text-muted"}`}>
            <span className="text-xl leading-none">{n.icon}</span>
            <span className="mt-1">{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
