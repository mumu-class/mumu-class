import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
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

export function Layout() {
  return (
    <div className="min-h-screen md:flex">
      <aside className="print:hidden hidden md:flex md:w-52 md:flex-col md:border-r md:border-line md:bg-sheet md:p-4 md:sticky md:top-0 md:h-screen">
        <div className="mb-6">
          <div className="text-lg font-black">MuMu 班級工作台</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => `rounded-lg px-3 py-2 font-bold ${isActive ? "bg-sage text-white" : "hover:bg-sage-soft"}`}>
              <span className="mr-2">{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="print:hidden sticky top-0 z-20 flex items-center justify-end gap-3 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
          <span className="mr-auto font-black md:hidden">MuMu 班級工作台</span>
          <SaveStatus />
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:pb-10">
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
