# 老師使用回饋（2026-10-16）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依老師回饋調整課程規劃表（固定欄瘦身、隱藏堂／備註、其他分組拆欄、其他考試預告、作業總覽拆成作業與訂簽、作業格可換行）與作業小管家（進行中作業可排序、依學生看缺交）。

**Architecture:** 一個 SQL migration 處理既有資料（`planner_columns.hidden`、新增三欄、重排，以及 `homework_assignments.sort_order`），升級邏輯包成可重複執行的函式以便測試。推算規則集中在 `features/planner/logic/rules.ts`（純函式、有單元測試）；小管家的排序與依學生整理放在新的 `features/homework/logic/order.ts`（純函式、有單元測試）。畫面元件只負責呈現。

**Tech Stack:** React 19、TypeScript、Tailwind v4、TanStack Query、Supabase（Postgres＋RLS）、Vitest、`scripts/db-test.sh`（本機暫時的 Postgres）。

**設計文件：** `docs/superpowers/specs/2026-10-16-teacher-feedback-planner-homework-design.md`（以下稱「設計」）。

**分支：** `feat/teacher-feedback-1016`（已建立，設計文件已在上面）。`main` 受保護，只能走 PR。

---

## 檔案地圖

| 檔案 | 動作 | 職責 |
|---|---|---|
| `supabase/migrations/20261016120000_teacher_feedback.sql` | 新增 | 加欄位、升級函式、執行一次 |
| `supabase/tests/teacher_feedback_20261016.sql` | 新增 | 驗證升級函式：隱藏、新增、排序、可重複執行、權限 |
| `src/lib/types.ts` | 修改 | `PlannerColumn.hidden`、`Assignment.sort_order` |
| `src/lib/defaults.ts` | 修改 | 新班級的規劃表欄位 |
| `src/features/planner/logic/rules.ts` | 修改 | 逐項判斷、R8 其他考試、作業／訂簽分塊 |
| `src/features/planner/logic/rules.test.ts` | 修改 | 對應測試 |
| `src/features/planner/PlannerRow.tsx` | 修改 | 固定欄、作業格文字框與按鍵、總覽兩塊 |
| `src/features/planner/PlannerPage.tsx` | 修改 | 表頭、過濾隱藏欄、CSV |
| `src/features/homework/logic/order.ts` | 新增 | `sortOpen`、`moveItem`、`missingByStudent` |
| `src/features/homework/logic/order.test.ts` | 新增 | 對應測試 |
| `src/features/homework/api.ts` | 修改 | 讀 `sort_order`、`useReorderAssignments` |
| `src/features/homework/HomeworkToday.tsx` | 修改 | ◀ ▶ 排序 |
| `src/features/homework/HomeworkMissing.tsx` | 修改 | 依作業／依學生切換 |

---

### Task 1: 資料庫 migration 與測試

**Files:**
- Create: `supabase/tests/teacher_feedback_20261016.sql`
- Create: `supabase/migrations/20261016120000_teacher_feedback.sql`

- [x] **Step 1: 寫失敗的資料庫測試**

建立 `supabase/tests/teacher_feedback_20261016.sql`：

```sql
-- 2026-10-16 migration 的升級函式。以 postgres 身分執行（不受 RLS 限制，和在正式環境套用 migration 時相同）。
-- 測試時 migration 是套用在空資料庫上，所以這裡先建立「舊版」欄位，再呼叫升級函式。
\set ON_ERROR_STOP 1
begin;

insert into auth.users values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');

-- 兩位老師各有一組舊版欄位（只放測試需要的幾欄）
insert into planner_columns (owner_id, key, label, group_name, kind, sort_order, in_summary)
select u.o, k.key, k.key, k.grp, k.kind, k.pos, k.key <> '備註'
from (values ('00000000-0000-0000-0000-0000000000c1'::uuid), ('00000000-0000-0000-0000-0000000000c2'::uuid)) as u(o),
     (values ('重要行事曆', '固定', 'calendar', 0), ('堂', '固定', 'period', 1), ('國習', '國語｜核心', 'text', 2),
             ('社單元考', '社會', 'multiline', 3), ('其他', '其他', 'text', 4), ('備註', '其他', 'text', 5)) as k(key, grp, kind, pos);

-- c1 在「堂」填過內容
insert into classes (id, owner_id, name, school_year) values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', '311', 115);
insert into semesters (id, owner_id, class_id, name, start_date, end_date) values
  ('50000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '115 上', '2026-08-31', '2027-01-20');
insert into planner_entries (owner_id, semester_id, date, column_id, value)
select '00000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000c1', '2026-10-07', id, '2'
from planner_columns where owner_id = '00000000-0000-0000-0000-0000000000c1' and key = '堂';

-- 執行兩次：必須可以重複執行
select upgrade_planner_columns_20261016();
select upgrade_planner_columns_20261016();

do $$
begin
  assert (select count(*) from planner_columns where key in ('堂', '備註') and hidden) = 4, '兩位老師的堂、備註都應隱藏';
  assert (select count(*) from planner_columns where hidden) = 4, '其他欄位不應被隱藏';
  assert (select count(*) from planner_entries e join planner_columns c on c.id = e.column_id where c.key = '堂') = 1,
    '堂的舊內容應保留';
  assert (select count(*) from planner_columns where key in ('數學', '自然', '其他考試')) = 6,
    '每位老師各新增數學、自然、其他考試，執行兩次也不重複';
  assert (select bool_and(kind = 'multiline' and group_name = '其他') from planner_columns where key = '其他考試'),
    '其他考試應為多行、屬於其他分組';
  assert (select string_agg(key, ',' order by sort_order) from planner_columns where owner_id = '00000000-0000-0000-0000-0000000000c1')
    = '重要行事曆,堂,國習,社單元考,數學,自然,其他,其他考試,備註', '其他分組的順序應為數學、自然、其他、其他考試、備註';
  assert (select column_default from information_schema.columns
          where table_name = 'homework_assignments' and column_name = 'sort_order') = '0', 'sort_order 預設應為 0';
end $$;

-- 登入的使用者不能呼叫升級函式
set local role authenticated;
do $$
begin
  begin
    perform upgrade_planner_columns_20261016();
    assert false, 'authenticated 不應能執行升級函式';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'TEACHER FEEDBACK MIGRATION TESTS PASSED' as result;
rollback;
```

- [x] **Step 2: 執行，確認失敗**

Run: `./scripts/db-test.sh`
Expected: 失敗，訊息包含 `function upgrade_planner_columns_20261016() does not exist`（`rls_and_rpc.sql` 仍會先印出 `ALL DB TESTS PASSED`）。

- [x] **Step 3: 寫 migration**

建立 `supabase/migrations/20261016120000_teacher_feedback.sql`：

```sql
-- 老師使用回饋（2026-10-16）：
-- 規劃表隱藏「堂」「備註」（資料保留）、其他分組改為數學／自然／其他／其他考試；小管家的進行中作業可排序。
-- 設計：docs/superpowers/specs/2026-10-16-teacher-feedback-planner-homework-design.md

alter table public.planner_columns add column hidden boolean not null default false;
alter table public.homework_assignments add column sort_order int not null default 0;

-- 升級每位老師既有的規劃表欄位；可重複執行。包成函式是為了讓 supabase/tests 能在有舊資料的情況下測試。
create function public.upgrade_planner_columns_20261016() returns void
language plpgsql as $$
declare
  o uuid;
  base int;
begin
  update public.planner_columns set hidden = true where key in ('堂', '備註') and not hidden;
  for o in select distinct owner_id from public.planner_columns loop
    insert into public.planner_columns (owner_id, key, label, group_name, kind, in_summary) values
      (o, '數學', '數學', '其他', 'text', true),
      (o, '自然', '自然', '其他', 'text', true),
      (o, '其他考試', '其他考試', '其他', 'multiline', true)
    on conflict (owner_id, key) do nothing;
    select coalesce(max(sort_order), -1) into base from public.planner_columns where owner_id = o and group_name <> '其他';
    update public.planner_columns c set sort_order = base + x.pos
    from (values ('數學', 1), ('自然', 2), ('其他', 3), ('其他考試', 4), ('備註', 5)) as x(key, pos)
    where c.owner_id = o and c.key = x.key and c.sort_order <> base + x.pos;
  end loop;
end $$;

revoke execute on function public.upgrade_planner_columns_20261016() from public, anon, authenticated;

select public.upgrade_planner_columns_20261016();
```

- [x] **Step 4: 執行，確認通過**

Run: `./scripts/db-test.sh`
Expected: 輸出包含 `ALL DB TESTS PASSED` 與 `TEACHER FEEDBACK MIGRATION TESTS PASSED`，結束碼 0。

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/20261016120000_teacher_feedback.sql supabase/tests/teacher_feedback_20261016.sql
git commit -m "feat(db): 規劃表欄位可隱藏並新增數學、自然、其他考試；作業可排序"
```

---

### Task 2: 型別與新班級預設欄位

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/defaults.ts:13-33`

- [x] **Step 1: 型別加欄位**

`src/lib/types.ts`：`Assignment` 加 `sort_order`，`PlannerColumn` 加 `hidden`。

```ts
export type Assignment = {
  id: string; class_id: string; item_id: string; note: string; assigned_date: string; sort_order: number;
  status: "open" | "archived"; archived_at: string | null; created_at: string; homework_checks: Check[];
};
```

```ts
export type PlannerColumn = {
  id: string; key: string; label: string; group_name: string;
  kind: "calendar" | "period" | "course_zh" | "course_social" | "text" | "multiline";
  item_id: string | null; sort_order: number; in_summary: boolean; hidden: boolean;
};
```

- [x] **Step 2: 更新預設欄位**

`src/lib/defaults.ts` 第 13 行起改成（拿掉堂、備註，其他分組改為四欄）：

```ts
type Col = { key: string; label: string; group_name: string; kind: string; in_summary: boolean };
const hw = (group_name: string, keys: string[], multi: string[] = []): Col[] =>
  keys.map((key) => ({
    key,
    label: key === "國單元考" || key === "社單元考" ? "單元考" : key,
    group_name,
    kind: multi.includes(key) ? "multiline" : "text",
    in_summary: true,
  }));

/** 課程規劃表的欄位（沿用 v22 的順序與分組；生字本依回條拆成甲本、乙本；2026-10-16 回饋：拿掉堂、備註，其他分組拆欄） */
export const DEFAULT_PLANNER_COLUMNS: Col[] = [
  { key: "重要行事曆", label: "重要行事曆", group_name: "固定", kind: "calendar", in_summary: false },
  { key: "國語課程進度", label: "國語", group_name: "固定", kind: "course_zh", in_summary: false },
  { key: "社會課程進度", label: "社會", group_name: "固定", kind: "course_social", in_summary: false },
  ...hw("國語｜核心", ["國預習單", "甲本", "乙本", "國習", "國簿", "國白卷", "字詞本", "字詞考", "國課練", "國單元考"], ["字詞考", "國單元考"]),
  ...hw("國語｜補充與複習", ["寫作", "閱達", "成易", "詩選", "國複卷"]),
  ...hw("社會", ["社習", "社重", "社簿", "社白卷", "社複卷", "社單元考"], ["社單元考"]),
  ...hw("其他", ["數學", "自然", "其他", "其他考試"], ["其他考試"]),
];
```

- [x] **Step 3: 型別檢查**

Run: `npm run typecheck`
Expected: 0 個錯誤（新增的欄位只出現在查詢結果的型別上，既有程式不需要改）。

- [x] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/defaults.ts
git commit -m "feat: 規劃表欄位型別加 hidden、作業加 sort_order；新班級預設欄位依回饋調整"
```

---

### Task 3: 推算規則（逐項判斷、R8、作業／訂簽分塊）

**Files:**
- Modify: `src/features/planner/logic/rules.ts`
- Test: `src/features/planner/logic/rules.test.ts`

- [x] **Step 1: 改寫測試**

把 `src/features/planner/logic/rules.test.ts` 整份換成：

```ts
import { describe, expect, it } from "vitest";
import { buildRows, nextSchoolDay } from "./calendar";
import { autoCourseSocial, autoCourseZh, goesToCourse, poemRoute, splitEntries, summaryItems, summaryText } from "./rules";

const mon = (vals: Record<string, string>) => ({ vals, dow: 1 });
const wed = (vals: Record<string, string>) => ({ vals, dow: 3 });
const EMPTY = { homework: [], sign: [] };
const hw = (day: Record<string, string>, next: Parameters<typeof summaryItems>[1] = null) => summaryText(summaryItems(day, next).homework);
const sign = (day: Record<string, string>, next: Parameters<typeof summaryItems>[1] = null) => summaryText(summaryItems(day, next).sign);

describe("splitEntries / goesToCourse", () => {
  it("以換行、全形與半形分號分割", () => expect(splitEntries("L3\nL2訂簽；L1;")).toEqual(["L3", "L2訂簽", "L1"]));
  it("有數字（含國字數字）且無訂簽才算進度", () => {
    expect(goesToCourse("L3")).toBe(true);
    expect(goesToCourse("第三課")).toBe(true);
    expect(goesToCourse("L3訂簽")).toBe(false);
    expect(goesToCourse("訂正")).toBe(false);
  });
});

describe("R1 國課練、字詞本", () => {
  it("有數字 → 課堂進度，不列入總覽", () => {
    const day = { 國課練: "L5" };
    expect(autoCourseZh(day)).toEqual(["國課練：L5"]);
    expect(summaryItems(day, null)).toEqual(EMPTY);
  });
  it("訂簽 → 訂簽塊，不進課堂進度", () => {
    const day = { 國課練: "L5訂簽" };
    expect(autoCourseZh(day)).toEqual([]);
    expect(sign(day)).toBe("國課練｜L5訂簽");
    expect(hw(day)).toBe("");
  });
  it("沒有數字 → 作業塊", () => expect(hw({ 字詞本: "訂正" })).toBe("字詞本｜訂正"));
  it("P.12 有數字算進度（老師確認）", () => expect(autoCourseZh({ 字詞本: "P.12" })).toEqual(["字詞本：P.12"]));
  it("換行後逐項判斷：L3 進課堂進度、訂簽進訂簽塊", () => {
    const day = { 國課練: "L3\n訂簽" };
    expect(autoCourseZh(day)).toEqual(["國課練：L3"]);
    expect(sign(day)).toBe("國課練｜訂簽");
    expect(hw(day)).toBe("");
  });
});

describe("R2 詩選（老師回條：背＋數字是作業、只有數字是進度）", () => {
  it("分流判斷", () => {
    expect(poemRoute("背12")).toBe("homework");
    expect(poemRoute("12")).toBe("course");
    expect(poemRoute("12-13")).toBe("course");
    expect(poemRoute("靜夜思")).toBe("both");
  });
  it("背12 → 只列作業總覽", () => {
    const day = { 詩選: "背12" };
    expect(autoCourseZh(day)).toEqual([]);
    expect(hw(day)).toBe("詩選｜背12");
  });
  it("12 → 只帶入課堂進度", () => {
    const day = { 詩選: "12" };
    expect(autoCourseZh(day)).toEqual(["詩選：12"]);
    expect(summaryItems(day, null)).toEqual(EMPTY);
  });
  it("其他文字 → 兩邊都列（沿用舊版）", () => {
    const day = { 詩選: "靜夜思" };
    expect(autoCourseZh(day)).toEqual(["詩選：靜夜思"]);
    expect(hw(day)).toBe("詩選｜靜夜思");
  });
});

describe("R3–R5 考試", () => {
  it("字詞考：當天進度＋前一天提醒；訂簽行進訂簽塊", () => {
    const wedVals = { 字詞考: "L3\nL2訂簽" };
    expect(autoCourseZh(wedVals)).toEqual(["字詞考：L3"]);
    expect(sign(wedVals)).toBe("字詞考｜L2訂簽");
    expect(hw({}, wed(wedVals))).toBe("週三考國L3字詞考");
  });
  it("國單元考", () => {
    const d = { 國單元考: "4-5" };
    expect(autoCourseZh(d)).toEqual(["考4-5"]);
    expect(hw({}, mon(d))).toBe("週一考國4-5單元考");
  });
  it("社單元考", () => {
    const d = { 社單元考: "2" };
    expect(autoCourseSocial(d)).toEqual(["考2"]);
    expect(hw({}, wed(d))).toBe("週三考社2單元考");
  });
  it("國語進度自動行的順序：國課練、字詞本、詩選、字詞考、單元考", () => {
    expect(autoCourseZh({ 國單元考: "3", 字詞考: "L1", 詩選: "5", 字詞本: "L2", 國課練: "L4" })).toEqual([
      "國課練：L4", "字詞本：L2", "詩選：5", "字詞考：L1", "考3",
    ]);
  });
});

describe("R6 其他作業欄", () => {
  it("生字本已拆成甲本、乙本，依欄位順序列出", () => {
    expect(hw({ 乙本: "L3", 甲本: "L3" })).toBe("甲本｜L3；乙本｜L3");
  });
  it("依欄位順序列出；隱藏的備註、堂不列入", () => {
    expect(hw({ 社習: "P.3", 國習: "P.20-21", 備註: "家長日", 堂: "2" })).toBe("國習｜P.20-21；社習｜P.3");
  });
  it("單行欄位也逐項判斷：一般作業進作業塊、訂簽進訂簽塊", () => {
    const day = { 國習: "P.20；L2訂簽" };
    expect(hw(day)).toBe("國習｜P.20");
    expect(sign(day)).toBe("國習｜L2訂簽");
  });
  it("數學、自然、其他列入總覽，排在社會之後", () => {
    const day = { 其他: "回條", 數學: "數祕本P.12", 自然: "自綠本訂簽", 社習: "P.3" };
    expect(hw(day)).toBe("社習｜P.3；數學｜數祕本P.12；其他｜回條");
    expect(sign(day)).toBe("自然｜自綠本訂簽");
  });
});

describe("R8 其他考試", () => {
  it("每個項目都在前一個上學日預告，不看有沒有數字", () => {
    expect(hw({}, wed({ 其他考試: "數L3\n自第二單元" }))).toBe("週三考數L3；週三考自第二單元");
  });
  it("考試當天不另外顯示", () => {
    const day = { 其他考試: "數L3" };
    expect(summaryItems(day, null)).toEqual(EMPTY);
    expect(autoCourseZh(day)).toEqual([]);
    expect(autoCourseSocial(day)).toEqual([]);
  });
  it("預告一律放作業塊（即使內容有訂簽）", () => {
    const s = summaryItems({}, wed({ 其他考試: "數訂簽" }));
    expect(summaryText(s.homework)).toBe("週三考數訂簽");
    expect(s.sign).toEqual([]);
  });
  it("中間隔著假日時，預告在假日前的上學日，並寫出考試當天的星期", () => {
    // 9/25（五）中秋節、9/28（一）教師節：9/24（四）的下一個上學日是 9/29（二）
    const rows = buildRows("2026-09-21", "2026-10-02", { "2026-09-25": "中秋節", "2026-09-28": "教師節" }, new Set());
    const nr = nextSchoolDay(rows, "2026-09-24")!;
    expect(hw({}, { vals: { 其他考試: "數L3" }, dow: nr.dow })).toBe("週二考數L3");
  });
});
```

- [x] **Step 2: 執行，確認失敗**

Run: `npx vitest run src/features/planner/logic/rules.test.ts`
Expected: FAIL。`summaryItems(...).homework` 為 `undefined`（目前回傳陣列），R8、數學等測試失敗。

- [x] **Step 3: 改寫 rules.ts**

把 `src/features/planner/logic/rules.ts` 整份換成：

```ts
/**
 * 課程規劃表的推算規則（主設計文件 §8.4 R1–R7；R8 其他考試與作業／訂簽分塊見 2026-10-16 回饋設計 §4.3–4.4）。
 * 只讀不寫：輸入是老師填寫的格子，輸出是畫面上顯示的推算內容。
 * 所有作業欄都先以 splitEntries 拆成項目，每個項目分別判斷。
 */
export type DayValues = Record<string, string | undefined>;
export type SummaryItem = { label: string; text: string; plain: boolean };
/** 當日作業總覽：含「訂簽」的項目放 sign，其餘項目與所有考試預告放 homework */
export type Summary = { homework: SummaryItem[]; sign: SummaryItem[] };

const NUM = /[0-9０-９一二三四五六七八九十百零]/;
const SIGN = /訂簽/;
const CHAPTER_ONLY = /^[0-9０-９一二三四五六七八九十百零\-－–—~～.．、,，\s]+$/;
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

export function splitEntries(value: string | undefined): string[] {
  return String(value ?? "").split(/\r?\n|[；;]/).map((x) => x.trim()).filter(Boolean);
}

/** 有數字且不含訂簽 → 算課堂進度；否則算作業 */
export function goesToCourse(raw: string): boolean {
  return !SIGN.test(raw) && NUM.test(raw);
}

/**
 * 詩選分流（老師回條 2026-10-07）：
 * 「背」＋數字（例：背12）→ 作業；只有數字（例：12、12-13）→ 課堂進度；其他文字 → 兩邊都列。
 */
export function poemRoute(raw: string): "course" | "homework" | "both" {
  if (/背/.test(raw) && NUM.test(raw)) return "homework";
  if (NUM.test(raw) && CHAPTER_ONLY.test(raw)) return "course";
  return "both";
}

/** 列入作業總覽的欄位與順序。堂、備註已隱藏，不列入；其他考試只做預告（R8），不在這裡。 */
export const HOMEWORK_KEYS = [
  "國預習單", "甲本", "乙本", "國習", "國簿", "國白卷", "字詞本", "字詞考", "國課練", "國單元考",
  "寫作", "閱達", "成易", "詩選", "國複卷",
  "社習", "社重", "社簿", "社白卷", "社複卷", "社單元考",
  "數學", "自然", "其他",
];
const MULTI_EXAM = new Set(["字詞考", "國單元考", "社單元考"]);
const SINGLE_STUDY = new Set(["國課練", "字詞本"]);

/** R1–R4：自動帶入「國語課程進度」的行 */
export function autoCourseZh(day: DayValues): string[] {
  const lines: string[] = [];
  for (const k of ["國課練", "字詞本"]) splitEntries(day[k]).filter(goesToCourse).forEach((x) => lines.push(`${k}：${x}`));
  splitEntries(day["詩選"]).filter((x) => poemRoute(x) !== "homework").forEach((x) => lines.push(`詩選：${x}`));
  splitEntries(day["字詞考"]).filter(goesToCourse).forEach((x) => lines.push(`字詞考：${x}`));
  splitEntries(day["國單元考"]).filter(goesToCourse).forEach((x) => lines.push(`考${x}`));
  return lines;
}

/** R5：自動帶入「社會課程進度」的行 */
export function autoCourseSocial(day: DayValues): string[] {
  return splitEntries(day["社單元考"]).filter(goesToCourse).map((x) => `考${x}`);
}

export type NextDay = { vals: DayValues; dow: number };

/** 當日作業總覽：當天的作業項目，加上下一個上學日的考試預告（寫出星期，例：週一考國L3字詞考） */
export function summaryItems(day: DayValues, next: NextDay | null): Summary {
  const out: Summary = { homework: [], sign: [] };
  for (const k of HOMEWORK_KEYS) {
    for (const x of splitEntries(day[k])) {
      if ((MULTI_EXAM.has(k) || SINGLE_STUDY.has(k)) && goesToCourse(x)) continue;
      if (k === "詩選" && poemRoute(x) === "course") continue;
      (SIGN.test(x) ? out.sign : out.homework).push({ label: k, text: x, plain: false });
    }
  }
  if (next) {
    const when = `週${WEEKDAY[next.dow]}考`;
    const remind = (text: string) => out.homework.push({ label: "", text, plain: true });
    splitEntries(next.vals["字詞考"]).filter(goesToCourse).forEach((x) => remind(`${when}國${x}字詞考`));
    splitEntries(next.vals["國單元考"]).filter(goesToCourse).forEach((x) => remind(`${when}國${x}單元考`));
    splitEntries(next.vals["社單元考"]).filter(goesToCourse).forEach((x) => remind(`${when}社${x}單元考`));
    splitEntries(next.vals["其他考試"]).forEach((x) => remind(`${when}${x}`));
  }
  return out;
}

export function summaryText(items: SummaryItem[]): string {
  return items.map((x) => (x.plain ? x.text : `${x.label}｜${x.text}`)).join("；");
}
```

- [x] **Step 4: 執行，確認通過**

Run: `npx vitest run src/features/planner/logic/rules.test.ts`
Expected: PASS（全部）。

`npm run typecheck` 此時會在 `PlannerRow.tsx`、`PlannerPage.tsx` 報錯（`summaryItems` 回傳型別改變），Task 4、5 會修正。

- [x] **Step 5: Commit**

```bash
git add src/features/planner/logic/rules.ts src/features/planner/logic/rules.test.ts
git commit -m "feat(planner): 作業總覽拆成作業與訂簽、逐項判斷、新增其他考試預告（R8）"
```

---

### Task 4: 規劃表的一列（固定欄、文字框按鍵、總覽兩塊）

**Files:**
- Modify: `src/features/planner/PlannerRow.tsx`（整份改寫）

固定欄規則（設計 §4.1）：
- 電腦（`md` ≥ 768px）：週次 `left-0`（40px，`w-10`）、日期 `left-10`（56px，`w-14`）、作業總覽 `left-24`（220px），右緣陰影在作業總覽。
- 手機：週次欄隱藏；日期 `left-0` 固定並顯示週次；作業總覽不固定；右緣陰影在日期。

- [x] **Step 1: 改寫 PlannerRow.tsx**

```tsx
import { memo, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { PlannerColumn } from "../../lib/types";
import { WEEKDAYS, type DayRow } from "./logic/calendar";
import { autoCourseSocial, autoCourseZh, summaryItems, type DayValues, type SummaryItem } from "./logic/rules";

type Props = {
  row: DayRow;
  vals: DayValues;
  nextVals: DayValues | null;
  nextDow: number;
  hwCols: PlannerColumn[];
  fixed: Record<string, PlannerColumn | undefined>;
  onChange: (date: string, col: PlannerColumn, value: string) => void;
  failed: boolean;
};

/** 內容通常比較長、給寬一點的作業欄 */
const WIDE = new Set(["寫作", "字詞考", "國單元考", "社單元考", "其他", "其他考試"]);

function AutoTextarea({ value, onChange, onKeyDown, disabled, placeholder, colKey, className = "" }: {
  value: string; onChange: (v: string) => void; onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean; placeholder?: string; colKey: string; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(34, el.scrollHeight)}px`;
  }, [value]);
  return (
    <textarea ref={ref} rows={1} data-col={colKey} value={value} disabled={disabled} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
      className={`block w-full resize-none overflow-hidden bg-transparent px-1.5 py-1 text-left leading-snug outline-none focus:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40 ${className}`} />
  );
}

/**
 * 作業格的按鍵：Enter 跳到下一個可輸入的上學日同一欄；Alt／Option＋Enter 或 Shift＋Enter 在格子內換行。
 * 中文輸入法選字時的 Enter 不處理（Safari 選字確認時 isComposing 為 false，但 keyCode 為 229）。
 */
function cellKeys(onChange: (v: string) => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    const el = e.currentTarget;
    if (e.altKey || e.shiftKey) {
      const { selectionStart: s, selectionEnd: t, value } = el;
      onChange(`${value.slice(0, s)}\n${value.slice(t)}`);
      requestAnimationFrame(() => el.setSelectionRange(s + 1, s + 1));
      return;
    }
    let tr = el.closest("tr")?.nextElementSibling;
    while (tr) {
      const next = tr.querySelector<HTMLTextAreaElement>(`textarea[data-col="${el.dataset.col}"]:not([disabled])`);
      if (next) { next.focus(); next.select(); return; }
      tr = tr.nextElementSibling;
    }
  };
}

function SummaryBlock({ label, items, divider }: { label: string; items: SummaryItem[]; divider?: boolean }) {
  return (
    <div className={`grid grid-cols-[32px_1fr] ${divider ? "border-b border-line" : ""}`}>
      <div className="flex items-center justify-center bg-[#e3effa] text-xs font-black text-[#315a7d]">{label}</div>
      <div className="px-2 py-1">
        {items.length === 0 ? <span className="text-muted/60">—</span> : items.map((x, i) => (
          <div key={i}>{x.plain ? <b className="text-[#315a7d]">{x.text}</b> : <><b className="text-[#315a7d]">{x.label}</b>｜{x.text}</>}</div>
        ))}
      </div>
    </div>
  );
}

export const PlannerRow = memo(function PlannerRow({ row, vals, nextVals, nextDow, hwCols, fixed, onChange, failed }: Props) {
  const off = !row.isSchoolDay;
  const d = row.date;
  const bg = row.holiday ? "bg-rose/40" : row.isManualOff ? "bg-line/40" : "bg-sheet";
  const cell = `border-b border-r border-line align-top ${bg}`;
  const sum = summaryItems(vals, nextVals ? { vals: nextVals, dow: nextDow } : null);
  const zhAuto = autoCourseZh(vals);
  const soAuto = autoCourseSocial(vals);
  const set = (key: string) => (v: string) => { const c = fixed[key]; if (c) onChange(row.key, c, v); };

  return (
    <tr id={`row-${row.key}`} data-month={row.month} data-week={row.week} className={`${row.dow === 1 ? "[&>td]:border-t-2 [&>td]:border-t-muted/40" : ""} ${failed ? "outline outline-2 outline-rose-ink" : ""}`}>
      <td className={`${cell} hidden w-10 text-center font-bold text-muted md:sticky md:left-0 md:z-10 md:table-cell`}>{row.week}</td>
      <td className={`${cell} sticky left-0 z-10 w-14 min-w-14 text-center font-bold leading-tight shadow-[4px_0_6px_-5px_rgba(0,0,0,.4)] md:left-10 md:shadow-none`}>
        <div className="text-xs font-normal text-muted md:hidden">第{row.week}週</div>
        {d.getMonth() + 1}/{d.getDate()}<div className="text-xs font-normal text-muted">週{WEEKDAYS[row.dow]}</div>
      </td>
      <td className={`${cell} w-[220px] min-w-[220px] bg-[#f6fbff] text-sm leading-snug md:sticky md:left-24 md:z-10 md:shadow-[4px_0_6px_-5px_rgba(0,0,0,.4)]`}>
        <SummaryBlock label="作業" items={sum.homework} divider />
        <SummaryBlock label="訂簽" items={sum.sign} />
      </td>
      <td className={`${cell} w-[140px] min-w-[140px]`}>
        {(row.holiday || row.isManualOff) && <div className="px-1.5 pt-1 text-sm font-black text-rose-ink">{row.holiday || "自訂不上課日"}<span className="ml-1 rounded-full bg-rose px-1.5 text-xs">不上課</span></div>}
        <AutoTextarea colKey="重要行事曆" value={vals["重要行事曆"] ?? ""} onChange={set("重要行事曆")} placeholder={off ? "可補充校內行事" : "輸入校內行事"} />
      </td>
      <td className={`${cell} w-[180px] min-w-[180px]`}>
        <div className="grid grid-cols-[36px_1fr] border-b border-line">
          <div className="flex items-center justify-center bg-[#f6f2ff] text-sm font-black">國語</div>
          <div>
            <AutoTextarea colKey="國語課程進度" disabled={off} value={vals["國語課程進度"] ?? ""} onChange={set("國語課程進度")} />
            {zhAuto.map((l, i) => <div key={i} className="px-1.5 pb-0.5 text-sm text-sage">{l}</div>)}
          </div>
        </div>
        <div className="grid grid-cols-[36px_1fr]">
          <div className="flex items-center justify-center bg-[#f6f2ff] text-sm font-black">社會</div>
          <div>
            <AutoTextarea colKey="社會課程進度" disabled={off} value={vals["社會課程進度"] ?? ""} onChange={set("社會課程進度")} />
            {soAuto.map((l, i) => <div key={i} className="px-1.5 pb-0.5 text-sm text-sage">{l}</div>)}
          </div>
        </div>
      </td>
      {hwCols.map((c) => {
        const change = (v: string) => onChange(row.key, c, v);
        return (
          <td key={c.id} className={`${cell} ${WIDE.has(c.key) ? "w-[100px] min-w-[100px]" : "w-[72px] min-w-[72px]"}`}>
            <AutoTextarea colKey={c.key} disabled={off} value={vals[c.key] ?? ""} onChange={change} onKeyDown={cellKeys(change)} />
          </td>
        );
      })}
    </tr>
  );
});
```

- [x] **Step 2: 型別檢查（只看這個檔案）**

Run: `npm run typecheck 2>&1 | grep PlannerRow || echo "PlannerRow OK"`
Expected: `PlannerRow OK`（`PlannerPage.tsx` 的錯誤留到 Task 5）。

- [x] **Step 3: Commit**

```bash
git add src/features/planner/PlannerRow.tsx
git commit -m "feat(planner): 固定欄瘦身並支援手機、作業格可換行且靠左上、總覽分作業與訂簽"
```

---

### Task 5: 規劃表頁面（表頭、隱藏欄、CSV）

**Files:**
- Modify: `src/features/planner/PlannerPage.tsx:41,94-106,108-109,151-163,176-178`

- [x] **Step 1: 過濾隱藏欄**

第 41 行改成：

```ts
  const hwCols = useMemo(() => columns.filter((c) => !c.hidden && (c.kind === "text" || c.kind === "multiline")), [columns]);
```

- [x] **Step 2: CSV 改成兩個總覽欄、拿掉堂**

`exportCsv` 整個函式改成：

```ts
  function exportCsv() {
    const header = ["週次", "日期", "星期", "是否上課", "國定假日／補假", "重要行事曆", "作業總覽", "訂簽總覽", "國語課程進度", "社會課程進度", ...hwCols.map((c) => c.key)];
    const body = rows.map((r) => {
      const v = values[r.key] ?? {};
      const nr = nextOf.get(r.key);
      const sum = summaryItems(v, nr ? { vals: values[nr.key] ?? {}, dow: nr.dow } : null);
      const merge = (manual: string | undefined, auto: string[]) => [manual?.trim(), ...auto].filter(Boolean).join("\n");
      return [r.week, r.key, `週${WEEKDAYS[r.dow]}`, r.isSchoolDay ? "上課" : "不上課", r.holiday || (r.isManualOff ? "自訂不上課日" : ""),
        v["重要行事曆"] ?? "", summaryText(sum.homework), summaryText(sum.sign),
        merge(v["國語課程進度"], autoCourseZh(v)), merge(v["社會課程進度"], autoCourseSocial(v)),
        ...hwCols.map((c) => v[c.key] ?? "")];
    });
    downloadText("MuMu整學期課程進度規劃表.csv", toCsv([header, ...body]));
  }
```

- [x] **Step 3: 表頭**

刪掉 `const stickyTh = ...` 這一行（保留 `const th = ...`），把 `<thead>` 第一個 `<tr>` 的前六個 `<th>` 換成下面五個（順序：週次、日期、作業總覽、行事曆、課堂進度；拿掉堂）：

```tsx
              <th rowSpan={2} className={`${th} hidden w-10 bg-sheet md:sticky md:left-0 md:z-30 md:table-cell`}>週次</th>
              <th rowSpan={2} className={`${th} sticky left-0 z-30 w-14 bg-sheet md:left-10`}>日期</th>
              <th rowSpan={2} className={`${th} w-[220px] bg-[#eef7ff] md:sticky md:left-24 md:z-30`}>當日作業總覽</th>
              <th rowSpan={2} className={`${th} w-[140px] bg-[#fff8e8]`}>重要行事曆</th>
              <th rowSpan={2} className={`${th} w-[180px] bg-[#f6f2ff]`}>課堂進度</th>
```

`groups.map(...)` 與第二列 `hwCols.map(...)` 不變（`groups` 由已過濾的 `hwCols` 算出，隱藏欄自然不出現）。

- [x] **Step 4: 頁尾說明加上按鍵**

頁尾 `<p>` 的文字改成：

```tsx
        國定假日依行政院人事行政總處辦公日曆內建，學校實際放假以校方行事曆為準。綠色字是依作業欄自動帶入的課堂進度，不需要手動輸入。
        作業格按 Enter 跳到下一個上學日，按 Alt（Mac 為 Option）＋Enter 或 Shift＋Enter 換行。
```

- [x] **Step 5: 型別檢查與全部測試**

Run: `npm run typecheck && npm test`
Expected: 0 個型別錯誤；所有測試 PASS。若 `typecheck` 抱怨 `HomeworkToday`／`HomeworkMissing` 以外的錯誤，修正後再繼續。

- [x] **Step 6: Commit**

```bash
git add src/features/planner/PlannerPage.tsx
git commit -m "feat(planner): 表頭改為新固定欄、隱藏堂與備註、CSV 分作業與訂簽總覽"
```

---

### Task 6: 小管家的排序與依學生整理（純函式）

**Files:**
- Create: `src/features/homework/logic/order.ts`
- Test: `src/features/homework/logic/order.test.ts`

- [x] **Step 1: 寫失敗的測試**

建立 `src/features/homework/logic/order.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { missingByStudent, moveItem, sortOpen } from "./order";

const a = (id: string, sort_order: number, assigned_date: string, created_at = `${assigned_date}T08:00:00Z`) =>
  ({ id, sort_order, assigned_date, created_at });

describe("sortOpen", () => {
  it("sort_order 小的在前", () => {
    expect(sortOpen([a("x", 2, "2026-10-10"), a("y", 1, "2026-10-01")]).map((v) => v.id)).toEqual(["y", "x"]);
  });
  it("sort_order 相同時，日期新的在前，再比建立時間", () => {
    const list = [a("old", 0, "2026-10-01"), a("new", 0, "2026-10-05"), a("later", 0, "2026-10-05", "2026-10-05T09:00:00Z")];
    expect(sortOpen(list).map((v) => v.id)).toEqual(["later", "new", "old"]);
  });
  it("新建立的作業（0）排在已排序過的（1 起）前面", () => {
    expect(sortOpen([a("p", 1, "2026-10-10"), a("fresh", 0, "2026-10-01")]).map((v) => v.id)).toEqual(["fresh", "p"]);
  });
  it("不改動傳入的陣列", () => {
    const list = [a("x", 2, "2026-10-10"), a("y", 1, "2026-10-01")];
    sortOpen(list);
    expect(list.map((v) => v.id)).toEqual(["x", "y"]);
  });
});

describe("moveItem", () => {
  it("往前、往後移一格", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });
  it("超出範圍時原樣回傳", () => {
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("missingByStudent", () => {
  const students = [{ id: "s3", student_no: 3 }, { id: "s1", student_no: 1 }, { id: "s2", student_no: 2 }];
  const hw = (id: string, missing: string[]) => ({
    id, homework_checks: students.map((s) => ({ student_id: s.id, status: missing.includes(s.id) ? "missing" as const : "done" as const })),
  });

  it("只列有缺交的學生，依座號排序，作業依傳入順序", () => {
    const rows = missingByStudent([hw("國習", ["s3", "s1"]), hw("數祕本", ["s3"])], students);
    expect(rows.map((r) => [r.student.student_no, r.assignments.map((x) => x.id)])).toEqual([
      [1, ["國習"]],
      [3, ["國習", "數祕本"]],
    ]);
  });
  it("全部交齊時回傳空陣列", () => {
    expect(missingByStudent([hw("國習", [])], students)).toEqual([]);
  });
});
```

- [x] **Step 2: 執行，確認失敗**

Run: `npx vitest run src/features/homework/logic/order.test.ts`
Expected: FAIL，`Failed to resolve import "./order"`。

- [x] **Step 3: 實作**

建立 `src/features/homework/logic/order.ts`：

```ts
type Orderable = { sort_order: number; assigned_date: string; created_at: string };

/**
 * 進行中作業的顯示順序（2026-10-16 回饋設計 §5.1）：sort_order 小的在前；相同時日期新的在前，再比建立時間。
 * 老師調整過順序後會編為 1、2、3…，新建立的作業是 0，所以一定排在最前面。
 */
export function sortOpen<T extends Orderable>(list: T[]): T[] {
  return [...list].sort((x, y) =>
    x.sort_order - y.sort_order || y.assigned_date.localeCompare(x.assigned_date) || y.created_at.localeCompare(x.created_at));
}

/** 把第 index 個往前（-1）或往後（+1）移一格；超出範圍時原樣回傳 */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

type WithChecks = { id: string; homework_checks: { student_id: string; status: "done" | "missing" }[] };

/** 依學生整理缺交：只列出有缺交的學生，依座號排序；每位學生的作業依傳入的順序 */
export function missingByStudent<A extends WithChecks, S extends { id: string; student_no: number }>(
  open: A[], students: S[],
): { student: S; assignments: A[] }[] {
  return students
    .map((student) => ({
      student,
      assignments: open.filter((a) => a.homework_checks.some((c) => c.student_id === student.id && c.status === "missing")),
    }))
    .filter((r) => r.assignments.length > 0)
    .sort((x, y) => x.student.student_no - y.student.student_no);
}
```

- [x] **Step 4: 執行，確認通過**

Run: `npx vitest run src/features/homework/logic/order.test.ts`
Expected: PASS（全部）。

- [x] **Step 5: Commit**

```bash
git add src/features/homework/logic/order.ts src/features/homework/logic/order.test.ts
git commit -m "feat(homework): 進行中作業排序與依學生整理缺交的邏輯"
```

---

### Task 7: 讀寫排序（api）與「今日作業」的 ◀ ▶

**Files:**
- Modify: `src/features/homework/api.ts:12,end`
- Modify: `src/features/homework/HomeworkToday.tsx:1-20,60-67`

- [x] **Step 1: api 讀 sort_order 並加上排序的 mutation**

`useAssignments` 的 select 字串加上 `sort_order`：

```ts
          .select("id,class_id,item_id,note,assigned_date,sort_order,status,archived_at,created_at,homework_checks(student_id,status)")
```

檔案最後新增：

```ts
/** 調整進行中作業的順序：依傳入的 id 順序寫入 sort_order = 1、2、3…；樂觀更新，失敗時還原 */
export function useReorderAssignments(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id, i) => must(supabase.from("homework_assignments").update({ sort_order: i + 1 }).eq("id", id))));
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key(classId) });
      const prev = qc.getQueryData<Assignment[]>(key(classId));
      const pos = new Map(ids.map((id, i) => [id, i + 1]));
      qc.setQueryData<Assignment[]>(key(classId), (list) => list?.map((a) => (pos.has(a.id) ? { ...a, sort_order: pos.get(a.id)! } : a)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key(classId), ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key(classId) }),
  });
}
```

- [x] **Step 2: HomeworkToday 使用排序**

import 改成：

```ts
import { useAssignments, useCreateAssignment, useReorderAssignments, useSetChecks, useUpdateAssignment } from "./api";
import { HomeworkTabs } from "./HomeworkTabs";
import { ItemSelect } from "./ItemSelect";
import { moveItem, sortOpen } from "./logic/order";
import { parseNums } from "./logic/parseNums";
```

在 `const update = useUpdateAssignment(cls.id);` 下一行加：

```ts
  const reorder = useReorderAssignments(cls.id);
```

`const open = ...` 改成：

```ts
  const open = sortOpen((q.data ?? []).filter((a) => a.status === "open"));
```

在 `function remove()` 之後新增：

```ts
  function move(index: number, delta: -1 | 1) {
    reorder.mutate(moveItem(open, index, delta).map((x) => x.id), { onError: () => toast("順序沒有存到，請再試一次") });
  }
```

- [x] **Step 3: 標籤列加上 ◀ ▶**

`<div className="tabbar mb-3">` 裡的 `open.map(...)` 換成：

```tsx
        {open.map((x, i) => {
          const on = x.id === a?.id;
          return (
            <span key={x.id} className="inline-flex shrink-0 items-center gap-1">
              {on && i > 0 && <button className="chip px-2" aria-label="往前移" onClick={() => move(i, -1)}>◀</button>}
              <button className={on ? "chip-on" : "chip"} onClick={() => setSelected(x.id)}>{itemTitle(items, x.item_id, x.note)}</button>
              {on && i < open.length - 1 && <button className="chip px-2" aria-label="往後移" onClick={() => move(i, 1)}>▶</button>}
            </span>
          );
        })}
```

- [x] **Step 4: 型別檢查與測試**

Run: `npm run typecheck && npm test`
Expected: 0 個錯誤，測試全部 PASS。

- [x] **Step 5: Commit**

```bash
git add src/features/homework/api.ts src/features/homework/HomeworkToday.tsx
git commit -m "feat(homework): 今日作業可用 ◀ ▶ 調整進行中作業的順序"
```

---

### Task 8: 缺交總覽「依作業／依學生」

**Files:**
- Modify: `src/features/homework/HomeworkMissing.tsx`（整份改寫）

- [x] **Step 1: 改寫 HomeworkMissing.tsx**

```tsx
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
```

- [x] **Step 2: 型別檢查、測試、建置**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部成功。

- [x] **Step 3: Commit**

```bash
git add src/features/homework/HomeworkMissing.tsx
git commit -m "feat(homework): 缺交總覽可切換依學生檢視個人缺交清單"
```

---

### Task 9: 在瀏覽器實測（本機 Supabase）

`.env.local` 已指向本機 Supabase（`127.0.0.1:54321`），不會碰到正式資料。

- [x] **Step 1: 啟動本機 Supabase 並套用新 migration**

```bash
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta,mailpit
```

```bash
supabase migration up
```

Expected: 顯示套用 `20261016120000_teacher_feedback.sql`。若本機資料庫原本沒有規劃表欄位，函式不會做任何事；進入規劃表頁面時前端會用新的預設欄位建立。

- [x] **Step 2: 啟動前端**

用 `preview_start`，name 為 `mumu-dev`（`.claude/launch.json`）。用本機 Supabase 上的測試帳號登入；本機沒有帳號時，在本機 Auth 建一個測試帳號，帳密不要寫進回覆。絕不使用正式帳號。
Safari 與 Chrome 的注音輸入行為不同。內建瀏覽器只能測 Chromium，所以 Step 3 的輸入法檢查在回報中註明「Safari 尚未實測」，請使用者在 Safari 上確認。

- [ ] **Step 3:（2026-10-16 已在內建瀏覽器測完 Enter／Alt+Enter／Shift+Enter、其他考試預告、重新整理後保存；尚缺：Safari 注音選字、CSV 實際下載） 規劃表檢查清單（電腦寬度）**

- 表頭沒有「堂」「備註」；「其他」分組為數學、自然、其他、其他考試。
- 往右捲時週次、日期、當日作業總覽固定不動，行事曆與課堂進度會捲走。
- 在國習格輸入「P.20」，按 Enter → 游標跳到下一個上學日的國習格。
- 在國習格按 Alt（Option）＋Enter → 格子內換行，格子長高；輸入「L2訂簽」→ 總覽「訂簽」塊出現「國習｜L2訂簽」。
- 用注音輸入法在格子內打字、按 Enter 選字 → 不會跳列。
- 在某週三的其他考試填「數L3」→ 週二的總覽「作業」塊出現「週三考數L3」；週三當天不顯示。
- 重新整理頁面，以上內容仍在（有存進資料庫）。
- 匯出 CSV：有「作業總覽」「訂簽總覽」兩欄，沒有「堂」。

- [x] **Step 4: 規劃表檢查清單（手機寬度）**

`resize_window` preset `mobile`，重新整理：
- 週次欄不見，日期格上方顯示「第 N 週」，只有日期欄固定。
- 作業總覽會隨水平捲動移走。

檢查完 `resize_window` preset `desktop`。

- [x] **Step 5: 作業小管家檢查清單（手機寬度）**

- 建立三份作業，點第二份 → 兩側出現 ◀ ▶；按 ◀ → 移到第一位。
- 重新整理後順序維持；「缺交總覽」的標籤順序相同。
- 再新建一份作業 → 出現在最前面。
- 缺交總覽切到「依學生」→ 只列有缺交的學生，依座號排序，每人列出缺交的作業；把某位學生全部打勾後，他從清單消失。

- [ ] **Step 6: 效能**

在規劃表連續輸入、上下捲動，確認沒有明顯卡頓。若卡頓，回報給使用者再決定是否改成「取得焦點時才換成文字框」（設計 §6），不要自行擴大範圍。

- [x] **Step 7: 截圖給使用者**

電腦版規劃表、手機版規劃表、依學生缺交各截一張圖，用 `SendUserFile` 或在回覆中附上。

---

### Task 10: 開 PR（需使用者同意後才 push）

- [ ] **Step 1: 確認全部檢查通過**

Run: `npm run typecheck && npm test && npm run build && ./scripts/db-test.sh`
Expected: 全部成功。

- [ ] **Step 2: 經使用者同意後 push 並開 PR**

```bash
git push -u origin feat/teacher-feedback-1016
```

PR 描述必須包含「套用到 prod 的步驟」，並說明**要先套用 migration 再合併**：新版前端會讀 `homework_assignments.sort_order` 與 `planner_columns.hidden`，若先部署前端，作業小管家會讀取失敗；而 migration 只新增欄位，舊版前端不受影響。

PR 描述範本：

```markdown
## 內容
依老師 2026-10-16 的使用回饋調整課程規劃表與作業小管家。設計：docs/superpowers/specs/2026-10-16-teacher-feedback-planner-homework-design.md

## 套用到 prod 的步驟（合併前）
1. 確認昨晚的備份 artifact 存在（Actions → Nightly backup）。
2. Supabase Dashboard → SQL Editor，貼上 `supabase/migrations/20261016120000_teacher_feedback.sql` 全文並執行。
3. 執行 `select key, hidden, sort_order from planner_columns order by owner_id, sort_order;` 確認兩個帳號都有數學、自然、其他考試，堂與備註為 hidden。
4. 合併本 PR，等 Netlify 部署完成。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
