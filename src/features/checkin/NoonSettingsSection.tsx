import { useState } from "react";
import { useClassData } from "../../lib/classData";
import type { NoonTimelineEntry } from "../../lib/types";
import { useToast } from "../../shared/Toast";
import { useCheckinSettings } from "./api";
import { DEFAULT_NOON_TIMELINE, itemRowsValid, moveItem, rowsFromItems, timelineValid, toItemInputs, toTimeline, type ItemRow } from "./logic/noonPages";
import { useNoonItems, useSaveNoonItems, useSaveNoonTimeline } from "./noonApi";

const NOTE = "修改後從下一個新的打卡日生效，今天已開始的不變。";
let seq = 0;
const newKey = () => `new-${++seq}`;

/** 設定頁：中午的固定任務與午餐時序。比照 CheckinPinSection 的卡片與提示 */
export function NoonSettingsSection() {
  const { cls } = useClassData();
  const items = useNoonItems(cls.id);
  const settings = useCheckinSettings(cls.id);
  const rows = items.data ? rowsFromItems(items.data) : null;
  const timeline = settings.data?.noon_timeline ?? DEFAULT_NOON_TIMELINE;

  if (items.error || settings.error) return <section className="card p-4 text-rose-ink">中午任務設定讀取失敗，請重新整理頁面。</section>;
  if (!rows || settings.isLoading) return <section className="card p-4 text-muted">載入中…</section>;

  // 存檔後重新讀取，資料變了就以新的內容重建編輯區（新增的列才會拿到 id）
  return (
    <section className="card p-4">
      <h2 className="mb-1 text-lg font-black">中午時段｜固定任務與午餐時序</h2>
      <p className="mb-3 text-sm text-muted">{NOTE}</p>
      <ItemsEditor key={JSON.stringify(rows)} classId={cls.id} initial={rows} />
      <TimelineEditor key={JSON.stringify(timeline)} classId={cls.id} initial={timeline} />
    </section>
  );
}

function ItemsEditor({ classId, initial }: { classId: string; initial: ItemRow[] }) {
  const toast = useToast();
  const save = useSaveNoonItems(classId);
  const [rows, setRows] = useState(initial);
  const patch = (i: number, p: Partial<ItemRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const active = rows.filter((r) => !r.disabled).length;

  function submit() {
    if (!itemRowsValid(rows)) { toast("任務名稱不能空白，截止時間也要填"); return; }
    if (active === 0) { toast("至少要保留一項固定任務"); return; }
    save.mutate(toItemInputs(rows, new Date().toISOString()), {
      onSuccess: () => toast("已儲存固定任務，從下一個新的打卡日生效"),
      onError: () => toast("儲存失敗，請再試一次"),
    });
  }

  return (
    <div className="mb-5">
      <div className="mb-2 text-sm font-black text-sage">固定任務</div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className={`grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_8rem_auto_auto] ${r.disabled ? "opacity-50" : ""}`}>
            <input aria-label="任務名稱" className="input" placeholder="任務名稱" value={r.name} disabled={r.disabled}
              onChange={(e) => patch(i, { name: e.target.value })} />
            <input aria-label="截止時間" className="input" type="time" value={r.deadline} disabled={r.disabled}
              onChange={(e) => patch(i, { deadline: e.target.value })} />
            <span className="flex gap-1">
              <button type="button" className="btn px-2" aria-label="上移" disabled={r.disabled || i === 0} onClick={() => setRows(moveItem(rows, i, -1))}>↑</button>
              <button type="button" className="btn px-2" aria-label="下移" disabled={r.disabled || i === rows.length - 1} onClick={() => setRows(moveItem(rows, i, 1))}>↓</button>
            </span>
            {r.disabled
              ? <button type="button" className="btn-soft" onClick={() => patch(i, { disabled: false })}>恢復</button>
              : <button type="button" className="btn-danger" onClick={() => setRows(r.id ? rows.map((x, j) => (j === i ? { ...x, disabled: true } : x)) : rows.filter((_, j) => j !== i))}>停用</button>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => setRows([...rows, { key: newKey(), name: "", deadline: "12:40", disabled: false }])}>新增一項</button>
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={submit}>儲存固定任務</button>
      </div>
    </div>
  );
}

function TimelineEditor({ classId, initial }: { classId: string; initial: NoonTimelineEntry[] }) {
  const toast = useToast();
  const save = useSaveNoonTimeline(classId);
  const [rows, setRows] = useState(initial);
  const patch = (i: number, p: Partial<NoonTimelineEntry>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  function submit() {
    if (!timelineValid(rows)) { toast("每一格都要填時間和文字"); return; }
    save.mutate(toTimeline(rows), {
      onSuccess: () => toast("已儲存午餐時序"),
      onError: () => toast("儲存失敗，請再試一次"),
    });
  }

  return (
    <div className="border-t border-line pt-4">
      <div className="mb-2 text-sm font-black text-sage">午餐時序（顯示在中午打卡台上方）</div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2">
            <input aria-label="時間" className="input" type="time" value={r.time} onChange={(e) => patch(i, { time: e.target.value })} />
            <input aria-label="說明" className="input" placeholder="例：全班收餐" value={r.label} onChange={(e) => patch(i, { label: e.target.value })} />
            <button type="button" className="btn-danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>刪除</button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">沒有午餐時序，打卡台上方不會顯示這一列。</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => setRows([...rows, { time: "12:30", label: "" }])}>新增一格</button>
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={submit}>儲存午餐時序</button>
      </div>
    </div>
  );
}
