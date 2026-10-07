import { useState } from "react";
import { itemTitle, useClassData } from "../../lib/classData";
import { ErrorBox, Loading, PageTitle } from "../../shared/ui";
import { useAssignments } from "./api";
import { HomeworkTabs } from "./HomeworkTabs";

export function HomeworkHistory() {
  const { cls, students, items } = useClassData();
  const q = useAssignments(cls.id);
  const [sid, setSid] = useState(students[0]?.id ?? "");
  if (q.error) return <ErrorBox error={q.error} />;
  if (q.isLoading) return <Loading />;
  const archived = (q.data ?? []).filter((a) => a.status === "archived");
  const recordsOf = (id: string) => archived.flatMap((a) => {
    const c = a.homework_checks.find((x) => x.student_id === id);
    return c ? [{ a, status: c.status }] : [];
  });
  const rs = recordsOf(sid);
  const done = rs.filter((r) => r.status === "done").length;
  const student = students.find((s) => s.id === sid);

  return (
    <>
      <PageTitle>作業小管家</PageTitle>
      <HomeworkTabs />
      <div className="grid gap-3 md:grid-cols-[240px_1fr]">
        <div className="card max-h-72 overflow-auto p-2 md:max-h-[70vh]">
          {students.map((s) => {
            const miss = recordsOf(s.id).filter((r) => r.status === "missing").length;
            return (
              <button key={s.id} onClick={() => setSid(s.id)}
                className={`mb-1 flex w-full justify-between rounded-lg px-3 py-2 text-left font-bold ${s.id === sid ? "bg-sage text-white" : "hover:bg-sage-soft"}`}>
                <span>{s.student_no}｜{s.name_zh}</span>
                {miss > 0 && <span className={s.id === sid ? "" : "text-rose-ink"}>缺 {miss}</span>}
              </button>
            );
          })}
        </div>
        <div className="card min-w-0 p-4">
          {student && <h2 className="text-xl font-black">{student.student_no}｜{student.name_zh} <span className="text-sm font-normal text-muted">{student.name_en}</span></h2>}
          <div className="my-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["作業總數", rs.length], ["完成", done], ["缺交", rs.length - done], ["完成率", rs.length ? `${Math.round((done / rs.length) * 100)}%` : "—"]].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-paper p-3 text-center"><b className="block text-xl tabular-nums">{v}</b><span className="text-sm text-muted">{l}</span></div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-96 text-left">
              <thead><tr className="text-sm text-muted"><th className="p-2">日期</th><th className="p-2">作業</th><th className="p-2">狀態</th></tr></thead>
              <tbody>
                {rs.length === 0 ? <tr><td colSpan={3} className="p-4 text-center text-muted">目前沒有封存紀錄</td></tr> :
                  rs.map(({ a, status }) => (
                    <tr key={a.id} className={`border-t border-line ${status === "done" ? "bg-sage-soft/50" : "bg-rose/50"}`}>
                      <td className="p-2 tabular-nums">{a.assigned_date}</td>
                      <td className="p-2">{itemTitle(items, a.item_id, a.note)}</td>
                      <td className="p-2 font-bold">{status === "done" ? "完成" : "缺交"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
