import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/** 右上角儲存狀態：已儲存／儲存中／有 N 筆未儲存（點擊重試） */
export function SaveStatus() {
  const qc = useQueryClient();
  const pending = useIsMutating();
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    const cache = qc.getMutationCache();
    const count = () => setFailed(cache.getAll().filter((m) => m.state.status === "error").length);
    count();
    return cache.subscribe(count);
  }, [qc]);

  const retry = () => {
    qc.getMutationCache().getAll()
      .filter((m) => m.state.status === "error")
      .forEach((m) => { m.execute(m.state.variables).catch(() => {}); });
  };

  if (failed) {
    return (
      <button onClick={retry} className="rounded-full bg-rose px-3 py-1 text-sm font-bold text-rose-ink">
        ⚠ 有 {failed} 筆未儲存，點此重試
      </button>
    );
  }
  if (pending) return <span className="text-sm text-muted">◌ 儲存中…</span>;
  return <span className="text-sm text-muted"><span className="text-sage">●</span> 已儲存</span>;
}
