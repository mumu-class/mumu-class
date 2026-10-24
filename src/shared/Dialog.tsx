import type { ReactNode } from "react";

export function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`card max-h-[90dvh] w-full overflow-auto p-5 ${wide ? "max-w-2xl" : "max-w-sm"}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-black">{title}</h2>
          <button type="button" className="btn px-2 py-1" aria-label="關閉" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
