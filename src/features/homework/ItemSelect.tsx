import { SUBJECTS } from "../../lib/classData";
import type { HomeworkItem } from "../../lib/types";

export function ItemSelect({ id, items, value, onChange }: { id: string; items: HomeworkItem[]; value: string; onChange: (v: string) => void }) {
  const subjects = [...SUBJECTS, ...new Set(items.map((i) => i.subject).filter((s) => !SUBJECTS.includes(s)))];
  return (
    <select id={id} className="input font-bold" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">請選擇簿本</option>
      {subjects.map((s) => {
        const list = items.filter((i) => i.subject === s);
        return list.length ? (
          <optgroup key={s} label={s}>
            {list.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}
