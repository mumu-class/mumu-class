import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { useToast } from "../../shared/Toast";
import { ErrorBox, Loading, PageTitle } from "../../shared/ui";
import { useLayouts, useSeatMutations, useSeats } from "./api";
import { groupName, randomAssign } from "./logic/seating";

export function SeatingPage() {
  const { cls, students } = useClassData();
  const layouts = useLayouts(cls.id);
  const [viewId, setViewId] = useState<string | null>(null);
  const list = layouts.data ?? [];
  const layout = list.find((l) => l.id === viewId) ?? list.find((l) => l.is_current) ?? list[list.length - 1];
  const seatsQ = useSeats(layout?.id);
  const m = useSeatMutations(cls.id, layout?.id);
  const toast = useToast();

  useEffect(() => {
    if (layouts.isSuccess && list.length === 0 && !m.createFirst.isPending) m.createFirst.mutate();
  }, [layouts.isSuccess, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (layouts.error || seatsQ.error) return <ErrorBox error={layouts.error || seatsQ.error} />;
  if (!layout || seatsQ.isLoading) return <Loading />;

  const seats = seatsQ.data ?? [];
  const at = (r: number, c: number) => seats.find((s) => s.row === r && s.col === c);
  const used = new Set(seats.map((s) => s.student_id).filter(Boolean));
  const unassigned = students.filter((s) => !used.has(s.id));
  const byId = new Map(students.map((s) => [s.id, s]));

  function randomize() {
    m.replaceAll.mutate(randomAssign(students.map((s) => s.id), layout!.rows, layout!.cols), {
      onSuccess: () => toast("已完成隨機排座位"),
      onError: () => toast("隨機排座位失敗，請再試一次"),
    });
  }
  function clearAll() {
    if (!window.confirm("確定要清空這張座位表的所有座位嗎？")) return;
    m.replaceAll.mutate([], { onSuccess: () => toast("已清空座位") });
  }
  function saveAs() {
    const name = window.prompt("新座位表的名稱", `${new Date().getMonth() + 1} 月座位`);
    if (!name) return;
    m.saveAs.mutate({ name, rows: layout!.rows, cols: layout!.cols, seats }, {
      onSuccess: (id) => { setViewId(id); toast(`已另存為「${name}」，並設為目前座位表`); },
    });
  }

  return (
    <>
      <PageTitle right={<span className="text-sm text-muted">已安排 {students.length - unassigned.length} / {students.length} 位</span>}>座位表</PageTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select id="layout" className="input w-auto" value={layout.id} onChange={(e) => setViewId(e.target.value)}>
          {list.map((l) => <option key={l.id} value={l.id}>{l.name}{l.is_current ? "（目前）" : ""}</option>)}
        </select>
        {!layout.is_current && <button className="btn-soft" onClick={() => m.makeCurrent.mutate(layout.id)}>設為目前座位表</button>}
        <button className="btn-soft" onClick={randomize} disabled={m.replaceAll.isPending}>隨機排座位</button>
        <button className="btn" onClick={saveAs}>另存新座位表</button>
        <Link className="btn" to={`/seating/${layout.id}/print`}>列印／輸出 PDF</Link>
        <button className="btn-danger" onClick={clearAll}>全部清空</button>
      </div>

      <div className="card mb-1 p-2 text-center font-bold">黑板</div>
      <div className="mb-3 text-center text-xs text-muted">教室前方</div>
      <div className="overflow-x-auto pb-2">
        <div className="mx-auto grid min-w-[760px] gap-1.5" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: layout.cols }, (_, c) => (
            <div key={`g${c}`} className="text-center text-sm font-black text-sage">{groupName(c, layout.cols)}</div>
          ))}
          {Array.from({ length: layout.rows }, (_, r) => Array.from({ length: layout.cols }, (_, c) => {
            const seat = at(r, c);
            const sid = seat?.student_id ?? "";
            return (
              <div key={`${r}-${c}`} className="card p-1.5">
                <select aria-label={`第 ${r + 1} 排 ${groupName(c, layout.cols)}`} className="w-full rounded-md border border-line bg-sheet px-1 py-1.5 text-sm"
                  value={sid} onChange={(e) => m.setSeat.mutate({ row: r, col: c, studentId: e.target.value || null })}>
                  <option value="">— 空位 —</option>
                  {students.filter((s) => s.id === sid || !used.has(s.id)).map((s) => (
                    <option key={s.id} value={s.id}>{s.student_no}｜{s.name_zh}{s.name_en ? `｜${s.name_en}` : ""}</option>
                  ))}
                </select>
                {sid && (
                  <label className="mt-1 flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={!!seat?.is_leader} onChange={(e) => m.setLeader.mutate({ row: r, col: c, on: e.target.checked })} />
                    組長{seat?.is_leader && byId.get(sid) ? `：${byId.get(sid)!.name_zh}` : ""}
                  </label>
                )}
              </div>
            );
          }))}
        </div>
      </div>

      <details className="card mt-3 p-3">
        <summary className="cursor-pointer text-sm font-bold">尚未安排的學生｜{unassigned.length} 人</summary>
        <p className="mt-2 text-sm leading-8 text-muted">
          {unassigned.length ? unassigned.map((s) => `${s.student_no}｜${s.name_zh}`).join("　") : "✓ 全部學生皆已安排"}
        </p>
      </details>
    </>
  );
}
