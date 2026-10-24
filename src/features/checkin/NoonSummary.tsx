import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { useToast } from "../../shared/Toast";
import { Empty, ErrorBox, Loading } from "../../shared/ui";
import { isRejected } from "./api";
import { useClassroom } from "./classroom";
import { buildNoonView, computeSummary } from "./logic/noon";
import { dateOptions, settleFreshness } from "./logic/noonPages";
import { fmtTime } from "./logic/time";
import { useNoonArchiveCatchup, useNoonDay, useNoonDays, useNoonItems, useNoonSettle, useNoonToday } from "./noonApi";
import { NoonSummaryTables } from "./NoonSummaryTables";

/** 中午每日結算（M06）：今天顯示最近一次結算（或即時預覽），封存日顯示封存當下的最終結果。網址 ?date=… */
export function NoonSummary() {
  const { cls, allStudents } = useClassData();
  const { canTeach } = useClassroom();
  const toast = useToast();
  useNoonArchiveCatchup(cls.id);
  const [params, setParams] = useSearchParams();
  const today = useNoonToday(cls.id);
  const days = useNoonDays(cls.id);
  const templates = useNoonItems(cls.id);
  const date = params.get("date") || today.data?.date || "";
  const day = useNoonDay(cls.id, date);
  const settle = useNoonSettle(cls.id, today.data?.date ?? date);

  const preview = useMemo(
    () => (day.data ? computeSummary(buildNoonView(day.data, templates.data ?? [], allStudents)) : null),
    [day.data, templates.data, allStudents],
  );

  const error = today.error || days.error || templates.error || day.error;
  if (error) return <ErrorBox error={error} />;
  if (today.isLoading || days.isLoading || templates.isLoading || !today.data) return <Loading />;

  const t = today.data;
  const d = day.data;
  const isToday = date === t.date;
  const archived = d?.status === "archived";
  const live = isToday && !archived; // 今天還在進行：顯示結算或即時預覽
  const waiting = live && t.after_cutoff; // 已過 17:00、等排程封存：打卡已鎖定，直接用目前的紀錄即時算
  const freshness = d ? settleFreshness(d.settled_at, d.settled_version, t.version) : "unsettled";
  const showSettled = live && !waiting && !!d?.settled_summary;
  const options = dateOptions(t.date, (days.data ?? []).map((r) => r.date), date, isToday && archived);

  function pick(value: string) {
    const next = new URLSearchParams(params);
    if (value === t.date) next.delete("date");
    else next.set("date", value);
    setParams(next, { replace: true });
  }
  function doSettle() {
    settle.mutate(undefined, {
      onSuccess: (r) => toast(isRejected(r) ? r.rejected : "已結算"),
      onError: () => toast("結算失敗，請再試一次"),
    });
  }

  let body;
  if (day.isLoading) body = <Loading />;
  else if (!d) body = <Empty>{isToday ? "今天還沒有任何中午打卡紀錄。" : "這天沒有中午紀錄。"}</Empty>;
  else if (archived) body = <NoonSummaryTables summary={d.final_summary!} />;
  else if (showSettled) body = <NoonSummaryTables summary={d.settled_summary!} />;
  else body = preview && <NoonSummaryTables summary={preview} />;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select aria-label="日期" className="input w-auto" value={date} onChange={(e) => pick(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {archived && <span className="chip-on">已封存</span>}
        {archived && <span className="text-muted">封存當下的最終結果</span>}
        {showSettled && d?.settled_at && <span className="text-muted">上次結算 {fmtTime(d.settled_at)}</span>}
        {live && !waiting && d && freshness === "unsettled" && <span className="text-muted">今天還沒有結算</span>}
        {waiting && <span className="text-muted">已過 17:00，等待封存</span>}
        {live && !waiting && canTeach && d && (
          <button type="button" className="btn-primary ml-auto" disabled={settle.isPending} onClick={doSettle}>
            {settle.isPending ? "結算中…" : d.settled_at ? "重新結算" : "結算今日紀錄"}
          </button>
        )}
      </div>
      {showSettled && freshness === "stale" && (
        <div role="status" className="card mb-3 border-gold-ink bg-gold-soft p-3 font-bold text-gold-ink">打卡已更新，請重新結算</div>
      )}
      {live && d && !showSettled && (
        <div className="card mb-3 bg-sage-soft p-3 text-sage">
          {waiting
            ? <><b>即時結果。</b>打卡已鎖定，依目前的紀錄計算；封存時會用最新的紀錄重算。</>
            : <><b>即時預覽，尚未結算。</b>按「結算今日紀錄」後會保存這份結果。</>}
        </div>
      )}
      {body}
    </>
  );
}
