# 任務打卡 C2（中午時段）＋ C3（匯出與驗收）Implementation Plan

> **For agentic workers:** 依 Task 順序實作。每個 Task 完成後要跑該 Task 列出的驗證指令並全部通過，再回報。程式風格比照 C1（`src/features/checkin/`、`supabase/migrations/20261024120000_checkin_c1.sql`）：註解密度、命名、繁體中文註解與畫面文字都照舊。

**Goal:** 在任務打卡加入「中午時段」系列（中午打卡台、每日結算、學生歷程、每日封存，17:00 自動封存），以及 C3 的 Excel 匯出、教師操作指南、驗收對照表。

**設計文件：** `docs/superpowers/specs/2026-10-23-task-checkin-design.md`（以下稱「設計」）。C2 = 設計 §5.3、§6.2–§6.4、§7.3 中午部分、§8；C3 = §9、§11。
**Mockup：** `MUMU_開發溝通交付包20261023/mockup_png/M05–M10`（只參考版面與資訊，樣式沿用工作台的 Tailwind class）。

**分支：** `feat/task-checkin-c2`（從 `origin/main` 建立）。`main` 受保護，只能走 PR。正式站的 migration 由使用者手動在 SQL Editor 套用。

**決策：** 使用者 2026-10-24 決定不等 AC44 教室實測，C2、C3 直接開始。

---

## 和設計文件不同的地方

| 項目 | 設計 | 本計畫 | 原因 |
|---|---|---|---|
| `noon_days.version` | 由 trigger 在每次打卡時加 1 | 不建這個欄位。「版本」＝當天 `checkin_events` 的筆數；`settled_version` 存結算當下的筆數 | 每次打卡多更新一次 `noon_days` 會多一筆 audit_log；每個變動本來就一定記一筆事件 |
| `noon_today` | 回傳紀錄或「範本＋名單」的預覽 | 只回傳伺服器時間、今天的日期、`day_id`、版本、是否已過 17:00。紀錄與預覽由前端直接讀表組出來 | 讀取權限本來就開放；少一份 JSON 形狀要維護 |
| `noon_archive_due_mine` | 開頁面就補做 | 只處理「排定時間已過 15 分鐘以上」的日子，`archived_by` 一律 catchup | 17:00–17:15 交給排程，避免老師 17:01 打開頁面時被標成「補封存」 |
| 預設固定任務 | 建立班級時寫入 | `classes` 的 after insert trigger 寫入；migration 為現有班級補上 | 不必改 Setup.tsx，舊班級也一起處理 |
| pg_cron | 直接建立 | migration 先檢查 `pg_available_extensions` 有 pg_cron 才建立排程 | `scripts/db-test.sh` 的 Homebrew Postgres 沒有 pg_cron；Supabase（正式站與本機 Docker）都有 |
| 老師的中午工具 | 未細分 | 打卡台上方「模式」切換：打卡（預設）／補登／請假。補登模式點未完成的名字＝補登；請假模式點名字＝切換整天請假 | 白板只能單點（設計 §3.3），不能用長按或選單 |
| 封存後補標請假 | 未指定位置 | 每日封存頁，老師展開某一天後切換學生的請假 | 打卡台在 17:00 後只顯示今天 |

---

## 檔案地圖

| 檔案 | 動作 | Task |
|---|---|---|
| `supabase/migrations/20261024150000_checkin_c2.sql` | 新增 | 1 |
| `supabase/tests/checkin_c2.sql` | 新增 | 1 |
| `src/lib/types.ts` | 修改：中午的型別 | 2 |
| `src/features/checkin/logic/noon.ts`（＋`noon.test.ts`） | 新增：判定、統計、畫面資料組合、比率格式 | 2 |
| `src/features/checkin/logic/clock.ts`（＋test） | 新增：伺服器時間差、時鐘格式、17:00 判斷 | 2 |
| `src/features/checkin/logic/errors.ts`、`events.ts`（＋test） | 修改：中午的錯誤碼與事件文字 | 2 |
| `src/features/checkin/noonApi.ts` | 新增：中午的查詢與寫入 | 2 |
| `src/features/checkin/CheckinShell.tsx` | 修改：系列切換、中午分頁、時鐘 | 3 |
| `src/features/checkin/NoonBoard.tsx`、`NoonRow.tsx` | 新增：中午打卡台（M05、M09） | 3 |
| `src/app/App.tsx` | 修改：`/checkin/noon/*` 路由 | 3 |
| `src/features/checkin/NoonSummary.tsx` | 新增：每日結算（M06） | 4 |
| `src/features/checkin/NoonHistory.tsx` | 新增：學生歷程（M07） | 4 |
| `src/features/checkin/NoonArchive.tsx` | 新增：每日封存（M08）＋封存後補標請假 | 4 |
| `src/features/checkin/NoonSettingsSection.tsx` | 新增：固定任務、午餐時序 | 4 |
| `src/features/roster/SettingsPage.tsx`、`scripts/backup.mjs` | 修改：設定區塊、備份清單 | 4 |
| `src/features/checkin/logic/exportRows.ts`（＋test）、`exportXlsx.ts` | 新增：Excel 匯出（C3） | 5 |
| 各頁的「匯出 Excel」按鈕 | 修改 | 5 |
| `docs/checkin-teacher-guide.md` | 新增：教師操作指南（一頁） | 6 |
| `docs/superpowers/acceptance/2026-10-24-task-checkin.md` | 新增：AC01–AC44 驗收對照 | 6 |

---

## Task 1：資料庫（C2 migration 與測試）

**Files:** `supabase/migrations/20261024150000_checkin_c2.sql`、`supabase/tests/checkin_c2.sql`
**驗證：** `bash scripts/db-test.sh`（會跑全部 migration 與 `supabase/tests/*.sql`，全部通過）

### 1.1 資料表（設計 §5.3）

共同欄位：`owner_id uuid not null default auth.uid() references auth.users on delete cascade`、`created_at`、`updated_at`；全部掛 `set_updated_at` 與 `write_audit` trigger（比照 C1 的 do 迴圈）。

- `noon_items`：`id`、`class_id fk classes on delete cascade`、`name text not null check (btrim(name) <> '')`、`deadline time not null default '12:40'`、`sort_order int not null default 0`、`archived_at timestamptz`。
- `noon_days`：`id`、`class_id`、`date date not null`、`unique (class_id, date)`、`status text not null default 'open' check in ('open','archived')`、`settled_at timestamptz`、`settled_version int`、`settled_summary jsonb`、`scheduled_archive_at timestamptz not null`（＝`(date + time '17:00') at time zone 'Asia/Taipei'`）、`archived_at timestamptz`、`archived_by text check in ('schedule','catchup')`、`final_summary jsonb`、`revised_at timestamptz`。
  - constraint：`(status = 'archived') = (archived_at is not null and archived_by is not null and final_summary is not null)`。
  - index：`(status, scheduled_archive_at) where status = 'open'`（排程用）。
- `noon_day_items`：`id`、`owner_id`、`day_id fk noon_days on delete cascade`、`template_id uuid fk noon_items`、`name`、`deadline time`、`sort_order int`；`unique (day_id, template_id)`。
- `noon_day_students`：`owner_id`、`day_id fk on delete cascade`、`student_id fk students`、`student_no int`、`name_zh text`、`on_leave bool not null default false`、`removed_at timestamptz`；pk `(day_id, student_id)`。
- `noon_marks`：`owner_id`、`day_item_id fk noon_day_items on delete cascade`、`student_id fk students`、`day_id fk noon_days on delete cascade`、`result text not null default 'pending' check in ('pending','ontime','late')`、`done_at timestamptz`、`source text check in ('student','teacher')`；pk `(day_item_id, student_id)`；index `(day_id)`、`(student_id)`；constraint `(result = 'pending') = (done_at is null and source is null)`。
- `checkin_events` 補外鍵：`day_id → noon_days on delete cascade`、`day_item_id → noon_day_items on delete cascade`。加 index `(day_id, id)`。

### 1.2 預設固定任務

- `noon_seed_items()`：`security definer`，after insert on `classes`，用 `new.owner_id` 寫入 5 項（sort_order 0–4，deadline 12:40）：`喝水、上廁所`、`清潔桌面`、`打掃地板`、`整理書櫃`、`整理書包`。
- migration 末段為「還沒有任何 noon_items 的現有班級」補上同樣 5 項。

### 1.3 Guard 與名單 trigger

- `noon_guard_mark`：before update on `noon_marks`，當天已封存就 `raise exception 'noon_closed'`。
- `noon_guard_day_student`：before update on `noon_day_students`，當天已封存時只允許 `on_leave`（與 `updated_at`）改變，其他欄位變了就 `noon_closed`。
- 修改 C1 的 `checkin_sync_roster()`（`create or replace`）：在原本一般任務的處理之後，再處理「這個班今天（台北日期）、status = open、而且 now() < scheduled_archive_at」的那一天：
  - 新增／復學：`noon_day_students` 補一列（on conflict do nothing），並為當天每個 day_item 補 `noon_marks` pending；復學清掉 `removed_at`。
  - 轉出：`noon_day_students.removed_at = now()`。

### 1.4 RLS 與權限

- 全部 enable RLS。`noon_items`：`owner_all`（with check 檢查班級屬於自己，同 C1）；授權 `select, insert, update`。
- `noon_days`、`noon_day_items`、`noon_day_students`、`noon_marks`：`owner_read` select only；只授權 `select`。
- 先 `revoke all ... from anon, authenticated` 再逐一授權（同 C1）。內部函式（`_` 開頭）、trigger 函式、`noon_archive_due()` 都 `revoke execute from public, anon, authenticated`。公開 RPC `revoke from public, anon` 後 `grant to authenticated`。

### 1.5 函式

所有寫入 RPC 都是 `security definer set search_path = public`，第一步確認資料屬於 `auth.uid()`（`_checkin_class_owner` 已存在）。可測試時鐘：內部函式帶 `p_at timestamptz`，公開函式傳 `now()`（設計 §10）。以下「台北日期」＝`(p_at at time zone 'Asia/Taipei')::date`，「已過 17:00」＝`(p_at at time zone 'Asia/Taipei')::time >= '17:00'`。

錯誤碼（`raise exception '<code>'`）：`noon_closed`（17:00 後或已封存）、`noon_on_leave`（請假中不能打卡）、`noon_no_item`（今天的紀錄沒有這項任務）、`noon_no_day`（那天沒有紀錄，且不能再建立）、沿用 `checkin_no_student`、`checkin_stale`、`checkin_forbidden`、`checkin_not_undoable`。

| 函式 | 規格 |
|---|---|
| `noon_compute_summary(p_day_id uuid) returns jsonb` | stable，見 1.6 的 JSON 形狀。不授權給 authenticated（只給其他函式用）也可以；若前端要用就授權並檢查擁有者 |
| `_noon_ensure_day(p_class_id, p_at) returns uuid` | 取得台北日期的那一天；沒有就建立：快照 `noon_items`（archived_at is null，依 sort_order）、在籍學生（left_at is null）、每個 item×student 一列 pending mark。已過 17:00 而且還沒有紀錄 → `noon_no_day` |
| `_noon_set_done(p_class_id, p_template_id, p_student_id, p_done bool, p_at)` → `noon_set_done(p_class_id, p_template_id, p_student_id, p_done)` | 已過 17:00 → `noon_closed`；ensure day；day 已封存 → `noon_closed`；找不到 day_item → `noon_no_item`；學生不在當天名單或 removed → `checkin_no_student`；請假 → `noon_on_leave`。done：`date_trunc('minute', p_at at time zone 'Asia/Taipei')::time <= deadline` 為 ontime，否則 late，source student。冪等：done 且已是 ontime/late、或 undone 且已是 pending，就不寫入、`event_id` null。事件：series noon、day_id、day_item_id、action done/cancel、prev/next `{"result","done_at","source"}`、actor student、at p_at。回傳 `{"result","done_at","source","event_id","day_id"}` |
| `_noon_teacher_fill(...p_at)` → `noon_teacher_fill(p_class_id, p_template_id, p_student_id)` | 規則同上，但 result 一律 late、source teacher、actor teacher、action teacher_fill；已完成就不動（event_id null） |
| `_noon_set_leave(p_class_id, p_date, p_student_id, p_on_leave, p_at)` → `noon_set_leave(p_class_id, p_date, p_student_id, p_on_leave)` | 那天沒有紀錄時：p_date 是今天而且未過 17:00 → ensure；否則 `noon_no_day`。**已封存也可以**：改 on_leave、重算 `final_summary`、`revised_at = p_at`。冪等。事件 action leave/unleave、actor teacher、day_item_id null、prev/next `{"on_leave":bool}`。回傳 `{"on_leave","event_id","day_id"}` |
| `_noon_settle(p_class_id, p_at)` → `noon_settle(p_class_id)` | ensure day（已過 17:00 而沒有紀錄 → `noon_no_day`）；已封存 → `noon_closed`；寫入 `settled_at = p_at`、`settled_version = 當天事件數`、`settled_summary = noon_compute_summary(...)`；回傳 summary |
| `noon_today(p_class_id) returns jsonb` | 不寫入。回傳 `{"now", "date", "after_cutoff", "day_id", "status", "version"}`；沒有紀錄時 day_id/status 為 null、version 0 |
| `_noon_archive_due(p_owner uuid, p_at timestamptz, p_min_delay interval, p_by text) returns int` | 逐筆 `select ... for update skip locked`：`status = 'open' and p_at >= scheduled_archive_at + p_min_delay and (p_owner is null or owner_id = p_owner)`。`final_summary = noon_compute_summary(id)`、`status = 'archived'`、`archived_at = p_at`、`archived_by = coalesce(p_by, case when p_at - scheduled_archive_at <= interval '15 minutes' then 'schedule' else 'catchup' end)`。回傳處理筆數。冪等 |
| `noon_archive_due() returns int` | `_noon_archive_due(null, now(), interval '0', null)`。只給排程用，不授權給 authenticated |
| `noon_archive_due_mine() returns int` | `_noon_archive_due(auth.uid(), now(), interval '15 minutes', 'catchup')`；auth.uid() 為 null 時直接回 0 |
| `checkin_undo(p_event_id)` | `create or replace`：保留一般任務的分支；新增 noon 分支：只接受 action done/cancel/teacher_fill 的 noon 事件（teacher_fill 也可以復原）；當天已封存或台北時間已過那天 17:00 → `noon_closed`；學生請假中、已被復原過、或目前 mark 的 result/done_at/source 不等於 `next` → `checkin_stale`。還原成 `prev`，記一筆 undo 事件（actor student、undo_of）。回傳 `{"result","done_at","source","event_id","day_id"}`（一般任務的回傳不變）。內部用 `_checkin_undo(p_event_id, p_at)` 讓測試能指定時間 |

### 1.6 Summary JSON（前端與 SQL 共用的形狀）

```json
{
  "items": [{ "day_item_id": "…", "template_id": "…", "name": "清潔桌面", "deadline": "12:40", "sort_order": 1,
              "ontime": 25, "late": 2, "pending": 3, "leave": 0, "total": 30 }],
  "students": [{ "student_id": "…", "student_no": 1, "name_zh": "甲", "on_leave": false,
                 "ontime": 3, "late": 1, "pending": 1, "total": 5 }],
  "overall": { "ontime": 121, "late": 15, "pending": 14, "total": 150, "students": 30, "leave_students": 0, "items": 5 }
}
```

- 只計 `removed_at is null` 的學生。item 的 `total` ＝沒請假的人數，`leave` ＝請假人數。請假學生的 `ontime/late/pending/total` 都是 0。`ontime + late + pending = total`（測試要檢查）。`deadline` 格式 `HH:MM`。items 依 sort_order、students 依 student_no。

### 1.7 pg_cron

```sql
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('noon-archive-due', '*/5 * * * *', 'select public.noon_archive_due()');
  end if;
end $$;
```

### 1.8 SQL 測試（`supabase/tests/checkin_c2.sql`，寫法比照 `checkin_c1.sql`）

用兩個新的 auth user（id 與 C1 測試不同）。必測（設計 §10）：
1. 新建班級自動有 5 項 noon_items。
2. 判定時間點：12:39:59、12:40:59 ontime；12:41:00、16:59:59 late；17:00:00 → `noon_closed`（全部用 `_noon_set_done` 指定 `p_at`，日期用固定的 `2026-10-21`）。
3. 第一次寫入才建立 day；`noon_today` 不寫入。快照：建立後改 noon_items 名稱／新增學生姓名改變，那天的快照不變（AC30）。
4. 補登一律 late、source teacher。
5. 冪等：同一個設定重送兩次只有一筆事件。
6. AC17：12:39 打卡 → 12:42 取消 → 復原 → 恢復 12:39 ontime；取消 → 12:43 重打 → late。同一筆不能復原兩次；狀態被改掉時 `checkin_stale`。
7. 請假：請假中打卡 → `noon_on_leave`；請假 2 人時 item total = 人數 − 2；`ontime+late+pending = total`。
8. 結算：`settled_version` ＝事件數；之後再打卡，`noon_today` 的 version > settled_version。
9. 封存：`_noon_archive_due(null, '…17:03+08', '0', null)` → schedule；跑三次只有一份、處理筆數第二次起為 0；隔天 08:00 補做 → catchup，原本的打卡時間不變；`_noon_archive_due(owner, 17:05, '15 min', 'catchup')` 不處理（未滿 15 分鐘）。
10. 封存後：打卡、補登、復原 → `noon_closed`；補標請假成功、`final_summary` 重算、`revised_at` 有值。
11. 名單 trigger：今天有紀錄時新增學生 → 補進名單與 5 列 mark；轉出 → removed_at；復學 → 清掉。（這一段需要「今天」的紀錄，用 `now()` 建立，測試結束 rollback。若測試執行時台北時間已過 17:00，跳過這一段並 `raise notice`。）
12. RLS：另一位老師讀不到、不能呼叫 RPC 寫進別人的班級；authenticated 不能直接 update `noon_marks`、不能呼叫 `_noon_*` 與 `noon_archive_due()`。

---

## Task 2：前端基礎（型別、純函式、API）

**驗證：** `npx vitest run`、`npx tsc -b`

- `types.ts`：`NoonItem`、`NoonDay`（含巢狀 `noon_day_items`、`noon_day_students`、`noon_marks`）、`NoonMark`、`NoonSummary`（1.6）、`NoonToday`、`NoonSetResult`、`NoonTimelineEntry`；`CheckinEvent` 加 `day_id`、`day_item_id`、`noon_day_items: { name } | null`、`noon_days: { date } | null`，`next` 可含 `result`、`on_leave`。
- `logic/clock.ts`：`clockOffset(serverIso, deviceNowMs)`；`fmtClock(date)` → `HH:MM:SS`（台北）；`taipeiMinuteTime(date)` → `HH:MM`；`isAfterCutoff(date)`（台北 ≥ 17:00）。
- `logic/noon.ts`：
  - `judge(deadline "HH:MM", at: Date) → "ontime" | "late"`（以分鐘比較，同 SQL）。
  - `buildNoonView(day | null, templates, students)`：有紀錄就用快照，沒有就用範本（未停用、依 sort_order）＋在籍學生，mark 全部 pending。輸出 `{ items: {template_id, day_item_id|null, name, deadline}[], students: {student_id, student_no, name_zh, on_leave}[], mark(templateId, studentId) }`。
  - `computeSummary(view)` → 與 1.6 同形狀；`fmtRate(n, d)` → `"80.7%"`，d = 0 時 `"0%・0 筆"`。測試案例要和 SQL 測試 7 的數字一致。
- `logic/errors.ts`：加入中午錯誤碼的中文。`logic/events.ts`：中午事件文字（名稱來自 `noon_day_items`，undo 依 `next.result` 顯示「回到準時／逾時／未完成」，請假顯示「標為請假／取消請假」）。
- `noonApi.ts`（比照 `api.ts` 的 callRpc、Rejected、樂觀更新寫法）：
  - `noonKeys`；`useNoonToday(classId)`（60 秒重讀）；`useNoonItems(classId)`；`useNoonDay(classId, date)`（巢狀讀 day＋items＋students＋marks，`maybeSingle`）；`useNoonDays(classId)`（封存列表，fetchAll，新到舊）；`useNoonStudentEvents(studentId)`（series noon，fetchAll）；`useNoonStudentMarks(studentId, date)`。
  - `useNoonArchiveCatchup(classId)`：中午頁面載入時呼叫一次 `noon_archive_due_mine`，有處理筆數就 invalidate。
  - 寫入：`useNoonSetDone`（樂觀：用伺服器時間判定顏色）、`useNoonTeacherFill`、`useNoonSetLeave`、`useNoonSettle`、`useNoonUndo`（呼叫 `checkin_undo`）、`useSaveNoonItems`、`useSaveNoonTimeline`。第一次寫入（day_id 還是 null）成功後要 invalidate day 與 today。
  - `useCheckinSettings` 的 select 加上 `noon_timeline`（改 `api.ts`；型別一起改）。

## Task 3：中午打卡台與外框

**驗證：** `npx vitest run`、`npx tsc -b`；瀏覽器（本機 Supabase）由主 session 檢查

- `CheckinShell`：依 `pathname.startsWith("/checkin/noon")` 決定系列。一般模式的 PageTitle 下加系列切換（兩顆 NavLink：「任務打卡」`/checkin`、「中午時段」`/checkin/noon`），分頁依系列換成 `中午打卡台 /checkin/noon（end）`、`每日結算`、`學生歷程`、`每日封存`。教室模式的標題列依序：站名、系列切換、分頁、（中午系列時）時鐘、SaveStatus、老師按鈕；高度 ≤ 56pt。
- `NoonBoard`（M05、M09）：
  - 一列：午餐時序（`noon_timeline`，沒有設定就用預設 3 項）＋圖例（綠 ✓ 準時、橘「逾」逾時、白 未完成、灰「假」請假）＋復原按鈕。
  - 5 列任務，每列左側 150pt：名稱、`HH:MM 前完成`、`準時 N・逾時 N・未完 N`；右側名字 10 欄（lg）、按鈕高 32pt、間距 ≥ 6pt；轉出不顯示。
  - 單點、600ms tapGuard、送「設為完成／未完成」。復原只針對這台裝置最近一次（含補登）。
  - 老師（canTeach）：模式切換「打卡／補登／請假」＋「結算今日紀錄」（呼叫 settle 後前往 `/checkin/noon/summary`）。
  - 已過 17:00（伺服器時鐘）或當天已封存：頂端顯示「今天已於 17:00 封存・以下為唯讀紀錄」（未封存但已過 17:00 顯示「已過 17:00，等待封存・以下為唯讀紀錄」），名字不能點；老師只能用請假模式。
  - 時鐘每秒更新，用 `useNoonToday` 的伺服器時間差。
- `App.tsx`：`/checkin/noon`、`/checkin/noon/summary`、`/checkin/noon/history`、`/checkin/noon/archive`。
- iPad 1180×796 下中午打卡台不捲動（30 人、5 項）。

## Task 4：其他中午頁面、設定、備份

**驗證：** `npx vitest run`、`npx tsc -b`

- `NoonSummary`（M06）：上方日期選單（今天＋已封存的日期，`?date=` 參數）。今天：顯示 `settled_summary`、上次結算時間；`version > settled_version` 時顯示「打卡已更新，請重新結算」；老師有「重新結算」。封存日：顯示 `final_summary`。四張數字卡（準時率、逾時率、未完成項次、總完成率）＋全班各項任務表＋個別學生表（請假顯示「請假」不算比率）。
- `NoonHistory`（M07）：選學生（`?student=`）與日期；顯示當天各項任務的截止時間、狀態、打卡時間、來源（補登）；下方是該學生中午的完整操作歷程，新到舊。
- `NoonArchive`（M08）：已封存的日子新到舊：人數、任務數、準時率、逾時率、排定時間、實際執行時間；catchup 用橘色字「於 10/24 08:00 開啟時補封存」；有 `revised_at` 顯示「已於 …… 修改請假」。「查看每日結算」連到 `/checkin/noon/summary?date=`。老師（canTeach）可以展開一天，切換學生的請假（呼叫 `noon_set_leave`）。
- `NoonSettingsSection`（設定頁，放在 PIN 區塊下）：固定任務的名稱、截止時間、順序（↑↓）、新增、停用；午餐時序（時間＋文字，可增刪）。提示「修改後從下一個新的打卡日生效，今天已開始的不變」。
- 備份：`scripts/backup.mjs` 的 `TABLES` 與設定頁的 `BACKUP_TABLES` 加入 `noon_items`、`noon_days`、`noon_day_items`、`noon_day_students`、`noon_marks`；KEYS 加 `noon_day_students: ["day_id","student_id"]`、`noon_marks: ["day_item_id","student_id"]`。

## Task 5（C3）：Excel 匯出

**驗證：** `npx vitest run`、`npx tsc -b`、`npm run build`（確認 write-excel-file 是獨立的 chunk）

- 安裝 `write-excel-file`。只在按下匯出時 `await import("write-excel-file")`（設計 §9）。
- `logic/exportRows.ts`（純函式＋測試）產生「表頭＋列」：
  1. 缺交清單：座號、姓名、缺交任務、缺幾項、範圍（進行中／批次名稱）。
  2. 一般任務個人紀錄：日期、任務、狀態、打卡時間、來源。
  3. 中午每日統計：日期、統計對象（全班任務／個別學生）、座號或任務、準時、逾時、未完成、請假、應完成數、準時率、逾時率、總完成率。
  4. 中午個人歷程：日期、任務、截止時間、實際打卡時間、完成狀態（準時／逾時／未完成／請假）、來源、封存狀態。
- `exportXlsx.ts`：`downloadXlsx(filename, sheets)`。
- 按鈕：缺交總覽、一般學生歷程、每日封存（匯出所有已封存日的每日統計）、中午學生歷程。匯出不需要 PIN。

## Task 6（C3）：文件與驗收

- `docs/checkin-teacher-guide.md`：一頁的教師操作指南（教室模式、PIN、一般任務、中午時段、17:00 封存、請假、補登、結算、匯出、忘記 PIN）。
- `docs/superpowers/acceptance/2026-10-24-task-checkin.md`：AC01–AC44 每一條的驗證方式（SQL 測試、單元測試、瀏覽器、實機）與結果；需要老師或正式站才能驗的標「待驗」。
