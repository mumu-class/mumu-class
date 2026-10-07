import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-black">{children}</h1>
      {right}
    </div>
  );
}

export function SubTabs({ tabs }: { tabs: { to: string; label: string; end?: boolean }[] }) {
  return (
    <div className="tabbar mb-4">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "chip-on" : "chip")}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="p-8 text-center text-muted">{children}</div>;
}

export function Loading() {
  return <div className="p-8 text-center text-muted">載入中…</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error);
  return <div className="card border-rose bg-rose p-4 text-rose-ink">讀取資料失敗：{msg}。請重新整理頁面再試一次。</div>;
}
