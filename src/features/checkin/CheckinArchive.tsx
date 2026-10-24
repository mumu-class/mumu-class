import { useState } from "react";
import { Link } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import type { CheckinTaskStat } from "../../lib/types";
import { Empty, ErrorBox, Loading } from "../../shared/ui";
import { useArchivedStats, useBatches, useBatchTasks } from "./api";
import { useClassroom } from "./classroom";
import { TaskCard } from "./TaskCard";

/** 封存紀錄：每一次封存一張卡，新到舊；「檢視紀錄」展開當時的打卡台快照 */
export function CheckinArchive() {
  const { cls } = useClassData();
  const { classroom } = useClassroom();
  const batches = useBatches(cls.id);
  const stats = useArchivedStats(cls.id);
  const [openId, setOpenId] = useState<string | null>(null);

  if (batches.error || stats.error) return <ErrorBox error={batches.error || stats.error} />;
  if (batches.isLoading || stats.isLoading) return <Loading />;

  const byBatch = new Map<string, CheckinTaskStat[]>();
  for (const s of stats.data ?? []) {
    if (s.batch_id) byBatch.set(s.batch_id, [...(byBatch.get(s.batch_id) ?? []), s]);
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <p className="text-sm text-muted">保留每一輪任務的完整快照；封存後不能修改。</p>
        {!classroom && <Link className="btn ml-auto" to="/settings">備份全部資料</Link>}
      </div>
      {!batches.data?.length ? (
        <Empty>還沒有封存紀錄。在打卡台按「封存本輪紀錄」後會出現在這裡。</Empty>
      ) : (
        <div className="space-y-3">
          {batches.data.map((b) => {
            const ts = (byBatch.get(b.id) ?? []).sort((x, y) => x.slot - y.slot);
            const missing = ts.reduce((n, t) => n + t.total - t.done, 0);
            return (
              <section key={b.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black">{b.title}</h2>
                  {b.kind === "single" && <span className="chip">單項封存</span>}
                  <span className="ml-auto flex gap-2">
                    <button type="button" className="btn" onClick={() => setOpenId(openId === b.id ? null : b.id)}>
                      {openId === b.id ? "收起紀錄" : "檢視紀錄"}
                    </button>
                    <Link className="btn" to={`/checkin/missing?batch=${b.id}`}>缺交清單</Link>
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{ts.length} 項任務・{missing} 筆未完成項次</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ts.map((t) => (
                    <span key={t.task_id} className="rounded-lg bg-sage-soft px-3 py-1.5 text-sm font-bold text-sage">
                      {t.name} {t.done}/{t.total}
                    </span>
                  ))}
                </div>
                {openId === b.id && <BatchDetail batchId={b.id} />}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function BatchDetail({ batchId }: { batchId: string }) {
  const q = useBatchTasks(batchId);
  if (q.error) return <div className="mt-3"><ErrorBox error={q.error} /></div>;
  if (q.isLoading) return <Loading />;
  return (
    <div className="mt-3 grid gap-2 lg:grid-cols-2">
      {q.data?.map((t) => <TaskCard key={t.id} slot={t.slot} task={t} />)}
    </div>
  );
}
