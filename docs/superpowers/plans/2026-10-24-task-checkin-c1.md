# 任務打卡 C1（一般任務與教室模式）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 MuMu 班級工作台新增「任務打卡」的一般任務系列（打卡台、缺交總覽、學生歷程、封存紀錄），以及給 iPad＋電子白板用的教室模式與 PIN。

**Architecture:** 一支 SQL migration 建立 5 張表、1 個統計 view、名單 trigger 與 5 個 `security definer` RPC。打卡相關的表對登入者只開放讀取，寫入一律走 RPC（設計 §5.6）。前端放在 `src/features/checkin/`：純函式在 `logic/`（有單元測試），讀寫集中在 `api.ts`，教室模式的狀態放在 `classroom.tsx`（React context＋localStorage）。

**Tech Stack:** React 19、TypeScript、Tailwind v4、TanStack Query v5、React Router v7、Supabase（Postgres＋RLS）、Vitest、`scripts/db-test.sh`（本機暫時的 Postgres）。

**設計文件：** `docs/superpowers/specs/2026-10-23-task-checkin-design.md`（以下稱「設計」）。本計畫只做設計 §12 的 **C1**；中午時段是 C2，Excel 匯出與驗收是 C3。

**分支：** `feat/task-checkin-c1`（已從 `origin/main` 建立）。`main` 受保護，只能走 PR。

---

## 和設計文件不同的地方（實作時的小調整）

| 項目 | 設計 | 本計畫 | 原因 |
|---|---|---|---|
| 「未完成 N 人 →」 | 卡片底部 | 卡片標題下的第二行右側 | 省下一列高度，iPad 一頁放得下 2×2 張卡片（Task 8） |
| 教室模式的「名單與設定」「備份資料」 | 兩顆按鈕 | 合成一顆「名單、設定與備份」 | 兩顆都是離開教室模式後前往 `/settings`，備份就在設定頁 |
| 新表加進備份清單 | C3 | C1（Task 13） | 只改兩行；資料一上線就有每晚備份 |
| 畫面右上的時鐘、系列切換（任務打卡／中午時段） | 教室模式標題列 | C2 | C1 沒有截止判定，也還沒有中午時段 |
| 一般任務打卡的 `actor` | student／teacher | 一律 `student` | 設計 §13 #4：一般任務的補登不另外區分 |
| 誤建的任務 | 沒提到 | 不提供刪除；可改名稱、日期、說明，或單項封存 | 封存後的紀錄不能修改，刪除會讓歷程對不起來 |

---

## 檔案地圖

| 檔案 | 動作 | 職責 |
|---|---|---|
| `supabase/migrations/20261024120000_checkin_c1.sql` | 新增 | 資料表、view、trigger、RLS、權限、RPC |
| `supabase/tests/checkin_c1.sql` | 新增 | RPC、名單 trigger、復原、封存、權限的資料庫測試 |
| `src/lib/types.ts` | 修改 | 任務打卡的型別 |
| `src/lib/supabase.ts`、`src/lib/supabase.test.ts` | 修改 | `fetchAll` 分頁讀取 |
| `src/features/checkin/logic/time.ts`（＋test） | 新增 | 台北時間的格式化、今天的台北日期 |
| `src/features/checkin/logic/errors.ts`（＋test） | 新增 | RPC 拒絕原因轉成中文 |
| `src/features/checkin/logic/stats.ts`（＋test） | 新增 | 完成數、顯示順序、即時姓名、缺交整理、搜尋 |
| `src/features/checkin/logic/events.ts`（＋test） | 新增 | 操作歷程的文字 |
| `src/features/checkin/logic/tapGuard.ts`（＋test） | 新增 | 600ms 內同一顆按鈕的第二次點擊忽略 |
| `src/features/checkin/logic/pin.ts`（＋test） | 新增 | PIN 的 salt、雜湊、比對 |
| `src/features/checkin/api.ts` | 新增 | 查詢與寫入（TanStack Query） |
| `src/features/checkin/classroom.tsx` | 新增 | 教室模式、PIN 解鎖、閒置自動上鎖、路由限制 |
| `src/shared/Dialog.tsx` | 新增 | 共用對話框 |
| `src/features/checkin/PinPad.tsx` | 新增 | 大數字鍵盤 |
| `src/features/checkin/TaskCard.tsx` | 新增 | 一張任務卡（打卡台、封存紀錄共用） |
| `src/features/checkin/TaskEditor.tsx` | 新增 | 新增／編輯任務、標免交、單項封存 |
| `src/features/checkin/CheckinBoard.tsx` | 新增 | 打卡台（M01） |
| `src/features/checkin/CheckinShell.tsx` | 新增 | `/checkin/*` 的外框：一般模式的標題與分頁，教室模式的標題列 |
| `src/features/checkin/CheckinMissing.tsx` | 新增 | 缺交總覽（M02） |
| `src/features/checkin/CheckinHistory.tsx` | 新增 | 學生歷程（M03） |
| `src/features/checkin/CheckinArchive.tsx` | 新增 | 封存紀錄（M04） |
| `src/features/checkin/CheckinPinSection.tsx` | 新增 | 設定頁的 PIN 區塊 |
| `src/app/App.tsx` | 修改 | 路由、教室模式的 provider 與路由限制 |
| `src/app/Layout.tsx` | 修改 | 選單新增「任務打卡」；教室模式隱藏側欄與底部分頁 |
| `src/features/roster/SettingsPage.tsx` | 修改 | 加入 PIN 區塊、備份清單 |
| `scripts/backup.mjs` | 修改 | 備份清單 |

---

### Task 1: 資料庫 migration 與測試

**Files:**
- Create: `supabase/tests/checkin_c1.sql`
- Create: `supabase/migrations/20261024120000_checkin_c1.sql`

- [ ] **Step 1: 寫失敗的資料庫測試**

建立 `supabase/tests/checkin_c1.sql`：

```sql
-- 任務打卡 C1：一般任務的 RPC、名單 trigger、復原、封存與權限。
-- 以 postgres 連線；用 set_config 模擬登入者，用 set local role 切換成 authenticated。
-- 內部函式 _task_set_done 只授權給 postgres，測試用它指定打卡時間（設計 §10「可控的測試時鐘」）。
-- DO 區塊之間用 set_config('test.*') 傳遞產生的 id。
\set ON_ERROR_STOP 1
begin;

insert into auth.users values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
insert into classes (id, name, school_year) values ('0c000000-0000-0000-0000-000000000001', '311', 115);
insert into students (id, class_id, student_no, name_zh) values
  ('05000000-0000-0000-0000-000000000001', '0c000000-0000-0000-0000-000000000001', 1, '甲'),
  ('05000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-000000000001', 2, '乙'),
  ('05000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000001', 3, '丙');

-- 1. task_create：為每位在籍學生建一列 pending、寫入姓名快照；同一格只能有一項進行中的任務
do $$
declare v uuid;
begin
  v := task_create('0c000000-0000-0000-0000-000000000001', 1, '閱讀認證', '2026-10-23', null, '');
  assert (select count(*) from checkin_task_marks where task_id = v and state = 'pending') = 3, 'task_create 應建立 3 列 pending';
  assert (select name_zh from checkin_task_marks where task_id = v and student_id = '05000000-0000-0000-0000-000000000002') = '乙', '應寫入姓名快照';
  begin
    perform task_create('0c000000-0000-0000-0000-000000000001', 1, '重複', null, null, '');
    assert false, '同一格第二項進行中的任務應被拒絕';
  exception when unique_violation then null;
  end;
  perform set_config('test.task1', v::text, true);
end $$;

-- 2. 打卡；重送同一個狀態不重複記事件；不能直接改 marks、不能直接建任務、不能呼叫內部函式
do $$
declare t uuid := current_setting('test.task1')::uuid; r jsonb;
begin
  r := task_set_done(t, '05000000-0000-0000-0000-000000000001', true);
  assert r->>'state' = 'done' and r->>'event_id' is not null and r->>'done_at' is not null, '打卡應回傳 done、打卡時間與事件 id';
  perform set_config('test.event1', r->>'event_id', true);
  r := task_set_done(t, '05000000-0000-0000-0000-000000000001', true);
  assert r->>'event_id' is null, '重送同一個狀態不應再記事件';
  assert (select count(*) from checkin_events where task_id = t) = 1, '應只有 1 筆事件';
  begin
    update checkin_task_marks set state = 'done' where task_id = t;
    assert false, '不應能直接修改 checkin_task_marks';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into checkin_tasks (class_id, slot, name) values ('0c000000-0000-0000-0000-000000000001', 2, '繞過 RPC');
    assert false, '不應能直接新增 checkin_tasks';
  exception when insufficient_privilege then null;
  end;
  begin
    perform _task_set_done(t, '05000000-0000-0000-0000-000000000001', false, now());
    assert false, '登入者不應能呼叫內部函式';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. 復原（AC17）：取消後按復原，恢復原本的打卡時間；同一筆不能復原兩次；狀態已被改掉時拒絕
reset role;
do $$
declare t uuid := current_setting('test.task1')::uuid; e_cancel bigint; e_first bigint; r jsonb;
begin
  perform _task_set_done(t, '05000000-0000-0000-0000-000000000002', true, '2026-10-23 12:39:00+08');
  e_cancel := (_task_set_done(t, '05000000-0000-0000-0000-000000000002', false, '2026-10-23 12:45:00+08')->>'event_id')::bigint;
  r := checkin_undo(e_cancel);
  assert r->>'state' = 'done', '復原後應回到 done';
  assert (select done_at from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000002')
         = '2026-10-23 12:39:00+08', '復原應恢復原本 12:39 的打卡時間';
  begin
    perform checkin_undo(e_cancel);
    assert false, '同一筆不應能復原兩次';
  exception when raise_exception then assert sqlerrm = 'checkin_stale', sqlerrm;
  end;

  -- 取消後重新打卡：以重新打卡的時間為準；第一次打卡那筆已被後來的操作蓋過，不能再復原
  e_first := (_task_set_done(t, '05000000-0000-0000-0000-000000000003', true, '2026-10-23 12:30:00+08')->>'event_id')::bigint;
  perform _task_set_done(t, '05000000-0000-0000-0000-000000000003', false, '2026-10-23 12:31:00+08');
  perform _task_set_done(t, '05000000-0000-0000-0000-000000000003', true, '2026-10-23 12:50:00+08');
  assert (select done_at from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000003')
         = '2026-10-23 12:50:00+08', '重新打卡應以 12:50 為準';
  begin
    perform checkin_undo(e_first);
    assert false, '狀態已變動的事件不應能復原';
  exception when raise_exception then assert sqlerrm = 'checkin_stale', sqlerrm;
  end;
end $$;

-- 4. 免交：清掉打卡時間、不能再打卡、不算分母
set local role authenticated;
do $$
declare t uuid := current_setting('test.task1')::uuid; r jsonb;
begin
  r := task_set_exempt(t, '05000000-0000-0000-0000-000000000003', true);
  assert r->>'state' = 'exempt' and r->>'event_id' is not null, '應標為免交並記事件';
  assert (select done_at from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000003') is null, '免交應清掉打卡時間';
  begin
    perform task_set_done(t, '05000000-0000-0000-0000-000000000003', false);
    assert false, '免交的學生不應能打卡或取消';
  exception when raise_exception then assert sqlerrm = 'checkin_exempt', sqlerrm;
  end;
  -- 甲、乙完成，丙免交 → 應完成 2、完成 2、免交 1
  assert (select (total, done, exempt) = (2, 2, 1) from checkin_task_stats where task_id = t), '統計應為 total 2、done 2、exempt 1';
end $$;

-- 5. 名單異動（設計 §5.5）：新同學補一列、轉出不算、復學恢復原本的狀態
insert into students (id, class_id, student_no, name_zh) values
  ('05000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-000000000001', 4, '丁');
do $$
declare t uuid := current_setting('test.task1')::uuid;
begin
  assert exists (select 1 from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000004' and state = 'pending'),
    '新同學應補進進行中的任務';
  update students set left_at = now() where id = '05000000-0000-0000-0000-000000000001';
  assert (select removed_at is not null from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000001'), '轉出應填 removed_at';
  assert (select (total, done) = (2, 1) from checkin_task_stats where task_id = t), '轉出的學生不算分母：乙完成、丁未完成';
  update students set left_at = null where id = '05000000-0000-0000-0000-000000000001';
  assert (select removed_at is null and state = 'done' from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000001'),
    '復學應恢復原本的狀態';
end $$;

-- 6. 封存：只能直接改名稱等欄位；封存時更新姓名快照；封存後不能修改；格子騰出來；之後改名、轉出不影響舊紀錄
update students set name_zh = '乙乙' where id = '05000000-0000-0000-0000-000000000002';
do $$
declare t uuid := current_setting('test.task1')::uuid; b uuid;
begin
  update checkin_tasks set name = '閱讀認證（上）' where id = t;
  begin
    update checkin_tasks set status = 'archived' where id = t;
    assert false, '不應能直接改任務狀態';
  exception when insufficient_privilege then null;
  end;

  b := task_archive(array[t], 'round');
  assert (select status = 'archived' and batch_id = b and archived_at is not null from checkin_tasks where id = t), '任務應封存';
  assert (select title like '%任務紀錄' and kind = 'round' from checkin_batches where id = b), '批次應有預設標題';
  assert (select name_zh from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000002') = '乙乙',
    '封存時應更新姓名快照';
  begin
    perform task_set_done(t, '05000000-0000-0000-0000-000000000004', true);
    assert false, '封存後不應能打卡';
  exception when raise_exception then assert sqlerrm = 'checkin_archived', sqlerrm;
  end;
  begin
    update checkin_tasks set name = '改名' where id = t;
    assert false, '封存後不應能改任務';
  exception when raise_exception then assert sqlerrm = 'checkin_archived', sqlerrm;
  end;
  begin
    perform task_archive(array[t], 'round');
    assert false, '不應能重複封存';
  exception when raise_exception then assert sqlerrm = 'checkin_archive_invalid', sqlerrm;
  end;

  perform task_create('0c000000-0000-0000-0000-000000000001', 1, '新任務', null, null, '');
  update students set name_zh = '乙三', left_at = now() where id = '05000000-0000-0000-0000-000000000002';
  assert (select name_zh = '乙乙' and removed_at is null from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000002'),
    '封存後的紀錄不受改名、轉出影響';
end $$;

-- 7. 設定：可以存 PIN；午餐時序有預設值；hash 與 salt 必須一起設定
do $$
begin
  insert into checkin_settings (class_id, pin_hash, pin_salt) values ('0c000000-0000-0000-0000-000000000001', 'h', 's')
  on conflict (class_id) do update set pin_hash = excluded.pin_hash, pin_salt = excluded.pin_salt;
  assert (select pin_hash from checkin_settings) = 'h', '應能設定 PIN';
  assert (select jsonb_array_length(noon_timeline) from checkin_settings) = 3, '午餐時序應有預設值';
  begin
    update checkin_settings set pin_salt = null;
    assert false, '只有 hash 沒有 salt 應被拒絕';
  exception when check_violation then null;
  end;
end $$;

-- 8. 改以 B 登入：看不到、也改不到 A 的資料
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
do $$
declare t uuid := current_setting('test.task1')::uuid;
begin
  assert (select count(*) from checkin_tasks) = 0, 'B 不應看到 A 的任務';
  assert (select count(*) from checkin_task_marks) = 0, 'B 不應看到 A 的打卡';
  assert (select count(*) from checkin_events) = 0, 'B 不應看到 A 的事件';
  assert (select count(*) from checkin_batches) = 0, 'B 不應看到 A 的封存批次';
  assert (select count(*) from checkin_settings) = 0, 'B 不應看到 A 的設定';
  assert (select count(*) from checkin_task_stats) = 0, 'B 不應看到 A 的統計';
  begin
    perform task_create('0c000000-0000-0000-0000-000000000001', 2, '入侵', null, null, '');
    assert false, 'B 不應能在 A 的班級建任務';
  exception when insufficient_privilege then null;
  end;
  begin
    perform task_set_done(t, '05000000-0000-0000-0000-000000000004', true);
    assert false, 'B 不應能替 A 的學生打卡';
  exception when insufficient_privilege then null;
  end;
  begin
    perform checkin_undo(current_setting('test.event1')::bigint);
    assert false, 'B 不應能復原 A 的操作';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into checkin_settings (class_id, pin_hash, pin_salt) values ('0c000000-0000-0000-0000-000000000001', 'x', 'y');
    assert false, 'B 不應能寫 A 的設定';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'CHECKIN C1 DB TESTS PASSED' as result;
rollback;
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `./scripts/db-test.sh`
Expected: FAIL，錯誤類似 `function task_create(unknown, integer, unknown, unknown, unknown, unknown) does not exist`。

- [ ] **Step 3: 寫 migration**

建立 `supabase/migrations/20261024120000_checkin_c1.sql`：

```sql
-- 任務打卡 C1：一般任務、操作歷程、教室模式的 PIN
-- 設計：docs/superpowers/specs/2026-10-23-task-checkin-design.md §5.1、§5.2、§5.4–§5.6、§6.1、§6.3
-- 打卡相關的表對登入者只開放讀取，寫入一律走 security definer 的 RPC（§5.6），
-- 所以每個 RPC 第一件事是確認資料屬於 auth.uid()。

-- ───────────────────────── 資料表 ─────────────────────────
create table public.checkin_settings (
  class_id uuid primary key references public.classes on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  pin_hash text,
  pin_salt text,
  noon_timeline jsonb not null default
    '[{"time":"12:30","label":"加餐、倒餐"},{"time":"12:40","label":"全班收餐"},{"time":"12:45","label":"回到座位"}]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pin_pair check ((pin_hash is null) = (pin_salt is null))
);

create table public.checkin_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  kind text not null check (kind in ('round','single')),
  title text not null,
  archived_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checkin_batches_class on public.checkin_batches (class_id, archived_at desc);

create table public.checkin_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  slot smallint not null check (slot between 1 and 4),
  name text not null check (btrim(name) <> ''),
  task_date date not null default (now() at time zone 'Asia/Taipei')::date,
  due_date date,
  note text not null default '',
  status text not null default 'open' check (status in ('open','archived')),
  batch_id uuid references public.checkin_batches,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint archived_has_batch check ((status = 'archived') = (batch_id is not null and archived_at is not null))
);
create unique index checkin_tasks_open_slot on public.checkin_tasks (class_id, slot) where status = 'open';
create index checkin_tasks_batch on public.checkin_tasks (batch_id);

create table public.checkin_task_marks (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references public.checkin_tasks on delete cascade,
  student_id uuid not null references public.students,
  student_no int not null,
  name_zh text not null,
  state text not null default 'pending' check (state in ('pending','done','exempt')),
  done_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, student_id),
  constraint done_has_time check ((state = 'done') = (done_at is not null))
);
create index checkin_task_marks_student on public.checkin_task_marks (student_id);

-- 操作歷程：只能新增（登入者只有 select 權限，RPC 只 insert）
create table public.checkin_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  series text not null check (series in ('task','noon')),
  task_id uuid references public.checkin_tasks on delete cascade,
  day_id uuid,       -- C2 中午時段才用，屆時加外鍵
  day_item_id uuid,  -- 同上
  student_id uuid not null references public.students,
  action text not null check (action in ('done','cancel','undo','exempt','unexempt','leave','unleave','teacher_fill')),
  prev jsonb,
  next jsonb,
  undo_of bigint references public.checkin_events,
  actor text not null check (actor in ('student','teacher')),
  at timestamptz not null default now()
);
create index checkin_events_student on public.checkin_events (student_id, id desc);
create unique index checkin_events_undo_once on public.checkin_events (undo_of) where undo_of is not null;

-- 一般任務的完成統計：應完成數不含免交與轉出（設計 §8）
create view public.checkin_task_stats with (security_invoker = true) as
  select t.id as task_id, t.class_id, t.batch_id, t.name, t.slot, t.task_date, t.status,
         count(m.task_id) filter (where m.removed_at is null and m.state <> 'exempt')::int as total,
         count(m.task_id) filter (where m.removed_at is null and m.state = 'done')::int as done,
         count(m.task_id) filter (where m.removed_at is null and m.state = 'exempt')::int as exempt
  from public.checkin_tasks t
  left join public.checkin_task_marks m on m.task_id = t.id
  group by t.id;

-- ───────────────────────── triggers ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['checkin_settings','checkin_batches','checkin_tasks','checkin_task_marks']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit after update or delete on public.%I for each row execute function public.write_audit()', t);
  end loop;
end $$;

-- 封存後不能再修改（設計 §5.2）
create function public.checkin_guard_task() returns trigger
language plpgsql as $$
begin
  if old.status = 'archived' then raise exception 'checkin_archived'; end if;
  return new;
end $$;
create trigger guard_archived before update on public.checkin_tasks
  for each row execute function public.checkin_guard_task();

create function public.checkin_guard_mark() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.checkin_tasks t where t.id = old.task_id and t.status = 'archived') then
    raise exception 'checkin_archived';
  end if;
  return new;
end $$;
create trigger guard_archived before update on public.checkin_task_marks
  for each row execute function public.checkin_guard_mark();

-- 名單異動（設計 §5.5）：只動進行中的任務；marks 對登入者唯讀，所以用 security definer，並限定同一位老師
create function public.checkin_sync_roster() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.left_at is null then
    -- 新增或復學：進行中的任務還沒有這位學生就補一列 pending；復學的人清掉 removed_at，保留原本的狀態
    insert into checkin_task_marks (owner_id, task_id, student_id, student_no, name_zh)
    select t.owner_id, t.id, new.id, new.student_no, new.name_zh
    from checkin_tasks t
    where t.class_id = new.class_id and t.owner_id = new.owner_id and t.status = 'open'
    on conflict (task_id, student_id) do nothing;
    if tg_op = 'UPDATE' then
      update checkin_task_marks m set removed_at = null
      from checkin_tasks t
      where t.id = m.task_id and t.status = 'open' and m.student_id = new.id and m.removed_at is not null;
    end if;
  else
    update checkin_task_marks m set removed_at = now()
    from checkin_tasks t
    where t.id = m.task_id and t.status = 'open' and m.student_id = new.id and m.removed_at is null;
  end if;
  return null;
end $$;
create trigger checkin_sync_roster_insert after insert on public.students
  for each row execute function public.checkin_sync_roster();
create trigger checkin_sync_roster_left after update of left_at on public.students
  for each row when (old.left_at is distinct from new.left_at) execute function public.checkin_sync_roster();

-- ───────────────────────── RLS 與權限 ─────────────────────────
alter table public.checkin_settings enable row level security;
alter table public.checkin_batches enable row level security;
alter table public.checkin_tasks enable row level security;
alter table public.checkin_task_marks enable row level security;
alter table public.checkin_events enable row level security;

create policy owner_all on public.checkin_settings for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()));
create policy owner_all on public.checkin_tasks for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()));
create policy owner_read on public.checkin_batches for select to authenticated using (owner_id = auth.uid());
create policy owner_read on public.checkin_task_marks for select to authenticated using (owner_id = auth.uid());
create policy owner_read on public.checkin_events for select to authenticated using (owner_id = auth.uid());

-- 先全部收回再逐一授權，不依賴 Supabase 的預設權限
revoke all on public.checkin_settings, public.checkin_batches, public.checkin_tasks, public.checkin_task_marks,
  public.checkin_events, public.checkin_task_stats from anon, authenticated;
grant select, insert, update on public.checkin_settings to authenticated;
grant select on public.checkin_batches, public.checkin_tasks, public.checkin_task_marks, public.checkin_events,
  public.checkin_task_stats to authenticated;
-- 任務的名稱、日期、說明可以直接改（設計 §5.6）；狀態、格子只能透過 RPC
grant update (name, task_date, due_date, note) on public.checkin_tasks to authenticated;

-- ───────────────────────── RPC ─────────────────────────
create function public._checkin_class_owner(p_class_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from classes where id = p_class_id and owner_id = auth.uid()) then
    raise exception 'checkin_forbidden' using errcode = '42501';
  end if;
end $$;

-- 建立任務：同一個 transaction 內為在籍學生各建一列 pending（設計 §6.1）
create function public.task_create(p_class_id uuid, p_slot int, p_name text, p_task_date date, p_due_date date, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _checkin_class_owner(p_class_id);
  insert into checkin_tasks (owner_id, class_id, slot, name, task_date, due_date, note)
  values (auth.uid(), p_class_id, p_slot, btrim(p_name),
          coalesce(p_task_date, (now() at time zone 'Asia/Taipei')::date), p_due_date, coalesce(p_note, ''))
  returning id into v_id;

  insert into checkin_task_marks (owner_id, task_id, student_id, student_no, name_zh)
  select auth.uid(), v_id, s.id, s.student_no, s.name_zh
  from students s
  where s.class_id = p_class_id and s.left_at is null;
  return v_id;
end $$;

-- 打卡或取消：送的是目標狀態，已經是目標狀態就不寫入、不記事件（冪等）。p_at 讓測試能指定時間
create function public._task_set_done(p_task_id uuid, p_student_id uuid, p_done boolean, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t checkin_tasks;
  m checkin_task_marks;
  v_next text := case when p_done then 'done' else 'pending' end;
  v_at timestamptz := case when p_done then p_at end;
  v_event bigint;
begin
  select * into t from checkin_tasks where id = p_task_id and owner_id = auth.uid() for share;
  if not found then raise exception 'checkin_forbidden' using errcode = '42501'; end if;
  if t.status <> 'open' then raise exception 'checkin_archived'; end if;
  select * into m from checkin_task_marks where task_id = p_task_id and student_id = p_student_id for update;
  if not found or m.removed_at is not null then raise exception 'checkin_no_student'; end if;
  if m.state = 'exempt' then raise exception 'checkin_exempt'; end if;
  if m.state = v_next then
    return jsonb_build_object('state', m.state, 'done_at', m.done_at, 'event_id', null);
  end if;

  update checkin_task_marks set state = v_next, done_at = v_at
  where task_id = p_task_id and student_id = p_student_id;
  -- 一般任務的打卡不區分是誰按的（設計 §13 #4），actor 一律記 student
  insert into checkin_events (owner_id, class_id, series, task_id, student_id, action, prev, next, actor, at)
  values (auth.uid(), t.class_id, 'task', p_task_id, p_student_id, case when p_done then 'done' else 'cancel' end,
          jsonb_build_object('state', m.state, 'done_at', m.done_at),
          jsonb_build_object('state', v_next, 'done_at', v_at),
          'student', p_at)
  returning id into v_event;
  return jsonb_build_object('state', v_next, 'done_at', v_at, 'event_id', v_event);
end $$;

create function public.task_set_done(p_task_id uuid, p_student_id uuid, p_done boolean)
returns jsonb language sql security definer set search_path = public as $$
  select public._task_set_done(p_task_id, p_student_id, p_done, now())
$$;

-- 標免交或取消免交（只有老師用）。取消免交一律回到未完成
create function public.task_set_exempt(p_task_id uuid, p_student_id uuid, p_exempt boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t checkin_tasks; m checkin_task_marks; v_next text; v_event bigint;
begin
  select * into t from checkin_tasks where id = p_task_id and owner_id = auth.uid() for share;
  if not found then raise exception 'checkin_forbidden' using errcode = '42501'; end if;
  if t.status <> 'open' then raise exception 'checkin_archived'; end if;
  select * into m from checkin_task_marks where task_id = p_task_id and student_id = p_student_id for update;
  if not found or m.removed_at is not null then raise exception 'checkin_no_student'; end if;
  v_next := case when p_exempt then 'exempt' when m.state = 'exempt' then 'pending' else m.state end;
  if m.state = v_next then
    return jsonb_build_object('state', m.state, 'done_at', m.done_at, 'event_id', null);
  end if;

  update checkin_task_marks set state = v_next, done_at = null
  where task_id = p_task_id and student_id = p_student_id;
  insert into checkin_events (owner_id, class_id, series, task_id, student_id, action, prev, next, actor)
  values (auth.uid(), t.class_id, 'task', p_task_id, p_student_id, case when p_exempt then 'exempt' else 'unexempt' end,
          jsonb_build_object('state', m.state, 'done_at', m.done_at),
          jsonb_build_object('state', v_next, 'done_at', null),
          'teacher')
  returning id into v_event;
  return jsonb_build_object('state', v_next, 'done_at', null, 'event_id', v_event);
end $$;

-- 封存：建一個批次、用當下名單更新姓名快照、把任務設為 archived（騰出格子）
create function public.task_archive(p_task_ids uuid[], p_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_classes uuid[]; v_n int; v_batch uuid;
begin
  perform 1 from checkin_tasks where id = any(p_task_ids) and owner_id = auth.uid() for update;
  select array_agg(distinct class_id), count(*) into v_classes, v_n
  from checkin_tasks
  where id = any(p_task_ids) and owner_id = auth.uid() and status = 'open';
  if v_n = 0 or v_n <> cardinality(p_task_ids) or cardinality(v_classes) <> 1 then
    raise exception 'checkin_archive_invalid';
  end if;

  insert into checkin_batches (owner_id, class_id, kind, title)
  values (auth.uid(), v_classes[1], p_kind, to_char((now() at time zone 'Asia/Taipei')::date, 'YYYY-MM-DD') || ' 任務紀錄')
  returning id into v_batch;
  update checkin_task_marks m set student_no = s.student_no, name_zh = s.name_zh
  from students s
  where s.id = m.student_id and m.task_id = any(p_task_ids)
    and (m.student_no, m.name_zh) is distinct from (s.student_no, s.name_zh);
  update checkin_tasks set status = 'archived', batch_id = v_batch, archived_at = now()
  where id = any(p_task_ids);
  return v_batch;
end $$;

-- 復原（設計 §6.3）：只復原打卡或取消；目前狀態必須還等於該事件的 next，否則拒絕
create function public.checkin_undo(p_event_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e checkin_events; m checkin_task_marks; v_event bigint;
begin
  select * into e from checkin_events where id = p_event_id and owner_id = auth.uid();
  if not found then raise exception 'checkin_forbidden' using errcode = '42501'; end if;
  if e.series <> 'task' or e.action not in ('done','cancel') then raise exception 'checkin_not_undoable'; end if;
  perform 1 from checkin_tasks where id = e.task_id and status = 'open' for share;
  if not found then raise exception 'checkin_archived'; end if;
  select * into m from checkin_task_marks where task_id = e.task_id and student_id = e.student_id for update;
  if m.removed_at is not null
     or exists (select 1 from checkin_events where undo_of = p_event_id)
     or m.state is distinct from e.next->>'state'
     or m.done_at is distinct from (e.next->>'done_at')::timestamptz then
    raise exception 'checkin_stale';
  end if;

  update checkin_task_marks set state = e.prev->>'state', done_at = (e.prev->>'done_at')::timestamptz
  where task_id = e.task_id and student_id = e.student_id;
  insert into checkin_events (owner_id, class_id, series, task_id, student_id, action, prev, next, undo_of, actor)
  values (auth.uid(), e.class_id, 'task', e.task_id, e.student_id, 'undo', e.next, e.prev, e.id, 'student')
  returning id into v_event;
  return jsonb_build_object('state', e.prev->>'state', 'done_at', e.prev->'done_at', 'event_id', v_event);
end $$;

revoke execute on function public._checkin_class_owner(uuid), public._task_set_done(uuid, uuid, boolean, timestamptz),
  public.checkin_sync_roster(), public.checkin_guard_task(), public.checkin_guard_mark()
  from public, anon, authenticated;
revoke execute on function public.task_create(uuid, int, text, date, date, text), public.task_set_done(uuid, uuid, boolean),
  public.task_set_exempt(uuid, uuid, boolean), public.task_archive(uuid[], text), public.checkin_undo(bigint)
  from public, anon;
grant execute on function public.task_create(uuid, int, text, date, date, text), public.task_set_done(uuid, uuid, boolean),
  public.task_set_exempt(uuid, uuid, boolean), public.task_archive(uuid[], text), public.checkin_undo(bigint)
  to authenticated;
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `./scripts/db-test.sh`
Expected: 輸出三段結果，包含 `CHECKIN C1 DB TESTS PASSED` 與 `ALL DB TESTS PASSED`，沒有錯誤。

如果某個 `assert` 失敗，訊息會是中文的那一句；先修 migration，不要改測試的預期。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261024120000_checkin_c1.sql supabase/tests/checkin_c1.sql
git commit -m "feat(checkin): 一般任務的資料表、RPC 與資料庫測試"
```

---

### Task 2: 型別與分頁讀取

**Files:**
- Modify: `src/lib/types.ts`（檔尾）
- Modify: `src/lib/supabase.ts`（檔尾）
- Test: `src/lib/supabase.test.ts`

- [ ] **Step 1: 寫失敗的測試**

在 `src/lib/supabase.test.ts` 把第 2 行改成：

```ts
import { fetchAll, normalizeSupabaseUrl } from "./supabase";
```

並在檔尾加上：

```ts
describe("fetchAll", () => {
  it("分頁讀到不滿一頁為止", async () => {
    const data = [0, 1, 2, 3, 4];
    const calls: [number, number][] = [];
    const rows = await fetchAll<number>((from, to) => {
      calls.push([from, to]);
      return Promise.resolve({ data: data.slice(from, to + 1), error: null });
    }, 2);
    expect(rows).toEqual([0, 1, 2, 3, 4]);
    expect(calls).toEqual([[0, 1], [2, 3], [4, 5]]);
  });
  it("剛好整頁時多讀一次空頁", async () => {
    const rows = await fetchAll<number>((from) => Promise.resolve({ data: from === 0 ? [1, 2] : [], error: null }), 2);
    expect(rows).toEqual([1, 2]);
  });
  it("有錯誤就丟出", async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/lib/supabase.test.ts`
Expected: FAIL，`fetchAll` 不存在（`is not a function`）。

- [ ] **Step 3: 實作 `fetchAll` 與型別**

在 `src/lib/supabase.ts` 檔尾加上：

```ts
/** 分頁讀完全部資料。Supabase 一次最多回 1000 列（max_rows），超過的會被直接截掉、不會報錯；呼叫端要用唯一的欄位排序 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const data = await must(page(from, from + size - 1));
    rows.push(...data);
    if (data.length < size) return rows;
  }
}
```

在 `src/lib/types.ts` 檔尾加上：

```ts
export type CheckinMark = {
  student_id: string; student_no: number; name_zh: string;
  state: "pending" | "done" | "exempt"; done_at: string | null; removed_at: string | null;
};
export type CheckinTask = {
  id: string; class_id: string; slot: number; name: string; task_date: string; due_date: string | null; note: string;
  status: "open" | "archived"; batch_id: string | null; archived_at: string | null; checkin_task_marks: CheckinMark[];
};
export type CheckinBatch = { id: string; class_id: string; kind: "round" | "single"; title: string; archived_at: string };
export type CheckinTaskStat = {
  task_id: string; class_id: string; batch_id: string | null; name: string; slot: number; task_date: string;
  status: "open" | "archived"; total: number; done: number; exempt: number;
};
export type CheckinStudentMark = CheckinMark & {
  task_id: string;
  checkin_tasks: { name: string; slot: number; task_date: string; status: "open" | "archived"; batch_id: string | null };
};
export type CheckinEvent = {
  id: number; action: "done" | "cancel" | "undo" | "exempt" | "unexempt" | "leave" | "unleave" | "teacher_fill";
  actor: "student" | "teacher"; at: string; task_id: string | null;
  next: { state?: string; done_at?: string | null } | null; checkin_tasks: { name: string } | null;
};
export type CheckinSettings = { class_id: string; pin_hash: string | null; pin_salt: string | null };
/** task_set_done、task_set_exempt、checkin_undo 的回傳值；沒有實際寫入時 event_id 是 null */
export type CheckinSetResult = { state: CheckinMark["state"]; done_at: string | null; event_id: number | null };
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run src/lib/supabase.test.ts && npm run typecheck`
Expected: PASS；typecheck 沒有錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts src/lib/supabase.test.ts src/lib/types.ts
git commit -m "feat(checkin): 型別與分頁讀取 fetchAll"
```

---

### Task 3: 台北時間與錯誤訊息

**Files:**
- Create: `src/features/checkin/logic/time.ts`、`src/features/checkin/logic/time.test.ts`
- Create: `src/features/checkin/logic/errors.ts`、`src/features/checkin/logic/errors.test.ts`

- [ ] **Step 1: 寫失敗的測試**

`src/features/checkin/logic/time.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { fmtDateTime, fmtTime, taipeiToday } from "./time";

describe("台北時間", () => {
  it("fmtTime 換算成台北時間", () => expect(fmtTime("2026-10-23T04:25:00Z")).toBe("12:25"));
  it("fmtDateTime 跨日時日期也換算", () => expect(fmtDateTime("2026-10-23T16:05:00Z")).toBe("10/24 00:05"));
  it("taipeiToday 以台北日期為準", () => expect(taipeiToday(new Date("2026-10-23T16:05:00Z"))).toBe("2026-10-24"));
});
```

`src/features/checkin/logic/errors.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { checkinErrorText, isRuleError } from "./errors";

describe("checkinErrorText／isRuleError", () => {
  it("RPC 拒絕的原因轉成中文", () => {
    expect(isRuleError({ message: "checkin_stale" })).toBe(true);
    expect(checkinErrorText({ message: "checkin_stale" })).toBe("狀態已變動，無法復原");
  });
  it("同一格重複建立任務", () => {
    expect(isRuleError({ code: "23505", message: "duplicate key value" })).toBe(true);
    expect(checkinErrorText({ code: "23505", message: "duplicate key value" })).toBe("這一格已經有任務了，請重新整理");
  });
  it("網路錯誤不是規則錯誤", () => {
    expect(isRuleError(new TypeError("Failed to fetch"))).toBe(false);
    expect(checkinErrorText(new TypeError("Failed to fetch"))).toBe("儲存失敗，請再試一次");
  });
  it("物件原型上的名字不算", () => expect(isRuleError({ message: "toString" })).toBe(false));
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/features/checkin`
Expected: FAIL，找不到 `./time`、`./errors`。

- [ ] **Step 3: 實作**

`src/features/checkin/logic/time.ts`：

```ts
// 時間一律以台北時間顯示（設計 §4）；資料庫存的是 timestamptz
const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function parts(d: Date): Record<string, string> {
  return Object.fromEntries(FMT.formatToParts(d).map((p) => [p.type, p.value]));
}

/** 12:25 */
export function fmtTime(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.hour}:${p.minute}`;
}

/** 10/24 00:05 */
export function fmtDateTime(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

/** 今天的台北日期，2026-10-24 */
export function taipeiToday(now = new Date()): string {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}
```

`src/features/checkin/logic/errors.ts`：

```ts
// RPC 用 raise exception 'checkin_xxx' 拒絕的業務規則；同一格重複建立任務是 unique_violation（23505）
const TEXT = new Map([
  ["checkin_stale", "狀態已變動，無法復原"],
  ["checkin_archived", "這項任務已經封存，不能再修改"],
  ["checkin_exempt", "這位同學這一項免交"],
  ["checkin_no_student", "名單已更新，請重新整理"],
  ["checkin_forbidden", "沒有權限，請重新登入"],
  ["checkin_not_undoable", "這個動作不能復原"],
  ["checkin_archive_invalid", "任務狀態已變動，請重新整理後再封存"],
]);

type ErrLike = { message?: unknown; code?: unknown } | null | undefined;

/** 重試也不會成功的錯誤：交給畫面提示，不進 SaveStatus 的重試 */
export function isRuleError(e: unknown): boolean {
  const err = e as ErrLike;
  return err?.code === "23505" || (typeof err?.message === "string" && TEXT.has(err.message));
}

export function checkinErrorText(e: unknown): string {
  const err = e as ErrLike;
  if (err?.code === "23505") return "這一格已經有任務了，請重新整理";
  return (typeof err?.message === "string" && TEXT.get(err.message)) || "儲存失敗，請再試一次";
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run src/features/checkin`
Expected: PASS（7 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/features/checkin/logic/time.ts src/features/checkin/logic/time.test.ts src/features/checkin/logic/errors.ts src/features/checkin/logic/errors.test.ts
git commit -m "feat(checkin): 台北時間格式化與錯誤訊息"
```

---

### Task 4: 統計、缺交整理與歷程文字

**Files:**
- Create: `src/features/checkin/logic/stats.ts`、`src/features/checkin/logic/stats.test.ts`
- Create: `src/features/checkin/logic/events.ts`、`src/features/checkin/logic/events.test.ts`

- [ ] **Step 1: 寫失敗的測試**

`src/features/checkin/logic/stats.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import type { CheckinMark, CheckinTask, Student } from "../../../lib/types";
import { countTask, matchStudent, missingByStudent, visibleMarks, withLiveNames } from "./stats";

const mark = (student_no: number, state: CheckinMark["state"], extra: Partial<CheckinMark> = {}): CheckinMark => ({
  student_id: `s${student_no}`, student_no, name_zh: `學生${student_no}`, state,
  done_at: state === "done" ? "2026-10-23T04:25:00Z" : null, removed_at: null, ...extra,
});
const task = (name: string, marks: CheckinMark[], extra: Partial<CheckinTask> = {}): CheckinTask => ({
  id: name, class_id: "c1", slot: 1, name, task_date: "2026-10-23", due_date: null, note: "",
  status: "open", batch_id: null, archived_at: null, checkin_task_marks: marks, ...extra,
});
const REMOVED = "2026-10-23T05:00:00Z";

describe("countTask", () => {
  it("應完成數不含免交與轉出", () => {
    expect(countTask([mark(1, "done"), mark(2, "pending"), mark(3, "exempt"), mark(4, "done", { removed_at: REMOVED })]))
      .toEqual({ done: 1, total: 2, exempt: 1 });
  });
  it("沒有學生時都是 0", () => expect(countTask([])).toEqual({ done: 0, total: 0, exempt: 0 }));
});

describe("visibleMarks", () => {
  it("隱藏轉出的學生並依座號排序，不改動原本的陣列", () => {
    const t = task("t", [mark(3, "pending"), mark(1, "done"), mark(2, "pending", { removed_at: REMOVED })]);
    expect(visibleMarks(t).map((m) => m.student_no)).toEqual([1, 3]);
    expect(t.checkin_task_marks.map((m) => m.student_no)).toEqual([3, 1, 2]);
  });
});

describe("withLiveNames", () => {
  const students: Student[] = [{ id: "s1", class_id: "c1", student_no: 7, name_zh: "新名字", name_en: null, left_at: null }];
  it("進行中的任務用目前名單的座號與姓名", () => {
    const m = withLiveNames(task("t", [mark(1, "done")]), students).checkin_task_marks[0];
    expect([m.student_no, m.name_zh]).toEqual([7, "新名字"]);
  });
  it("封存的任務維持封存當下的快照", () => {
    const m = withLiveNames(task("t", [mark(1, "done")], { status: "archived" }), students).checkin_task_marks[0];
    expect([m.student_no, m.name_zh]).toEqual([1, "學生1"]);
  });
});

describe("missingByStudent", () => {
  it("有一項未完成就列出一次；免交與轉出不算缺交；依座號排序", () => {
    const rows = missingByStudent([
      task("閱讀", [mark(2, "pending"), mark(1, "pending"), mark(3, "exempt")]),
      task("聯絡單", [mark(2, "pending"), mark(1, "done"), mark(4, "pending", { removed_at: REMOVED })]),
    ]);
    expect(rows.map((r) => [r.student_no, r.tasks.map((t) => t.name)])).toEqual([[1, ["閱讀"]], [2, ["閱讀", "聯絡單"]]]);
  });
});

describe("matchStudent", () => {
  it("空字串全部符合", () => expect(matchStudent(" ", 3, "王小明")).toBe(true));
  it("數字比對座號（完全相同）", () => {
    expect(matchStudent("3", 3, "王小明")).toBe(true);
    expect(matchStudent("3", 13, "王小明")).toBe(false);
  });
  it("文字比對姓名", () => {
    expect(matchStudent("小明", 3, "王小明")).toBe(true);
    expect(matchStudent("小華", 3, "王小明")).toBe(false);
  });
});
```

`src/features/checkin/logic/events.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { eventText } from "./events";

const task = { name: "閱讀認證" };

describe("eventText", () => {
  it("打卡與取消", () => {
    expect(eventText({ action: "done", next: { state: "done" }, checkin_tasks: task })).toBe("完成打卡・閱讀認證");
    expect(eventText({ action: "cancel", next: { state: "pending" }, checkin_tasks: task })).toBe("取消打卡・閱讀認證");
  });
  it("復原寫出回到哪個狀態", () => {
    expect(eventText({ action: "undo", next: { state: "done" }, checkin_tasks: task })).toBe("復原（回到已完成）・閱讀認證");
    expect(eventText({ action: "undo", next: { state: "pending" }, checkin_tasks: task })).toBe("復原（回到未完成）・閱讀認證");
  });
  it("免交", () => expect(eventText({ action: "exempt", next: { state: "exempt" }, checkin_tasks: task })).toBe("標為免交・閱讀認證"));
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/features/checkin/logic/stats.test.ts src/features/checkin/logic/events.test.ts`
Expected: FAIL，找不到 `./stats`、`./events`。

- [ ] **Step 3: 實作**

`src/features/checkin/logic/stats.ts`：

```ts
import type { CheckinMark, CheckinTask, Student } from "../../../lib/types";

export type TaskCount = { done: number; total: number; exempt: number };

/** 一般任務的完成數：應完成數不含免交與轉出（設計 §8）。資料庫的 checkin_task_stats 用同一個規則 */
export function countTask(marks: CheckinMark[]): TaskCount {
  let done = 0, total = 0, exempt = 0;
  for (const m of marks) {
    if (m.removed_at) continue;
    if (m.state === "exempt") exempt++;
    else {
      total++;
      if (m.state === "done") done++;
    }
  }
  return { done, total, exempt };
}

/** 卡片上要顯示的名字：轉出的不顯示，依座號排序 */
export function visibleMarks(task: CheckinTask): CheckinMark[] {
  return task.checkin_task_marks.filter((m) => !m.removed_at).sort((a, b) => a.student_no - b.student_no);
}

/** 進行中的任務以目前名單的座號姓名顯示；封存的任務維持封存當下的快照（設計 §5.2） */
export function withLiveNames(task: CheckinTask, students: Student[]): CheckinTask {
  if (task.status !== "open") return task;
  const byId = new Map(students.map((s) => [s.id, s]));
  return {
    ...task,
    checkin_task_marks: task.checkin_task_marks.map((m) => {
      const s = byId.get(m.student_id);
      return s ? { ...m, student_no: s.student_no, name_zh: s.name_zh } : m;
    }),
  };
}

export type MissingRow = { student_id: string; student_no: number; name_zh: string; tasks: CheckinTask[] };

/** 缺交總覽：只要有一項未完成就列出一次；免交、轉出不算缺交 */
export function missingByStudent(tasks: CheckinTask[]): MissingRow[] {
  const rows = new Map<string, MissingRow>();
  for (const t of tasks) {
    for (const m of t.checkin_task_marks) {
      if (m.removed_at || m.state !== "pending") continue;
      const row = rows.get(m.student_id) ?? { student_id: m.student_id, student_no: m.student_no, name_zh: m.name_zh, tasks: [] };
      row.tasks.push(t);
      rows.set(m.student_id, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.student_no - b.student_no);
}

/** 搜尋：輸入數字就比對座號，否則比對姓名 */
export function matchStudent(query: string, no: number, name: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return /^\d+$/.test(q) ? Number(q) === no : name.includes(q);
}
```

`src/features/checkin/logic/events.ts`：

```ts
import type { CheckinEvent } from "../../../lib/types";

const ACTION_TEXT: Record<Exclude<CheckinEvent["action"], "undo">, string> = {
  done: "完成打卡", cancel: "取消打卡", exempt: "標為免交", unexempt: "取消免交",
  leave: "標為請假", unleave: "取消請假", teacher_fill: "老師補登",
};

/** 學生歷程的一行：「完成打卡・閱讀認證」 */
export function eventText(e: Pick<CheckinEvent, "action" | "next" | "checkin_tasks">): string {
  const what = e.action === "undo" ? `復原（回到${e.next?.state === "done" ? "已完成" : "未完成"}）` : ACTION_TEXT[e.action];
  return [what, e.checkin_tasks?.name].filter(Boolean).join("・");
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run src/features/checkin`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/features/checkin/logic/stats.ts src/features/checkin/logic/stats.test.ts src/features/checkin/logic/events.ts src/features/checkin/logic/events.test.ts
git commit -m "feat(checkin): 完成數、缺交整理、歷程文字"
```

---

### Task 5: 連點保護與 PIN

**Files:**
- Create: `src/features/checkin/logic/tapGuard.ts`、`src/features/checkin/logic/tapGuard.test.ts`
- Create: `src/features/checkin/logic/pin.ts`、`src/features/checkin/logic/pin.test.ts`

- [ ] **Step 1: 寫失敗的測試**

`src/features/checkin/logic/tapGuard.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { createTapGuard } from "./tapGuard";

describe("createTapGuard", () => {
  it("同一顆按鈕 600ms 內的第二次點擊忽略", () => {
    const g = createTapGuard();
    expect(g("a", 1000)).toBe(true);
    expect(g("a", 1300)).toBe(false);
    expect(g("a", 1600)).toBe(true);
  });
  it("被忽略的點擊不延長等待時間", () => {
    const g = createTapGuard();
    g("a", 0);
    g("a", 500);
    expect(g("a", 600)).toBe(true);
  });
  it("不同按鈕互不影響", () => {
    const g = createTapGuard();
    expect(g("a", 0)).toBe(true);
    expect(g("b", 10)).toBe(true);
  });
});
```

`src/features/checkin/logic/pin.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { hashPin, isValidPin, newSalt, verifyPin } from "./pin";

describe("PIN", () => {
  it("hashPin 是「salt:pin」的 SHA-256", async () => {
    expect(await hashPin("1234", "abc")).toBe("1755a2d5b309d75bede226f2b6cf858bb14287b917e76ad3b943de0dda4683fb");
  });
  it("verifyPin 比對正確與錯誤的 PIN；沒設定時一律失敗", async () => {
    const salt = newSalt();
    const hash = await hashPin("0420", salt);
    expect(await verifyPin("0420", salt, hash)).toBe(true);
    expect(await verifyPin("0421", salt, hash)).toBe(false);
    expect(await verifyPin("0420", null, null)).toBe(false);
  });
  it("newSalt 每次不同", () => expect(newSalt()).not.toBe(newSalt()));
  it("isValidPin 只接受 4 位數字", () => {
    expect(isValidPin("0420")).toBe(true);
    expect(isValidPin("042")).toBe(false);
    expect(isValidPin("04a0")).toBe(false);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run src/features/checkin/logic/tapGuard.test.ts src/features/checkin/logic/pin.test.ts`
Expected: FAIL，找不到 `./tapGuard`、`./pin`。

- [ ] **Step 3: 實作**

`src/features/checkin/logic/tapGuard.ts`：

```ts
/** 白板可能把一次觸控送成兩次點擊：同一顆按鈕 600ms 內的第二次點擊忽略（設計 §3.3） */
export function createTapGuard(windowMs = 600) {
  const last = new Map<string, number>();
  return (key: string, now: number = Date.now()): boolean => {
    const prev = last.get(key);
    if (prev !== undefined && now - prev < windowMs) return false;
    last.set(key, now);
    return true;
  };
}
```

`src/features/checkin/logic/pin.ts`：

```ts
// PIN 只是防止學生在白板上誤按老師的功能，不是資安措施，所以在前端比對（設計 §3.2）
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);

export function newSalt(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`)));
}

export async function verifyPin(pin: string, salt: string | null, hash: string | null): Promise<boolean> {
  return !!salt && !!hash && (await hashPin(pin, salt)) === hash;
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run src/features/checkin`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/features/checkin/logic/tapGuard.ts src/features/checkin/logic/tapGuard.test.ts src/features/checkin/logic/pin.ts src/features/checkin/logic/pin.test.ts
git commit -m "feat(checkin): 連點保護與 PIN 雜湊"
```

---

### Task 6: 讀寫（api.ts）

**Files:**
- Create: `src/features/checkin/api.ts`

這一層是對 Supabase 的薄包裝，沒有單元測試；Task 14 用瀏覽器實測。

- [ ] **Step 1: 建立 `src/features/checkin/api.ts`**

```ts
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchAll, must, supabase } from "../../lib/supabase";
import type {
  CheckinBatch, CheckinEvent, CheckinMark, CheckinSetResult, CheckinSettings, CheckinStudentMark, CheckinTask, CheckinTaskStat,
} from "../../lib/types";
import { checkinErrorText, isRuleError } from "./logic/errors";

const TASK_COLS = "id,class_id,slot,name,task_date,due_date,note,status,batch_id,archived_at,"
  + "checkin_task_marks(student_id,student_no,name_zh,state,done_at,removed_at)";

export const checkinKeys = {
  all: ["checkin"],
  open: (classId: string) => ["checkin", "open", classId],
  batch: (batchId: string) => ["checkin", "batch", batchId],
  batches: (classId: string) => ["checkin", "batches", classId],
  stats: (classId: string) => ["checkin", "stats", classId],
  studentMarks: (studentId: string) => ["checkin", "student-marks", studentId],
  studentEvents: (studentId: string) => ["checkin", "student-events", studentId],
  settings: (classId: string) => ["checkin", "settings", classId],
};

export type Rejected = { rejected: string };
export const isRejected = (x: unknown): x is Rejected => typeof x === "object" && x !== null && "rejected" in x;

/** 業務規則的拒絕（已封存、狀態已變動…）重試也沒用：回傳 rejected 交給畫面提示，不進 SaveStatus 的重試；網路錯誤才丟出去 */
async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T | Rejected> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (isRuleError(error)) return { rejected: checkinErrorText(error) };
    throw error;
  }
  return data as T;
}

// ───────────── 讀取 ─────────────

/** 進行中的任務（依格子）。打卡台每 60 秒重新讀取，讓老師手機上的改動也出現在白板上；回到前景時 TanStack 會自動重新讀取（設計 §7.4） */
export function useOpenTasks(classId: string, live = false) {
  return useQuery({
    queryKey: checkinKeys.open(classId),
    refetchInterval: live ? 60_000 : false,
    queryFn: () => must(supabase.from("checkin_tasks").select(TASK_COLS)
      .eq("class_id", classId).eq("status", "open").order("slot").returns<CheckinTask[]>()),
  });
}

/** 某一次封存的任務（最多 4 項） */
export function useBatchTasks(batchId: string | null) {
  return useQuery({
    queryKey: checkinKeys.batch(batchId ?? ""),
    enabled: !!batchId,
    queryFn: () => must(supabase.from("checkin_tasks").select(TASK_COLS)
      .eq("batch_id", batchId!).order("slot").returns<CheckinTask[]>()),
  });
}

export function useBatches(classId: string) {
  return useQuery({
    queryKey: checkinKeys.batches(classId),
    queryFn: () => fetchAll<CheckinBatch>((from, to) => supabase.from("checkin_batches")
      .select("id,class_id,kind,title,archived_at")
      .eq("class_id", classId).order("archived_at", { ascending: false }).order("id").range(from, to)),
  });
}

/** 已封存任務的統計（封存紀錄頁） */
export function useArchivedStats(classId: string) {
  return useQuery({
    queryKey: checkinKeys.stats(classId),
    queryFn: () => fetchAll<CheckinTaskStat>((from, to) => supabase.from("checkin_task_stats").select("*")
      .eq("class_id", classId).eq("status", "archived").order("task_date").order("task_id").range(from, to)),
  });
}

export function useStudentMarks(studentId: string) {
  return useQuery({
    queryKey: checkinKeys.studentMarks(studentId),
    enabled: !!studentId,
    queryFn: () => fetchAll<CheckinStudentMark>((from, to) => supabase.from("checkin_task_marks")
      .select("task_id,student_id,student_no,name_zh,state,done_at,removed_at,checkin_tasks(name,slot,task_date,status,batch_id)")
      .eq("student_id", studentId).order("task_id").range(from, to)),
  });
}

/** 學生的完整操作歷程，新到舊（設計 §7.3） */
export function useStudentEvents(studentId: string) {
  return useQuery({
    queryKey: checkinKeys.studentEvents(studentId),
    enabled: !!studentId,
    queryFn: () => fetchAll<CheckinEvent>((from, to) => supabase.from("checkin_events")
      .select("id,action,actor,at,task_id,next,checkin_tasks(name)")
      .eq("student_id", studentId).eq("series", "task").order("id", { ascending: false }).range(from, to)),
  });
}

export function useCheckinSettings(classId: string) {
  return useQuery({
    queryKey: checkinKeys.settings(classId),
    queryFn: async (): Promise<CheckinSettings | null> => {
      const { data, error } = await supabase.from("checkin_settings").select("class_id,pin_hash,pin_salt").eq("class_id", classId).maybeSingle();
      if (error) throw error;
      return data as CheckinSettings | null;
    },
  });
}

// ───────────── 寫入 ─────────────

type MarkVars = { taskId: string; studentId: string };

function findMark(qc: QueryClient, classId: string, v: MarkVars): CheckinMark | undefined {
  return qc.getQueryData<CheckinTask[]>(checkinKeys.open(classId))
    ?.find((t) => t.id === v.taskId)?.checkin_task_marks.find((m) => m.student_id === v.studentId);
}

/** 只改快取裡的一格，不整份重讀，避免連續點名時畫面跳動 */
function patchMark(qc: QueryClient, classId: string, v: MarkVars, patch: Partial<CheckinMark>) {
  qc.setQueryData<CheckinTask[]>(checkinKeys.open(classId), (list) => list?.map((t) => t.id !== v.taskId ? t : {
    ...t,
    checkin_task_marks: t.checkin_task_marks.map((m) => (m.student_id === v.studentId ? { ...m, ...patch } : m)),
  }));
}

/** 打卡或取消：送的是「設為完成／設為未完成」，重送也不會變成相反的結果（設計 §3.3）。樂觀更新，失敗時還原這一格 */
export function useSetDone(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: MarkVars & { done: boolean }) =>
      callRpc<CheckinSetResult>("task_set_done", { p_task_id: v.taskId, p_student_id: v.studentId, p_done: v.done }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: checkinKeys.open(classId) });
      const prev = findMark(qc, classId, v);
      patchMark(qc, classId, v, { state: v.done ? "done" : "pending", done_at: v.done ? new Date().toISOString() : null });
      return { prev: prev && { state: prev.state, done_at: prev.done_at } };
    },
    onSuccess: (r, v, ctx) => {
      if (isRejected(r)) {
        if (ctx?.prev) patchMark(qc, classId, v, ctx.prev);
        qc.invalidateQueries({ queryKey: checkinKeys.open(classId) });
      } else {
        patchMark(qc, classId, v, { state: r.state, done_at: r.done_at });
      }
    },
    onError: (_e, v, ctx) => { if (ctx?.prev) patchMark(qc, classId, v, ctx.prev); },
  });
}

export function useSetExempt(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: MarkVars & { exempt: boolean }) =>
      callRpc<CheckinSetResult>("task_set_exempt", { p_task_id: v.taskId, p_student_id: v.studentId, p_exempt: v.exempt }),
    onSuccess: (r, v) => {
      if (isRejected(r)) qc.invalidateQueries({ queryKey: checkinKeys.open(classId) });
      else patchMark(qc, classId, v, { state: r.state, done_at: r.done_at });
    },
  });
}

/** 復原這台裝置最近一次的打卡或取消（設計 §6.3）。狀態已被改掉時伺服器會拒絕，不自動重試 */
export function useUndo(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (v: MarkVars & { eventId: number }) => callRpc<CheckinSetResult>("checkin_undo", { p_event_id: v.eventId }),
    onSuccess: (r, v) => {
      if (isRejected(r)) qc.invalidateQueries({ queryKey: checkinKeys.open(classId) });
      else patchMark(qc, classId, v, { state: r.state, done_at: r.done_at });
    },
  });
}

export function useCreateTask(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { slot: number; name: string; taskDate: string; dueDate: string | null; note: string }) =>
      callRpc<string>("task_create", {
        p_class_id: classId, p_slot: v.slot, p_name: v.name, p_task_date: v.taskDate, p_due_date: v.dueDate, p_note: v.note,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: checkinKeys.open(classId) }),
  });
}

export function useUpdateTask(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: Pick<CheckinTask, "name" | "task_date" | "due_date" | "note"> }) =>
      must(supabase.from("checkin_tasks").update(v.patch).eq("id", v.id)),
    onSettled: () => qc.invalidateQueries({ queryKey: checkinKeys.open(classId) }),
  });
}

export function useArchiveTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { taskIds: string[]; kind: "round" | "single" }) =>
      callRpc<string>("task_archive", { p_task_ids: v.taskIds, p_kind: v.kind }),
    // 不 return：讓呼叫端的 onSuccess 不必等所有查詢重讀完
    onSettled: () => { qc.invalidateQueries({ queryKey: checkinKeys.all }); },
  });
}

export function useSavePin(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { pin_hash: string; pin_salt: string }) =>
      must(supabase.from("checkin_settings").upsert({ class_id: classId, ...v }, { onConflict: "class_id" })),
    onSettled: () => qc.invalidateQueries({ queryKey: checkinKeys.settings(classId) }),
  });
}
```

- [ ] **Step 2: 型別檢查**

Run: `npm run typecheck`
Expected: 沒有錯誤。

- [ ] **Step 3: Commit**

```bash
git add src/features/checkin/api.ts
git commit -m "feat(checkin): 任務打卡的查詢與寫入"
```

---

### Task 7: 教室模式、對話框、數字鍵盤

**Files:**
- Create: `src/features/checkin/classroom.tsx`
- Create: `src/shared/Dialog.tsx`
- Create: `src/features/checkin/PinPad.tsx`

- [ ] **Step 1: 建立 `src/features/checkin/classroom.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

// 教室模式（設計 §3.2）：這台 iPad 記住狀態；解鎖只在記憶體裡，重新整理就回到上鎖
const MODE_KEY = "mumu.classroom";
const IDLE_MS = 2 * 60_000;

type Classroom = {
  classroom: boolean; unlocked: boolean;
  /** 老師的功能能不能用：不在教室模式，或已用 PIN 解鎖 */
  canTeach: boolean;
  enter: () => void; exit: () => void; unlock: () => void; lock: () => void;
};

const Ctx = createContext<Classroom | null>(null);

function readMode(): boolean {
  try { return localStorage.getItem(MODE_KEY) === "on"; } catch { return false; }
}

function writeMode(on: boolean) {
  try {
    if (on) localStorage.setItem(MODE_KEY, "on");
    else localStorage.removeItem(MODE_KEY);
  } catch { /* 無痕模式等情況寫不進去：只影響重新整理後是否維持教室模式 */ }
}

export function ClassroomProvider({ children }: { children: ReactNode }) {
  const [classroom, setClassroom] = useState(readMode);
  const [unlocked, setUnlocked] = useState(false);

  // 解鎖後 2 分鐘沒有操作就自動上鎖；任何點擊或按鍵都重新計時
  useEffect(() => {
    if (!classroom || !unlocked) return;
    let timer = window.setTimeout(() => setUnlocked(false), IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setUnlocked(false), IDLE_MS);
    };
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [classroom, unlocked]);

  const value: Classroom = {
    classroom, unlocked, canTeach: !classroom || unlocked,
    enter: () => { writeMode(true); setClassroom(true); setUnlocked(false); },
    exit: () => { writeMode(false); setClassroom(false); setUnlocked(false); },
    unlock: () => setUnlocked(true),
    lock: () => setUnlocked(false),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClassroom(): Classroom {
  const v = useContext(Ctx);
  if (!v) throw new Error("useClassroom must be inside ClassroomProvider");
  return v;
}

/** 教室模式下只能停在任務打卡的頁面，其他路由一律導回 /checkin（AC41） */
export function ClassroomGuard({ children }: { children: ReactNode }) {
  const { classroom } = useClassroom();
  const { pathname } = useLocation();
  if (classroom && !pathname.startsWith("/checkin")) return <Navigate to="/checkin" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 2: 建立 `src/shared/Dialog.tsx`**

```tsx
import type { ReactNode } from "react";

export function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`card max-h-[90dvh] w-full overflow-auto p-5 ${wide ? "max-w-2xl" : "max-w-sm"}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-black">{title}</h2>
          <button type="button" className="btn px-2 py-1" aria-label="關閉" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 建立 `src/features/checkin/PinPad.tsx`**

```tsx
import { useState } from "react";
import { Dialog } from "../../shared/Dialog";
import { verifyPin } from "./logic/pin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "清除", "0", "⌫"];

/** 畫面上的大數字鍵盤，不叫出系統鍵盤（設計 §3.2）。輸入滿 4 位自動比對 */
export function PinPad({ salt, hash, onSuccess, onCancel }: {
  salt: string | null; hash: string | null; onSuccess: () => void; onCancel: () => void;
}) {
  const [digits, setDigits] = useState("");
  const [wrong, setWrong] = useState(false);

  async function press(k: string) {
    setWrong(false);
    if (k === "清除") { setDigits(""); return; }
    if (k === "⌫") { setDigits((d) => d.slice(0, -1)); return; }
    const next = (digits + k).slice(0, 4);
    setDigits(next);
    if (next.length < 4) return;
    if (await verifyPin(next, salt, hash)) onSuccess();
    else { setWrong(true); setDigits(""); }
  }

  return (
    <Dialog title="輸入老師 PIN" onClose={onCancel}>
      <div className="mb-3 flex justify-center gap-3" aria-label={`已輸入 ${digits.length} 位`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-4 w-4 rounded-full border-2 border-sage ${i < digits.length ? "bg-sage" : ""}`} />
        ))}
      </div>
      <p className={`mb-3 text-center text-sm font-bold ${wrong ? "text-rose-ink" : "text-muted"}`}>
        {wrong ? "PIN 不正確，請再試一次" : "解鎖後 2 分鐘沒有操作會自動上鎖"}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button key={k} type="button" className="btn h-16 touch-manipulation text-2xl" onClick={() => press(k)}>{k}</button>
        ))}
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: 型別檢查**

Run: `npm run typecheck`
Expected: 沒有錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/features/checkin/classroom.tsx src/shared/Dialog.tsx src/features/checkin/PinPad.tsx
git commit -m "feat(checkin): 教室模式狀態、對話框與 PIN 數字鍵盤"
```

---

### Task 8: 任務卡、任務編輯、打卡台

**Files:**
- Create: `src/features/checkin/TaskCard.tsx`
- Create: `src/features/checkin/TaskEditor.tsx`
- Create: `src/features/checkin/CheckinBoard.tsx`

版面目標（設計 §7.2）：iPad 橫向 1180×796，教室模式下 2×2 張卡片不捲動。估算：標題列 56＋工具列 40＋卡片 2×320（內距 24＋標題兩行 46＋進度 6＋名字 5 列×44＋4×6 間距）＋間距 ≈ 750pt。

- [ ] **Step 1: 建立 `src/features/checkin/TaskCard.tsx`**

```tsx
import { Link } from "react-router-dom";
import type { CheckinMark, CheckinTask } from "../../lib/types";
import { countTask, visibleMarks } from "./logic/stats";

const pad2 = (n: number) => String(n).padStart(2, "0");
const md = (date: string) => date.slice(5).replace("-", "/");

/** 一格任務：打卡台與封存紀錄共用。沒有傳 onTap 就是唯讀 */
export function TaskCard({ slot, task, onTap, onEdit, onAdd }: {
  slot: number;
  task?: CheckinTask;
  onTap?: (task: CheckinTask, mark: CheckinMark) => void;
  onEdit?: () => void;
  onAdd?: () => void;
}) {
  if (!task) {
    return (
      <section className="card flex min-h-40 flex-col items-center justify-center gap-3 p-3 text-muted">
        <span className="font-bold">{pad2(slot)}・尚未設定</span>
        {onAdd && <button type="button" className="btn-soft" onClick={onAdd}>＋ 新增任務</button>}
      </section>
    );
  }
  const marks = visibleMarks(task);
  const { done, total } = countTask(task.checkin_task_marks);
  const left = total - done;
  const missingLink = task.status === "open"
    ? `/checkin/missing?task=${task.id}`
    : `/checkin/missing?batch=${task.batch_id}&task=${task.id}`;
  return (
    <section className="card p-3" aria-label={task.name}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted tabular-nums">{pad2(slot)}</span>
        <h2 className="min-w-0 flex-1 truncate text-xl font-black">{task.name}</h2>
        <span className="shrink-0 font-bold tabular-nums">{done} / {total} 完成</span>
        {onEdit && <button type="button" className="btn px-2 py-1 text-sm" onClick={onEdit}>編輯</button>}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">
          {[task.task_date, task.due_date && `截止 ${md(task.due_date)}`, task.note].filter(Boolean).join("・")}
        </span>
        {left > 0 && <Link className="shrink-0 font-bold text-rose-ink" to={missingLink}>未完成 {left} 人 →</Link>}
      </div>
      <div className="my-2 h-1 rounded bg-line">
        <div className="h-1 rounded bg-sage" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {marks.map((m) => <NameButton key={m.student_id} mark={m} onTap={onTap && (() => onTap(task, m))} />)}
      </div>
    </section>
  );
}

/** 姓名按鈕：高 44pt、單點（設計 §3.3）。顏色之外一定有文字或符號 */
function NameButton({ mark, onTap }: { mark: CheckinMark; onTap?: () => void }) {
  const look = mark.state === "done" ? "border-sage-soft bg-sage-soft text-sage"
    : mark.state === "exempt" ? "border-line bg-paper text-muted" : "border-line bg-sheet";
  return (
    <button type="button" disabled={!onTap || mark.state === "exempt"} onClick={onTap} aria-pressed={mark.state === "done"}
      className={`flex h-11 min-w-0 touch-manipulation items-center gap-1 rounded-lg border px-1.5 text-sm font-bold disabled:cursor-default ${look}`}>
      <span className="text-xs opacity-70 tabular-nums">{pad2(mark.student_no)}</span>
      <span className="min-w-0 flex-1 truncate text-left">{mark.name_zh}</span>
      {mark.state === "done" && <span aria-label="已完成">✓</span>}
      {mark.state === "exempt" && <span>免</span>}
    </button>
  );
}
```

- [ ] **Step 2: 建立 `src/features/checkin/TaskEditor.tsx`**

```tsx
import { useState } from "react";
import { useClassData } from "../../lib/classData";
import type { CheckinTask } from "../../lib/types";
import { Dialog } from "../../shared/Dialog";
import { useToast } from "../../shared/Toast";
import { isRejected, useArchiveTasks, useCreateTask, useSetExempt, useUpdateTask } from "./api";
import { visibleMarks } from "./logic/stats";
import { taipeiToday } from "./logic/time";

/** 新增或編輯一格任務、標免交、單項封存（設計 §7.3、第 24 題）。只有老師能開 */
export function TaskEditor({ slot, task, onClose }: { slot: number; task?: CheckinTask; onClose: () => void }) {
  const { cls } = useClassData();
  const toast = useToast();
  const create = useCreateTask(cls.id);
  const update = useUpdateTask(cls.id);
  const setExempt = useSetExempt(cls.id);
  const archive = useArchiveTasks();
  const [name, setName] = useState(task?.name ?? "");
  const [taskDate, setTaskDate] = useState(task?.task_date ?? taipeiToday());
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [confirmArchive, setConfirmArchive] = useState(false);

  function save() {
    const fields = { name: name.trim(), task_date: taskDate, due_date: dueDate || null, note: note.trim() };
    if (!fields.name) { toast("請輸入任務名稱"); return; }
    if (!task) {
      create.mutate({ slot, name: fields.name, taskDate: fields.task_date, dueDate: fields.due_date, note: fields.note }, {
        onSuccess: (r) => { if (isRejected(r)) toast(r.rejected); else onClose(); },
      });
    } else {
      update.mutate({ id: task.id, patch: fields }, { onSuccess: onClose });
    }
  }

  function archiveOne() {
    if (!task) return;
    archive.mutate({ taskIds: [task.id], kind: "single" }, {
      onSuccess: (r) => {
        if (isRejected(r)) { toast(r.rejected); return; }
        toast(`已封存「${task.name}」，可在「封存紀錄」查看`);
        onClose();
      },
    });
  }

  return (
    <Dialog title={task ? `編輯任務 ${slot}` : `新增任務 ${slot}`} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="task-name">任務名稱</label>
          <input id="task-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：閱讀認證" />
        </div>
        <div>
          <label className="label" htmlFor="task-date">日期</label>
          <input id="task-date" type="date" className="input" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="task-due">截止日（選填，只顯示）</label>
          <input id="task-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="task-note">說明（選填）</label>
          <input id="task-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <button type="button" className="btn-primary mt-3 w-full py-3" disabled={create.isPending || update.isPending} onClick={save}>
        {task ? "儲存" : "建立任務"}
      </button>

      {task && (
        <>
          <h3 className="mt-5 font-black">免交</h3>
          <p className="mb-2 text-sm text-muted">點名字切換。免交的同學不算進應完成數，也不會出現在缺交總覽。</p>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {visibleMarks(task).map((m) => (
              <button key={m.student_id} type="button" aria-pressed={m.state === "exempt"}
                className={m.state === "exempt" ? "chip-on" : "chip"}
                onClick={() => setExempt.mutate(
                  { taskId: task.id, studentId: m.student_id, exempt: m.state !== "exempt" },
                  { onSuccess: (r) => { if (isRejected(r)) toast(r.rejected); } },
                )}>
                {m.student_no} {m.name_zh}{m.state === "exempt" ? "・免" : ""}
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            {confirmArchive ? (
              <div className="space-y-2">
                <p className="text-sm">封存「{task.name}」後不能再修改，這一格會清空；紀錄可以在「封存紀錄」查看。</p>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn" onClick={() => setConfirmArchive(false)}>取消</button>
                  <button type="button" className="btn-primary" disabled={archive.isPending} onClick={archiveOne}>確定封存這一項</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn w-full" onClick={() => setConfirmArchive(true)}>封存這一項</button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
```

- [ ] **Step 3: 建立 `src/features/checkin/CheckinBoard.tsx`**

```tsx
import { useState } from "react";
import { useClassData } from "../../lib/classData";
import type { CheckinMark, CheckinTask } from "../../lib/types";
import { Dialog } from "../../shared/Dialog";
import { useToast } from "../../shared/Toast";
import { ErrorBox, Loading } from "../../shared/ui";
import { isRejected, useArchiveTasks, useOpenTasks, useSetDone, useUndo } from "./api";
import { useClassroom } from "./classroom";
import { withLiveNames } from "./logic/stats";
import { createTapGuard } from "./logic/tapGuard";
import { TaskCard } from "./TaskCard";
import { TaskEditor } from "./TaskEditor";

const SLOTS = [1, 2, 3, 4];
type LastAction = { eventId: number; taskId: string; studentId: string; label: string };

/** 一般任務打卡台（M01）：最多 4 項任務，點名字打卡，再點一次取消 */
export function CheckinBoard() {
  const { cls, allStudents } = useClassData();
  const q = useOpenTasks(cls.id, true);
  const setDone = useSetDone(cls.id);
  const undo = useUndo(cls.id);
  const archive = useArchiveTasks();
  const { canTeach } = useClassroom();
  const toast = useToast();
  const [guard] = useState(() => createTapGuard());
  // 復原只針對這台裝置最近一次的打卡或取消，下一次操作後就換掉（設計 §6.3）
  const [last, setLast] = useState<LastAction | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [confirmRound, setConfirmRound] = useState(false);

  if (q.error) return <ErrorBox error={q.error} />;
  if (q.isLoading) return <Loading />;
  const tasks = (q.data ?? []).map((t) => withLiveNames(t, allStudents));
  const bySlot = new Map(tasks.map((t) => [t.slot, t]));

  function tap(task: CheckinTask, mark: CheckinMark) {
    if (!guard(`${task.id}:${mark.student_id}`)) return;
    setDone.mutate({ taskId: task.id, studentId: mark.student_id, done: mark.state !== "done" }, {
      onSuccess: (r) => {
        if (isRejected(r)) toast(r.rejected);
        else if (r.event_id) setLast({ eventId: r.event_id, taskId: task.id, studentId: mark.student_id, label: `${mark.name_zh} ${task.name}` });
      },
    });
  }

  function runUndo() {
    if (!last || !guard("undo")) return;
    undo.mutate(last, {
      onSuccess: (r) => {
        if (isRejected(r)) toast(r.rejected);
        setLast(null);
      },
    });
  }

  function archiveRound() {
    archive.mutate({ taskIds: tasks.map((t) => t.id), kind: "round" }, {
      onSuccess: (r) => {
        if (isRejected(r)) toast(r.rejected);
        else { toast("已封存本輪紀錄，可在「封存紀錄」查看"); setLast(null); }
        setConfirmRound(false);
      },
    });
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={!last || undo.isPending} onClick={runUndo}>
          ↶ {last ? `復原：${last.label}` : "復原上一步"}
        </button>
        <span className="text-xs text-muted">綠色 ✓ 已完成・白色 未完成・灰色「免」免交・點名字打卡，再點一次取消</span>
        {canTeach && tasks.length > 0 && (
          <button type="button" className="btn-primary ml-auto" onClick={() => setConfirmRound(true)}>封存本輪紀錄</button>
        )}
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {SLOTS.map((slot) => (
          <TaskCard key={slot} slot={slot} task={bySlot.get(slot)} onTap={tap}
            onEdit={canTeach ? () => setEditing(slot) : undefined}
            onAdd={canTeach ? () => setEditing(slot) : undefined} />
        ))}
      </div>

      {/* 教室模式自動上鎖時，老師的對話框也一起關掉 */}
      {canTeach && editing !== null && (
        <TaskEditor key={editing} slot={editing} task={bySlot.get(editing)} onClose={() => setEditing(null)} />
      )}
      {canTeach && confirmRound && (
        <Dialog title="封存本輪紀錄" onClose={() => setConfirmRound(false)}>
          <p>要封存這 {tasks.length} 項任務嗎？</p>
          <p className="mt-1 font-bold">{tasks.map((t) => t.name).join("、")}</p>
          <p className="mt-2 text-sm text-muted">封存後不能再修改，打卡台會清空；紀錄可以在「封存紀錄」查看。</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setConfirmRound(false)}>取消</button>
            <button type="button" className="btn-primary" disabled={archive.isPending} onClick={archiveRound}>確定封存</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
```

- [ ] **Step 4: 型別檢查**

Run: `npm run typecheck`
Expected: 沒有錯誤（頁面還沒接上路由，Task 9 處理）。

- [ ] **Step 5: Commit**

```bash
git add src/features/checkin/TaskCard.tsx src/features/checkin/TaskEditor.tsx src/features/checkin/CheckinBoard.tsx
git commit -m "feat(checkin): 打卡台、任務卡與任務編輯"
```

---

### Task 9: 外框與路由（一般模式＋教室模式）

**Files:**
- Create: `src/features/checkin/CheckinShell.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/Layout.tsx`

- [ ] **Step 1: 建立 `src/features/checkin/CheckinShell.tsx`**

```tsx
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { SaveStatus } from "../../shared/SaveStatus";
import { useToast } from "../../shared/Toast";
import { PageTitle, SubTabs } from "../../shared/ui";
import { useCheckinSettings } from "./api";
import { useClassroom } from "./classroom";
import { PinPad } from "./PinPad";

const TABS = [
  { to: "/checkin", label: "打卡台", end: true },
  { to: "/checkin/missing", label: "缺交總覽" },
  { to: "/checkin/history", label: "學生歷程" },
  { to: "/checkin/archive", label: "封存紀錄" },
];

/** /checkin/* 的外框：一般模式用工作台的標題與分頁；教室模式只有一列精簡的標題列 */
export function CheckinShell() {
  const { classroom } = useClassroom();
  if (classroom) {
    return (
      <>
        <ClassroomBar />
        <div className="px-3 pb-3 pt-2"><Outlet /></div>
      </>
    );
  }
  return (
    <>
      <PageTitle right={<EnterClassroom />}>任務打卡</PageTitle>
      <SubTabs tabs={TABS} />
      <Outlet />
    </>
  );
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

function EnterClassroom() {
  const { cls } = useClassData();
  const settings = useCheckinSettings(cls.id);
  const { enter } = useClassroom();
  const navigate = useNavigate();
  const toast = useToast();
  const hasPin = !!settings.data?.pin_hash;
  return (
    <div className="flex items-center gap-2">
      {settings.data !== undefined && !hasPin && <Link to="/settings" className="text-sm text-muted underline">先到設定頁設定 PIN</Link>}
      <button type="button" className="btn-primary" disabled={!hasPin} onClick={() => {
        enter();
        navigate("/checkin");
        if (!isStandalone()) toast("建議把網站「加入主畫面」，用全螢幕開啟");
      }}>進入教室模式</button>
    </div>
  );
}

/** 教室模式的標題列：一列、高度 ≤ 56pt（設計 §7.2）。老師的工具要先用 PIN 解鎖 */
function ClassroomBar() {
  const { cls } = useClassData();
  const settings = useCheckinSettings(cls.id);
  const { unlocked, unlock, lock, exit } = useClassroom();
  const navigate = useNavigate();
  const [askPin, setAskPin] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-line bg-sheet px-3"
      style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <span className="shrink-0 font-black">✅ 任務打卡</span>
      <nav className="flex gap-1">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? "chip-on" : "chip")}>{t.label}</NavLink>
        ))}
      </nav>
      <span className="ml-auto"><SaveStatus /></span>
      {unlocked ? (
        <>
          <button type="button" className="btn" onClick={() => { exit(); navigate("/settings"); }}>名單、設定與備份</button>
          <button type="button" className="btn" onClick={exit}>離開教室模式</button>
          <button type="button" className="btn-primary" onClick={lock}>上鎖</button>
        </>
      ) : (
        <button type="button" className="btn" onClick={() => setAskPin(true)}>🔒 老師</button>
      )}
      {askPin && (
        <PinPad salt={settings.data?.pin_salt ?? null} hash={settings.data?.pin_hash ?? null}
          onSuccess={() => { setAskPin(false); unlock(); }} onCancel={() => setAskPin(false)} />
      )}
    </header>
  );
}
```

- [ ] **Step 2: 修改 `src/app/App.tsx`**

在 import 區加上（依字母順序放在 coins 之前、Layout 之前）：

```tsx
import { CheckinBoard } from "../features/checkin/CheckinBoard";
import { CheckinShell } from "../features/checkin/CheckinShell";
import { ClassroomGuard, ClassroomProvider } from "../features/checkin/classroom";
```

把 `return (<ClassGate> … </ClassGate>);` 整段換成：

```tsx
  return (
    <ClassGate>
      <ClassroomProvider>
        <ClassroomGuard>
          <Routes>
            <Route path="/seating/:layoutId/print" element={<SeatingPrint />} />
            <Route element={<Layout />}>
              <Route path="/homework" element={<HomeworkToday />} />
              <Route path="/homework/missing" element={<HomeworkMissing />} />
              <Route path="/homework/history" element={<HomeworkHistory />} />
              <Route path="/checkin" element={<CheckinShell />}>
                <Route index element={<CheckinBoard />} />
              </Route>
              <Route path="/coins" element={<CoinsOverview />} />
              <Route path="/coins/new" element={<CoinsNew />} />
              <Route path="/coins/history" element={<CoinsHistory />} />
              <Route path="/coins/student/:id" element={<CoinsStudent />} />
              <Route path="/coins/student" element={<CoinsStudent />} />
              <Route path="/seating" element={<SeatingPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/homework" replace />} />
            </Route>
          </Routes>
        </ClassroomGuard>
      </ClassroomProvider>
    </ClassGate>
  );
```

- [ ] **Step 3: 修改 `src/app/Layout.tsx`**

import 區加上：

```tsx
import { useClassroom } from "../features/checkin/classroom";
```

`NAV` 在「作業小管家」之後加一項：

```tsx
  { to: "/checkin", icon: "✅", label: "任務打卡" },
```

`Layout()` 開頭三行換成：

```tsx
export function Layout() {
  const { classroom } = useClassroom();
  const [collapsed, toggle] = useSidebarCollapsed();
  // 課程規劃表、任務打卡是寬版面，不受內容最大寬度限制
  const path = useLocation().pathname;
  const wide = path.startsWith("/planner") || path.startsWith("/checkin");
  // 教室模式：iPad 投到白板給全班操作，不顯示工作台的選單（設計 §3.2）
  if (classroom) return <div className="min-h-dvh"><Outlet /></div>;
```

底部分頁從 5 個變成 6 個，把 `grid-cols-5` 改成 `grid-cols-6`：

```tsx
      <nav className="print:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-sheet/95 backdrop-blur md:hidden"
```

- [ ] **Step 4: 型別檢查、測試、建置**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

- [ ] **Step 5: Commit**

```bash
git add src/features/checkin/CheckinShell.tsx src/app/App.tsx src/app/Layout.tsx
git commit -m "feat(checkin): 任務打卡的路由、選單與教室模式標題列"
```

---

### Task 10: 缺交總覽（M02）

**Files:**
- Create: `src/features/checkin/CheckinMissing.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: 建立 `src/features/checkin/CheckinMissing.tsx`**

```tsx
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import { Empty, ErrorBox, Loading } from "../../shared/ui";
import { useBatches, useBatchTasks, useOpenTasks } from "./api";
import { matchStudent, missingByStudent, withLiveNames } from "./logic/stats";

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
      <p className="mb-3 text-sm text-muted">{tasks.length} 項任務・{rows.length} 位學生有未完成任務（免交、已轉出不算）</p>
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
```

- [ ] **Step 2: 接上路由**

`src/app/App.tsx` 加上 import：

```tsx
import { CheckinMissing } from "../features/checkin/CheckinMissing";
```

在 `<Route index element={<CheckinBoard />} />` 下面加一行：

```tsx
                <Route path="missing" element={<CheckinMissing />} />
```

- [ ] **Step 3: 型別檢查**

Run: `npm run typecheck`
Expected: 沒有錯誤。

- [ ] **Step 4: Commit**

```bash
git add src/features/checkin/CheckinMissing.tsx src/app/App.tsx
git commit -m "feat(checkin): 缺交總覽"
```

---

### Task 11: 學生歷程（M03）

**Files:**
- Create: `src/features/checkin/CheckinHistory.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: 建立 `src/features/checkin/CheckinHistory.tsx`**

```tsx
import { useSearchParams } from "react-router-dom";
import { useClassData } from "../../lib/classData";
import type { CheckinMark } from "../../lib/types";
import { ErrorBox, Loading } from "../../shared/ui";
import { useBatches, useStudentEvents, useStudentMarks } from "./api";
import { eventText } from "./logic/events";
import { fmtDateTime, fmtTime } from "./logic/time";

const STATE_TEXT: Record<CheckinMark["state"], string> = { done: "已完成", pending: "未完成", exempt: "免交" };
const STATE_LOOK: Record<CheckinMark["state"], string> = { done: "text-sage", pending: "text-rose-ink", exempt: "text-muted" };

/** 學生歷程：摘要、逐項表格、完整操作歷程（設計 §7.3、第 23 題）。網址 ?student=…&scope=… */
export function CheckinHistory() {
  const { cls, allStudents } = useClassData();
  const [params, setParams] = useSearchParams();
  const sid = params.get("student") ?? allStudents.find((s) => !s.left_at)?.id ?? "";
  const scope = params.get("scope") ?? ""; // "" 全部、"open" 進行中、其他是封存批次的 id
  const marks = useStudentMarks(sid);
  const events = useStudentEvents(sid);
  const batches = useBatches(cls.id);

  const error = marks.error || events.error || batches.error;
  if (error) return <ErrorBox error={error} />;
  if (marks.isLoading || events.isLoading || batches.isLoading) return <Loading />;

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const batchTitle = new Map((batches.data ?? []).map((b) => [b.id, b.title]));
  const rows = (marks.data ?? [])
    .filter((m) => !m.removed_at)
    .filter((m) => !scope || (scope === "open" ? m.checkin_tasks.status === "open" : m.checkin_tasks.batch_id === scope))
    .sort((a, b) => b.checkin_tasks.task_date.localeCompare(a.checkin_tasks.task_date) || a.checkin_tasks.slot - b.checkin_tasks.slot);
  const inScope = new Set(rows.map((m) => m.task_id));
  const evs = (events.data ?? []).filter((e) => !scope || (e.task_id !== null && inScope.has(e.task_id)));
  const count = (state: CheckinMark["state"]) => rows.filter((m) => m.state === state).length;
  const student = allStudents.find((s) => s.id === sid);

  return (
    <>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <select aria-label="學生" className="input" value={sid} onChange={(e) => set("student", e.target.value)}>
          {allStudents.map((s) => <option key={s.id} value={s.id}>{s.student_no} {s.name_zh}{s.left_at ? "（已轉出）" : ""}</option>)}
        </select>
        <select aria-label="範圍" className="input" value={scope} onChange={(e) => set("scope", e.target.value)}>
          <option value="">全部任務</option>
          <option value="open">進行中的任務</option>
          {batches.data?.map((b) => <option key={b.id} value={b.id}>{b.title}{b.kind === "single" ? "（單項）" : ""}</option>)}
        </select>
      </div>

      <div className="card mb-3 flex flex-wrap items-baseline gap-x-8 gap-y-1 p-4">
        <span className="text-xl font-black">{student?.student_no} {student?.name_zh}</span>
        <span className="text-xl font-bold text-sage">已完成 {count("done")} 項</span>
        <span className="text-xl font-bold text-rose-ink">未完成 {count("pending")} 項</span>
        {count("exempt") > 0 && <span className="text-xl font-bold text-muted">免交 {count("exempt")} 項</span>}
      </div>

      <div className="card mb-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left">
          <thead>
            <tr className="bg-sage-soft text-sm text-sage">
              <th className="p-2">日期</th><th className="p-2">任務</th><th className="p-2">狀態</th><th className="p-2">打卡時間</th><th className="p-2">來源</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-muted">沒有紀錄</td></tr>
            ) : rows.map((m) => (
              <tr key={m.task_id} className="border-t border-line">
                <td className="p-2 tabular-nums">{m.checkin_tasks.task_date}</td>
                <td className="p-2">{m.checkin_tasks.name}</td>
                <td className={`p-2 font-bold ${STATE_LOOK[m.state]}`}>{STATE_TEXT[m.state]}</td>
                <td className="p-2 tabular-nums">{m.done_at ? fmtTime(m.done_at) : "—"}</td>
                <td className="p-2">{m.checkin_tasks.status === "open" ? "進行中" : batchTitle.get(m.checkin_tasks.batch_id ?? "") ?? "封存"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-black">打卡與取消歷程</h2>
      <ul className="card divide-y divide-line">
        {evs.length === 0 ? <li className="p-3 text-muted">沒有操作紀錄</li> : evs.map((e) => (
          <li key={e.id} className="flex gap-3 p-3">
            <span className="shrink-0 tabular-nums text-muted">{fmtDateTime(e.at)}</span>
            <span>{eventText(e)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
```

- [ ] **Step 2: 接上路由**

`src/app/App.tsx` 加上 import：

```tsx
import { CheckinHistory } from "../features/checkin/CheckinHistory";
```

在 `missing` 那一行下面加：

```tsx
                <Route path="history" element={<CheckinHistory />} />
```

- [ ] **Step 3: 型別檢查**

Run: `npm run typecheck`
Expected: 沒有錯誤。

- [ ] **Step 4: Commit**

```bash
git add src/features/checkin/CheckinHistory.tsx src/app/App.tsx
git commit -m "feat(checkin): 學生歷程"
```

---

### Task 12: 封存紀錄（M04）

**Files:**
- Create: `src/features/checkin/CheckinArchive.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: 建立 `src/features/checkin/CheckinArchive.tsx`**

```tsx
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
```

- [ ] **Step 2: 接上路由**

`src/app/App.tsx` 加上 import：

```tsx
import { CheckinArchive } from "../features/checkin/CheckinArchive";
```

在 `history` 那一行下面加：

```tsx
                <Route path="archive" element={<CheckinArchive />} />
```

- [ ] **Step 3: 型別檢查、建置**

Run: `npm run typecheck && npm run build`
Expected: 沒有錯誤。

- [ ] **Step 4: Commit**

```bash
git add src/features/checkin/CheckinArchive.tsx src/app/App.tsx
git commit -m "feat(checkin): 封存紀錄"
```

---

### Task 13: 設定頁的 PIN 與備份清單

**Files:**
- Create: `src/features/checkin/CheckinPinSection.tsx`
- Modify: `src/features/roster/SettingsPage.tsx`
- Modify: `scripts/backup.mjs`

- [ ] **Step 1: 建立 `src/features/checkin/CheckinPinSection.tsx`**

```tsx
import { useState } from "react";
import { useClassData } from "../../lib/classData";
import { useToast } from "../../shared/Toast";
import { useCheckinSettings, useSavePin } from "./api";
import { hashPin, isValidPin, newSalt } from "./logic/pin";

/** 設定頁：教室模式的 PIN。老師在自己的手機上設定或重設（設計 §3.2） */
export function CheckinPinSection() {
  const { cls } = useClassData();
  const settings = useCheckinSettings(cls.id);
  const save = useSavePin(cls.id);
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const hasPin = !!settings.data?.pin_hash;

  async function submit() {
    if (!isValidPin(pin)) { toast("PIN 要是 4 位數字"); return; }
    if (pin !== again) { toast("兩次輸入的 PIN 不一樣"); return; }
    const salt = newSalt();
    save.mutate({ pin_hash: await hashPin(pin, salt), pin_salt: salt }, {
      onSuccess: () => { setPin(""); setAgain(""); toast(hasPin ? "已重設 PIN" : "已設定 PIN，可以進入教室模式了"); },
      onError: () => toast("儲存失敗，請再試一次"),
    });
  }

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-lg font-black">任務打卡｜教室模式 PIN</h2>
      <p className="mb-3 text-sm text-muted">
        {hasPin ? "已設定。" : "尚未設定，設定後才能進入教室模式。"}
        教室模式下，編輯任務、封存、標免交、離開教室模式都要輸入 PIN。PIN 只是防止學生在白板上誤按，忘記時在這裡重設即可。
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input id="pin-new" aria-label="新的 PIN" className="input" type="password" inputMode="numeric" maxLength={4}
          placeholder="4 位數字" value={pin} onChange={(e) => setPin(e.target.value)} />
        <input id="pin-again" aria-label="再輸入一次" className="input" type="password" inputMode="numeric" maxLength={4}
          placeholder="再輸入一次" value={again} onChange={(e) => setAgain(e.target.value)} />
        <button type="button" className="btn-primary" disabled={save.isPending} onClick={submit}>{hasPin ? "重設 PIN" : "設定 PIN"}</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 修改 `src/features/roster/SettingsPage.tsx`**

import 區加上：

```tsx
import { CheckinPinSection } from "../checkin/CheckinPinSection";
```

`SettingsPage` 裡在 `<ItemsSection />` 與 `<BackupSection />` 之間加上：

```tsx
        <CheckinPinSection />
```

`BACKUP_TABLES` 換成：

```tsx
const BACKUP_TABLES = ["classes", "students", "homework_items", "homework_assignments", "homework_checks", "coin_transactions",
  "seating_layouts", "seat_assignments", "semesters", "semester_off_days", "planner_columns", "planner_entries",
  "checkin_settings", "checkin_batches", "checkin_tasks", "checkin_task_marks", "checkin_events"];
```

- [ ] **Step 3: 修改 `scripts/backup.mjs`**

`TABLES` 換成（每晚備份本來就分頁讀取，`checkin_events` 一年 5 萬筆以上也不會被截斷）：

```js
const TABLES = ["classes", "students", "homework_items", "homework_assignments", "homework_checks", "coin_transactions",
  "seating_layouts", "seat_assignments", "semesters", "semester_off_days", "planner_columns", "planner_entries",
  "checkin_settings", "checkin_batches", "checkin_tasks", "checkin_task_marks", "checkin_events", "holidays", "audit_log"];
```

- [ ] **Step 4: 型別檢查、測試、建置**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通過。

- [ ] **Step 5: Commit**

```bash
git add src/features/checkin/CheckinPinSection.tsx src/features/roster/SettingsPage.tsx scripts/backup.mjs
git commit -m "feat(checkin): 設定頁的教室模式 PIN；任務打卡資料加入備份"
```

---

### Task 14: 在瀏覽器實測（本機 Supabase）

**Files:** 無（如果發現問題，回到對應的 Task 修正並另外 commit）

本機環境：Docker Desktop＋本機 Supabase；`.env.local` 指向 `http://127.0.0.1:54321`。測試帳號用 `.env.local` 裡的 `claude-qa@mumu.test`（只存在本機資料庫）。測試用 PIN 是 `0420`，只存在本機資料庫。

- [ ] **Step 1: 套用 migration 到本機資料庫**

Run: `supabase status`
Expected: 顯示 API URL `http://127.0.0.1:54321`。如果沒有在執行，先跑 `supabase start`。

Run: `supabase migration up --local`
Expected: 顯示套用了 `20261024120000_checkin_c1.sql`。

- [ ] **Step 2: 把測試班級補到 30 人**

Run:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
insert into public.students (owner_id, class_id, student_no, name_zh)
select c.owner_id, c.id, n, '測試' || lpad(n::text, 2, '0')
from public.classes c join auth.users u on u.id = c.owner_id, generate_series(1, 30) n
where u.email = 'claude-qa@mumu.test'
on conflict do nothing;"
```

Expected: `INSERT 0 N`，座號 1–30 都有在籍學生（已存在的座號會略過）。

- [ ] **Step 3: 啟動並登入**

用 `preview_start`（name: `mumu-dev`）開啟，登入 QA 帳號。到「設定」設定 PIN `0420`，看到「已設定 PIN」。

- [ ] **Step 4: 一般模式的流程**

逐項確認，並用 `read_console_messages` 確認沒有錯誤：
1. 左側選單有「✅ 任務打卡」；`/checkin` 顯示 4 格「尚未設定」。
2. 在 4 格各新增一項任務（其中一項填截止日與說明）；卡片顯示 `0 / 30 完成`。
3. 點幾個名字：變綠色並出現 ✓，計數增加；「↶ 復原：…」顯示最後一次。重新整理後狀態保留。
4. 再點一次已完成的名字：變回白色。按復原：回到綠色，並且到學生歷程看打卡時間是原本的時間。
5. 「編輯」→ 標一位免交：卡片變灰色「免」、分母變 29、按鈕不能點。
6. 卡片的「未完成 N 人 →」帶到缺交總覽並已篩選該項；搜尋座號與姓名都能找到；「查看個人歷程 →」帶到該生。
7. 學生歷程：表格與「打卡與取消歷程」都有剛才的操作，新到舊。
8. 「編輯」→「封存這一項」：該格清空；封存紀錄出現一張「單項封存」。
9. 「封存本輪紀錄」：確認視窗列出任務名稱；確定後打卡台清空；封存紀錄出現新的一張，「檢視紀錄」展開唯讀卡片（點名字沒有反應），「缺交清單」帶到該批次的缺交總覽。
10. 設定頁把一位學生設為轉出：進行中任務的卡片少一個名字、分母減 1。

- [ ] **Step 5: 連點保護**

在打卡台建立一項任務後，用 `javascript_tool` 對同一個名字連點兩次：

```js
const b = [...document.querySelectorAll('button[aria-pressed]')][0];
b.click(); b.click();
await new Promise((r) => setTimeout(r, 1500));
b.getAttribute('aria-pressed');
```

Expected: `"true"`（只算一次打卡）。到學生歷程確認只有 1 筆「完成打卡」。

- [ ] **Step 6: 教室模式（AC41、AC42、尺寸）**

1. 按「進入教室模式」：側欄、底部分頁消失，只剩一列標題列；沒有「編輯」「封存本輪紀錄」「＋ 新增任務」。
2. `navigate` 到 `/homework`、`/settings`、`/coins`：都被導回 `/checkin`。
3. 重新整理：仍在教室模式、仍是上鎖。
4. 「🔒 老師」→ 輸入 `1111`：顯示「PIN 不正確」、不解鎖。輸入 `0420`：出現「名單、設定與備份」「離開教室模式」「上鎖」，卡片出現「編輯」。
5. 解鎖後不要操作，等 2 分鐘（`javascript_tool` 執行 `await new Promise((r) => setTimeout(r, 125000))`；如果工具逾時，就用 `computer` 的 `wait` 分次等）：自動回到「🔒 老師」，「編輯」消失。
6. `resize_window` 1180×796，回到 `/checkin`（4 項任務、30 人）：

```js
[document.documentElement.scrollHeight, window.innerHeight]
```

Expected: 第一個數字 ≤ 第二個（不需要捲動）。截圖留證。

7. `resize_window` mobile（375×812），離開教室模式後看 `/checkin`：卡片直向排列、可以捲動、名字 3 欄。測完 `resize_window` preset `desktop`。

- [ ] **Step 7: 最後的完整檢查**

Run: `npm run typecheck && npm test && npm run build && ./scripts/db-test.sh`
Expected: 全部通過，資料庫測試輸出三個 PASSED。

---

### Task 15: 開 PR、套用正式站 migration（需使用者同意）

**部署順序（硬性）：** 合併後 Netlify 會自動部署，前端會讀新的資料表與 RPC；每晚備份也會讀新的表。所以**必須先在正式站套用 migration，再合併 PR**。migration 只新增東西，舊的前端不受影響。

- [ ] **Step 1: 經使用者同意後 push 並開 PR**

```bash
git push -u origin feat/task-checkin-c1
gh pr create --base main --title "feat: 任務打卡 C1（一般任務與教室模式）" --body-file - <<'EOF'
## 內容
- 新增「✅ 任務打卡」：打卡台（最多 4 項任務）、缺交總覽、學生歷程、封存紀錄
- 教室模式：iPad 投到電子白板時只顯示任務打卡；老師的功能要輸入 PIN，閒置 2 分鐘自動上鎖
- 設定頁新增教室模式 PIN；任務打卡的資料加入手動與每晚備份
- 設計：docs/superpowers/specs/2026-10-23-task-checkin-design.md（C1）
- 計畫：docs/superpowers/plans/2026-10-24-task-checkin-c1.md

## 合併前必做
1. 在正式站 Supabase SQL Editor 執行 `supabase/migrations/20261024120000_checkin_c1.sql`
2. 確認 Table Editor 有 `checkin_settings`、`checkin_tasks`、`checkin_task_marks`、`checkin_batches`、`checkin_events`
3. 再合併本 PR

## 測試
- `npm run typecheck`、`npm test`、`npm run build`
- `./scripts/db-test.sh`：RPC、復原、封存、名單 trigger、RLS 隔離
- 本機 Supabase 瀏覽器實測：一般模式完整流程、連點保護、教室模式路由限制、PIN、自動上鎖、iPad 1180×796 不捲動、手機寬度

## 上線後
請老師在教室用 iPad＋HDMI＋電子白板實際點一輪（AC44），確認點擊會落在正確的名字上、連點不會被算成取消，再開始做 C2 中午時段。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 2: 套用正式站 migration（使用者執行，或經同意後用 Supabase MCP 的 `apply_migration`）**

套用後確認：

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'checkin_%' order by 1;
```

Expected: 5 張表加上 `checkin_task_stats`。

- [ ] **Step 3: CI 通過後合併，確認 Netlify 部署成功**

合併後用正式站的維護者測試帳號（不碰老師的班級）開 `/checkin`，建一項任務、點一次、封存，確認沒有錯誤。
