import { useState } from "react";
import { itemTitle, useClassData } from "../../lib/classData";
import { fmtDate } from "../planner/logic/calendar";
import { useToast } from "../../shared/Toast";
import { Empty, ErrorBox, Loading, PageTitle } from "../../shared/ui";
import { useAssignments, useCreateAssignment, useSetChecks, useUpdateAssignment } from "./api";
import { HomeworkTabs } from "./HomeworkTabs";
import { ItemSelect } from "./ItemSelect";
import { parseNums } from "./logic/parseNums";

export function HomeworkToday() {
  const { cls, students, allStudents, items } = useClassData();
  const q = useAssignments(cls.id);
  const setChecks = useSetChecks(cls.id);
  const update = useUpdateAssignment(cls.id);
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null); // null = 自動選第一份
  const [batch, setBatch] = useState("");

  const open = (q.data ?? []).filter((a) => a.status === "open");

  if (q.error) return <ErrorBox error={q.error} />;
  if (q.isLoading) return <Loading />;

  const a = selected === "new" ? undefined : open.find((x) => x.id === selected) ?? open[0];
  const byId = new Map(allStudents.map((s) => [s.id, s]));
  const checks = a ? [...a.homework_checks].sort((x, y) => (byId.get(x.student_id)?.student_no ?? 0) - (byId.get(y.student_id)?.student_no ?? 0)) : [];
  const done = checks.filter((c) => c.status === "done").length;

  function batchCheck() {
    if (!a) return;
    const nos = parseNums(batch, students.map((s) => s.student_no));
    const ids = students.filter((s) => nos.includes(s.student_no)).map((s) => s.id).filter((id) => checks.some((c) => c.student_id === id));
    if (!ids.length) { toast("沒有符合的座號"); return; }
    setChecks.mutate({ assignmentId: a.id, studentIds: ids, status: "done" });
    setBatch("");
    toast(`已勾選 ${ids.length} 位`);
  }

  function archive() {
    if (!a) return;
    update.mutate({ id: a.id, patch: { status: "archived", archived_at: new Date().toISOString() } });
    toast(`已封存「${itemTitle(items, a.item_id, a.note)}」：完成 ${done} 人，缺交 ${checks.length - done} 人`, {
      label: "復原", run: () => update.mutate({ id: a.id, patch: { status: "open", archived_at: null } }),
    });
  }

  function remove() {
    if (!a) return;
    update.mutate({ id: a.id, patch: { deleted_at: new Date().toISOString() } });
    toast(`已清空「${itemTitle(items, a.item_id, a.note)}」，不列入歷程`, {
      label: "復原", run: () => update.mutate({ id: a.id, patch: { deleted_at: null } }),
    });
  }

  return (
    <>
      <PageTitle>作業小管家</PageTitle>
      <HomeworkTabs />
      <div className="tabbar mb-3">
        {open.map((x) => (
          <button key={x.id} className={x.id === a?.id ? "chip-on" : "chip"} onClick={() => setSelected(x.id)}>
            {itemTitle(items, x.item_id, x.note)}
          </button>
        ))}
        <button className={!a ? "chip-on" : "chip"} onClick={() => setSelected("new")}>＋ 新作業</button>
      </div>

      {!a ? (
        <NewAssignment onCreated={(id) => setSelected(id)} />
      ) : (
        <div className="card p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <ItemSelect id="hw-item" items={items} value={a.item_id} onChange={(v) => v && update.mutate({ id: a.id, patch: { item_id: v } })} />
            <input id="hw-note" key={a.id} className="input" placeholder="備註：P.12、第3課、訂正" defaultValue={a.note}
              onBlur={(e) => e.target.value !== a.note && update.mutate({ id: a.id, patch: { note: e.target.value } })} />
          </div>
          <div className="mt-3 flex gap-2">
            <input id="hw-batch" className="input" inputMode="text" placeholder="批次座號，例：1-10,12,15" value={batch}
              onChange={(e) => setBatch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && batchCheck()} />
            <button className="btn-primary shrink-0" onClick={batchCheck}>批次勾選</button>
          </div>
          <div className="my-3 flex items-center justify-between gap-2 font-bold">
            <span>{itemTitle(items, a.item_id, a.note)}<span className="ml-2 text-sm font-normal text-muted">{a.assigned_date}</span></span>
            <span className="text-sm text-muted tabular-nums">已交 {done} / {checks.length}・缺 {checks.length - done}</span>
          </div>
          {checks.length === 0 ? <Empty>這份作業建立時沒有在籍學生。</Empty> : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {checks.map((c) => {
                const s = byId.get(c.student_id);
                const isDone = c.status === "done";
                return (
                  <button key={c.student_id}
                    onClick={() => setChecks.mutate({ assignmentId: a.id, studentIds: [c.student_id], status: isDone ? "missing" : "done" })}
                    className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-2 py-2 text-base font-black ${isDone ? "border-sage-soft bg-sage-soft text-sage" : "border-rose bg-rose text-rose-ink"}`}>
                    <span className="text-sm opacity-75">{s?.student_no}</span>
                    <span>{s?.name_zh ?? "（已移除）"}</span>
                    {isDone && <span>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn" onClick={remove}>直接清空</button>
            <button className="btn-primary" onClick={archive}>封存＋清空</button>
          </div>
          <p className="mt-2 text-xs text-muted">「直接清空」不列入學生歷程；「封存＋清空」會保留完成與缺交紀錄。兩者都可以按「復原」。</p>
        </div>
      )}
    </>
  );
}

function NewAssignment({ onCreated }: { onCreated: (id: string) => void }) {
  const { cls, items } = useClassData();
  const create = useCreateAssignment(cls.id);
  const [itemId, setItemId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(fmtDate(new Date()));
  return (
    <div className="card space-y-3 p-4">
      <h2 className="font-black">新增一份作業</h2>
      <ItemSelect id="new-item" items={items} value={itemId} onChange={setItemId} />
      <input id="new-note" className="input" placeholder="備註：P.12、第3課、訂正（可不填）" value={note} onChange={(e) => setNote(e.target.value)} />
      <div><label className="label" htmlFor="new-date">日期</label><input id="new-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {create.error && <p className="text-sm text-rose-ink">建立失敗，請再試一次。</p>}
      <button className="btn-primary w-full py-3" disabled={!itemId || create.isPending}
        onClick={() => create.mutate({ itemId, note: note.trim(), date }, { onSuccess: (id) => { setItemId(""); setNote(""); onCreated(id); } })}>
        {create.isPending ? "建立中…" : "建立作業，開始清點"}
      </button>
    </div>
  );
}
