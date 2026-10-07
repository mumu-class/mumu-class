import { useState } from "react";
import { itemTitle, useClassData } from "../../lib/classData";
import { Empty, ErrorBox, Loading, PageTitle } from "../../shared/ui";
import { useAssignments } from "./api";
import { HomeworkTabs } from "./HomeworkTabs";

export function HomeworkMissing() {
  const { cls, allStudents, items } = useClassData();
  const q = useAssignments(cls.id);
  const [selected, setSelected] = useState("");
  if (q.error) return <ErrorBox error={q.error} />;
  if (q.isLoading) return <Loading />;
  const open = (q.data ?? []).filter((a) => a.status === "open");
  const a = open.find((x) => x.id === selected) ?? open[0];
  const byId = new Map(allStudents.map((s) => [s.id, s]));
  const missing = a ? a.homework_checks.filter((c) => c.status === "missing").map((c) => byId.get(c.student_id)!).filter(Boolean).sort((x, y) => x.student_no - y.student_no) : [];

  return (
    <>
      <PageTitle>作業小管家</PageTitle>
      <HomeworkTabs />
      {!a ? <Empty>目前沒有進行中的作業。先到「今日作業」新增一份。</Empty> : (
        <div className="card p-4">
          <div className="tabbar mb-4">
            {open.map((x) => (
              <button key={x.id} className={x.id === a.id ? "chip-on" : "chip"} onClick={() => setSelected(x.id)}>{itemTitle(items, x.item_id, x.note)}</button>
            ))}
          </div>
          <div className="mb-3 text-lg font-black">{itemTitle(items, a.item_id, a.note)}｜目前缺交 {missing.length} 人</div>
          {missing.length === 0 ? (
            <div className="rounded-xl bg-sage-soft p-8 text-center text-2xl font-black text-sage">✓ 全班完成</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {missing.map((s) => (
                <div key={s.id} className="rounded-xl border border-rose bg-rose p-4 text-center text-rose-ink">
                  <div className="text-3xl font-black leading-none">{s.student_no}</div>
                  <div className="mt-2 text-xl font-black">{s.name_zh}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
