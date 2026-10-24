import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { Empty, ErrorBox, Loading } from "../../shared/ui";
import { useBatches, useBatchTasks, useOpenTasks } from "./api";
import { useXlsxExport } from "./exportXlsx";
import { missingRows } from "./logic/exportRows";
import { matchStudent, missingByStudent, withLiveNames } from "./logic/stats";
import { taipeiToday } from "./logic/time";

/** 缺交總覽：範圍是進行中或某一次封存；網址 ?batch=…&task=… 讓打卡台與封存紀錄可以直接帶篩選過來 */
export function CheckinMissing() {
  const { cls, allStudents } = useClassData();
  const [params, setParams] = useSearchParams();
  const batchId = params.get("batch") ?? "";
  const taskId = params.get("task") ?? "";
  const [search, setSearch] = useState("");
  const open = useOpenTasks(cls.id);
  const batch = useBatchTasks(batchId || null);
  const batches = useBatches(cls.id);
  const q = batchId ? batch : open;
  const exporter = useXlsxExport();

  if (q.error || batches.error) return <ErrorBox error={q.error || batches.error} />;
  if (q.isLoading || batches.isLoading) return <Loading />;

  const scopeTasks = (q.data ?? []).map((t) => withLiveNames(t, allStudents));
  const tasks = scopeTasks.filter((t) => !taskId || t.id === taskId);
  const rows = missingByStudent(tasks).filter((r) => matchStudent(search, r.student_no, r.name_zh));
  const source = batchId ? batches.data?.find((b) => b.id === batchId)?.title ?? "封存紀錄" : "進行中";
  const setFilter = (next: { batch?: string; task?: string }) =>
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Record<string, string>, { replace: true });

  return (
    <>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_2fr]">
        <select aria-label="範圍" className="input" value={batchId} onChange={(e) => setFilter({ batch: e.target.value })}>
          <option value="">進行中的任務</option>
          {batches.data?.map((b) => <option key={b.id} value={b.id}>{b.title}{b.kind === "single" ? "（單項）" : ""}</option>)}
        </select>
        <select aria-label="任務" className="input" value={taskId} onChange={(e) => setFilter({ batch: batchId, task: e.target.value })}>
          <option value="">全部任務</option>
          {scopeTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input aria-label="搜尋座號或姓名" className="input" placeholder="搜尋座號或姓名" value={search}
          onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">{tasks.length} 項任務・{rows.length} 位學生有未完成任務（免交、已轉出不算）</p>
        <button type="button" className="btn ml-auto" disabled={rows.length === 0 || exporter.busy}
          onClick={() => exporter.run(`缺交清單_${taipeiToday()}.xlsx`, () => [missingRows(rows, source)])}>匯出 Excel</button>
      </div>
      {tasks.length === 0 ? (
        <Empty>{batchId ? "這次封存沒有符合的任務。" : "目前沒有進行中的任務。"}</Empty>
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-sage-soft p-8 text-center text-2xl font-black text-sage">✓ 全部完成</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.student_id} className="card p-4">
              <div className="flex items-baseline gap-2 font-black">
                <span className="text-2xl tabular-nums">{r.student_no}</span>
                <span className="text-xl">{r.name_zh}</span>
                <span className="ml-auto text-rose-ink">缺 {r.tasks.length} 項</span>
              </div>
              <div className="mt-1 text-lg font-bold">{r.tasks.map((t) => t.name).join("、")}</div>
              <div className="text-sm text-muted">{[...new Set(r.tasks.map((t) => t.task_date))].join("、")}・{source}</div>
              <Link className="mt-2 inline-block text-sm font-bold text-sage" to={`/checkin/history?student=${r.student_id}`}>查看個人歷程 →</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
