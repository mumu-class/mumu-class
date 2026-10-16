import { useState } from "react";
import { itemTitle, useClassData } from "../../lib/classData";
import { Empty, ErrorBox, Loading, PageTitle } from "../../shared/ui";
import { useAssignments } from "./api";
import { HomeworkTabs } from "./HomeworkTabs";
import { missingByStudent, sortOpen } from "./logic/order";

const AllDone = () => <div className="rounded-xl bg-sage-soft p-8 text-center text-2xl font-black text-sage">✓ 全班完成</div>;

export function HomeworkMissing() {
  const { cls, allStudents, items } = useClassData();
  const q = useAssignments(cls.id);
  const [selected, setSelected] = useState("");
  const [view, setView] = useState<"item" | "student">("item");
  if (q.error) return <ErrorBox error={q.error} />;
  if (q.isLoading) return <Loading />;
  const open = sortOpen((q.data ?? []).filter((a) => a.status === "open"));
  const a = open.find((x) => x.id === selected) ?? open[0];
  const byId = new Map(allStudents.map((s) => [s.id, s]));
  const missing = a ? a.homework_checks.filter((c) => c.status === "missing").map((c) => byId.get(c.student_id)!).filter(Boolean).sort((x, y) => x.student_no - y.student_no) : [];
  const byStudent = missingByStudent(open, allStudents);

  return (
    <>
      <PageTitle>作業小管家</PageTitle>
      <HomeworkTabs />
      {!a ? <Empty>目前沒有進行中的作業。先到「今日作業」新增一份。</Empty> : (
        <div className="card p-4">
          <div className="mb-4 flex gap-2">
            <button className={view === "item" ? "chip-on" : "chip"} onClick={() => setView("item")}>依作業</button>
            <button className={view === "student" ? "chip-on" : "chip"} onClick={() => setView("student")}>依學生</button>
          </div>
          {view === "item" ? (
            <>
              <div className="tabbar mb-4">
                {open.map((x) => (
                  <button key={x.id} className={x.id === a.id ? "chip-on" : "chip"} onClick={() => setSelected(x.id)}>{itemTitle(items, x.item_id, x.note)}</button>
                ))}
              </div>
              <div className="mb-3 text-lg font-black">{itemTitle(items, a.item_id, a.note)}｜目前缺交 {missing.length} 人</div>
              {missing.length === 0 ? <AllDone /> : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {missing.map((s) => (
                    <div key={s.id} className="rounded-xl border border-rose bg-rose p-4 text-center text-rose-ink">
                      <div className="text-3xl font-black leading-none">{s.student_no}</div>
                      <div className="mt-2 text-xl font-black">{s.name_zh}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mb-3 text-lg font-black">進行中的作業｜有缺交的學生 {byStudent.length} 人</div>
              {byStudent.length === 0 ? <AllDone /> : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {byStudent.map(({ student: s, assignments }) => (
                    <div key={s.id} className="rounded-xl border border-rose bg-rose p-4 text-rose-ink">
                      <div className="flex items-baseline gap-2 font-black">
                        <span className="text-3xl leading-none">{s.student_no}</span>
                        <span className="text-xl">{s.name_zh}</span>
                        <span className="ml-auto text-lg">缺 {assignments.length}</span>
                      </div>
                      <ul className="mt-2 space-y-0.5 text-lg font-bold">
                        {assignments.map((x) => <li key={x.id}>{itemTitle(items, x.item_id, x.note)}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
