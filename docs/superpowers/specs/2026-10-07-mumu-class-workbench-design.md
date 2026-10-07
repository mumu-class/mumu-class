# MuMu 班級工作台：設計文件

- 日期：2026-10-07
- 狀態：設計已定案；老師已於 2026-10-07 回覆[確認回條](https://claude.ai/artifact/D2AZsNyQHGPzGNNotCgRmP)，結果見 §13
- 使用者：一位國小導師（311 班），以下稱「老師」
- 維護者：老師本人與協助開發者，透過 GitHub 協作

---

## 1. 背景

老師與 AI 合作做了四個單檔 HTML 小工具，全部把資料存在瀏覽器的 localStorage：

| 工具 | 現況檔案 | 用途 |
|---|---|---|
| 311 座位安排 | `311座位安排.html` | 5×6 座位、組長、A4 列印 |
| MUMU 幣銀行 | `MUMU幣銀行_本機資料保存版.html` | 班級代幣的存款、扣款、利息、歷程 |
| 作業小管家 | `mumu作業小管家_netlify線上版.html`（從 `mumu-homework.netlify.app` 取得） | 每日作業清點、缺交總覽、學生歷程，主要在 iPhone 上用 |
| 整學期課程進度規劃表 | `mumu_semester_course_planner_v22_backup.html` | 上學日 × 作業欄位大表，自動整理作業總覽與課堂進度 |

**已經發生的事故**：課程規劃表改版後，新版載入空資料又自動執行 `save()`，把整學期的資料覆寫成空白，至今救不回來。

**其他問題**
- 名單在四個檔案裡各寫死一份，有轉學生時要改四個地方。
- 作業項目的名稱在不同工具裡對不上，例如「國複卷」和「國複習卷」。
- 作業小管家的公開網址在 HTML 原始碼中暴露 30 位學生的全名。
- 資料鎖在單一裝置的單一瀏覽器裡，無法跨裝置使用。

## 2. 目標與非目標

### 目標
1. **資料不會再消失**：換裝置、清快取、改版出錯，都不會造成資料遺失。
2. 四個工具合併成**一個需要登入的網站**，共用一份學生名單和一份作業項目主檔。
3. 跨裝置使用：iPhone、電腦、iPad 看到的是同一份資料。
4. 保留老師習慣的操作方式，第一版不重新設計工作流程。
5. 資料模型預留**多班級**與**多使用者**，日後不需要改結構就能開放給其他老師。
6. 透過 GitHub 協作；改版經過預覽確認後才上線。

### 非目標（第一版不做）
- 離線使用與恢復連線後自動補傳（老師確認網路穩定）。
- 模組間的自動串接（見 §12「B：規劃表 → 作業小管家」，資料模型已預留）。
- 缺交自動扣 MUMU 幣（牽涉學生權益，明確排除）。
- 開放註冊、多班級切換的介面、學生或家長登入。
- 從 JSON 整批還原（高風險的整批覆寫，改由開發者處理資料救援，見 §6）。
- 規劃表欄位的介面編輯（結構支援，介面先不做）。
- 搬移舊資料（老師確認沒有需要搬移的資料）。

## 3. 已定案的決策

| # | 決策 | 理由 |
|---|---|---|
| D1 | 使用者只有老師一人，需求是跨裝置 | 現況 |
| D2 | 作業小管家納入新系統 | 資料遺失風險相同，名單和作業項目與其他工具重疊 |
| D3 | 第一版只共用名單和作業項目主檔；資料模型預留 B（規劃表 → 小管家） | 先求資料穩定，盡早上線 |
| D4 | 網路穩定：寫入直接送雲端，失敗時明確提示，不做離線 | 降低複雜度 |
| D5 | 技術路線：React SPA + Supabase，部署在 Netlify | 自寫程式碼最少，多使用者成本最低 |
| D6 | GitHub Private repo，透過 PR 協作，Netlify 自動部署 | 雙人協作、改版前先預覽 |
| D7 | dev 和 prod 使用兩個獨立的 Supabase 專案 | 預覽版絕不碰到真實資料，正對上次事故的成因 |
| D8 | 資料庫結構以 migration 檔案納入版本控管 | 兩人的環境保持一致 |
| D9 | 程式碼與 repo 中不放任何真實學生名單 | 隱私 |
| D10 | Email 加密碼登入，帳號由開發者建立，不開放註冊 | iOS 主畫面 App 與 Safari 不共用登入狀態，OAuth 和魔法連結常在這裡卡住 |
| D11 | 只做「下載 JSON 備份」，不做「從 JSON 還原」 | 避免整批覆寫 |
| D12 | 帳號（GitHub、Netlify、Supabase）開在老師名下，開發者為協作者 | 學生資料與帳單屬於老師 |
| D13 | Supabase 先用免費方案，搭配排程備份兼保持活躍 | 先控制成本，上線後再評估 |
| D14 | 每晚備份存成 GitHub Actions artifact，加密，保留 90 天 | 不需要額外伺服器；學生資料不以明文存放 |
| D15 | 網址先用 `*.netlify.app`；新站名暫定 `mumu-class` | 免費 |
| D16 | 老師不一定要在本機跑開發環境，主要透過 PR 預覽網址試用 | 降低老師的負擔 |

## 4. 系統架構

```
┌────────────────────────┐        HTTPS         ┌──────────────────────────────┐
│ 前端 SPA                │ ───────────────────▶ │ Supabase（prod 或 dev）        │
│ React + TS + Vite       │                      │  ├─ Postgres                  │
│ TanStack Query          │ ◀─────────────────── │  ├─ Auth（Email 加密碼）       │
│ React Router / Tailwind │                      │  ├─ RLS：owner_id = auth.uid() │
│ PWA（manifest、icon）    │                      │  └─ RPC：需要原子性的操作       │
└────────────────────────┘                      └──────────────────────────────┘
        ▲ 部署                                              ▲ 每晚匯出
┌────────────────────────┐                      ┌──────────────────────────────┐
│ Netlify                 │                      │ GitHub Actions                │
│  main → 正式站（prod）   │                      │  ci.yml：lint、型別、測試、build│
│  PR → 預覽網址（dev）    │                      │  backup.yml：每晚加密備份      │
└────────────────────────┘                      └──────────────────────────────┘
```

### 4.1 技術選型

| 項目 | 選擇 |
|---|---|
| 前端框架 | React（開工時的最新穩定版）+ TypeScript + Vite |
| 路由 | React Router |
| 資料讀寫 | `@supabase/supabase-js` + TanStack Query（快取、重試、樂觀更新） |
| 樣式 | Tailwind CSS；沿用現有工具的米色與鼠尾草綠配色 |
| 單元測試 | Vitest |
| 端對端測試 | Playwright（含 iPhone 尺寸的畫面） |
| 資料庫測試 | Supabase CLI 加上 pgTAP，或等效的 SQL 測試腳本 |
| 語系 | 只做繁體中文 |
| 安裝方式 | PWA，可加入主畫面；不做 service worker 離線快取 |

### 4.2 程式碼結構

```
/
├─ src/
│  ├─ app/            路由、版面（側欄／底部分頁）、登入守門、全域 Provider
│  ├─ lib/            supabase client、query client、日期工具
│  ├─ shared/ui/      SaveStatus、UndoToast、ConfirmByTyping、StudentPicker 等共用元件
│  └─ features/
│     ├─ roster/      名單、作業項目主檔、設定頁
│     ├─ homework/    作業小管家
│     ├─ coins/       MUMU 幣
│     ├─ seating/     座位表
│     └─ planner/     課程規劃表
│        各 feature 內：api.ts（資料存取）、logic/*.ts（純函式＋測試）、components/
├─ supabase/
│  ├─ migrations/     資料庫結構（依時間排序的 .sql）
│  ├─ seed.sql        dev 用的假資料（假名，例如「測試學生01」）
│  └─ tests/          RLS 與 RPC 測試
├─ e2e/               Playwright
├─ .github/workflows/ ci.yml、backup.yml
├─ legacy/            舊 HTML 檔（.gitignore 排除，不進 repo）
└─ docs/
```

**界線原則**：`logic/` 底下只放不碰網路、不碰 DOM 的純函式，例如規劃表的路由規則、批次座號解析、利息計算；這些全部要有單元測試。`api.ts` 是唯一呼叫 Supabase 的地方。元件只負責組合這兩者。

## 5. 資料模型

所有業務資料表共同的欄位：`id uuid pk default gen_random_uuid()`、`owner_id uuid not null default auth.uid() references auth.users`、`created_at timestamptz default now()`、`updated_at timestamptz`（由 trigger 維護）。

### 5.1 關係總覽

```
auth.users
  ├─ classes ──┬─ students
  │            ├─ seating_layouts ── seat_assignments
  │            ├─ coin_transactions
  │            ├─ homework_assignments ── homework_checks
  │            └─ semesters ──┬─ semester_off_days
  │                           └─ planner_entries ── planner_columns
  ├─ homework_items   作業項目主檔（以老師為單位，跨班級）
  ├─ planner_columns  規劃表欄位定義（以老師為單位）
  └─ audit_log
holidays              國定假日（全站共用、唯讀）
```

### 5.2 共用核心

**`classes`**
| 欄位 | 型別 | 說明 |
|---|---|---|
| name | text not null | 例：311 |
| school_year | int not null | 民國學年，例：115 |
| archived_at | timestamptz | 學年結束後封存 |

**`students`**
| 欄位 | 型別 | 說明 |
|---|---|---|
| class_id | uuid fk | |
| student_no | int not null | **座號**。不再使用 `seat` 這個名稱 |
| name_zh | text not null | |
| name_en | text | |
| left_at | timestamptz | 轉出時填入；**不刪除**，因為交易和作業紀錄仍會參照這位學生 |

- 限制：在籍學生（`left_at is null`）的 `(class_id, student_no)` 不可重複（partial unique index）。

**`homework_items`**（作業項目主檔）
| 欄位 | 型別 | 說明 |
|---|---|---|
| subject | text not null | 國語、數學、自然、社會、其他 |
| name | text not null | 例：國習 |
| sort_order | int | |
| archived_at | timestamptz | 停用，不刪除 |

- 限制：同一位老師、未封存的項目中，`(subject, name)` 不可重複。
- 初始內容：上線時依回條第 1 項的結果，以 migration 或設定頁建立。⏳ 待朋友確認

### 5.3 座位表

**`seating_layouts`**
| 欄位 | 型別 | 說明 |
|---|---|---|
| class_id | uuid fk | |
| name | text | 例：10 月座位 |
| rows | int default 5 | |
| cols | int default 6 | |
| is_current | bool | 每個班只有一張是目前的座位表（partial unique） |

**`seat_assignments`**
| 欄位 | 型別 | 說明 |
|---|---|---|
| layout_id | uuid fk | |
| row | int | 0 起算，0 是最靠近黑板的一排 |
| col | int | 0 起算，從左往右 |
| student_id | uuid fk null | null 代表空位 |
| is_leader | bool default false | |

- 主鍵：`(layout_id, row, col)`
- 同一張座位表中，同一位學生只能出現一次：`unique (layout_id, student_id) where student_id is not null`
- 每一組只能有一位組長：`unique (layout_id, col) where is_leader`
- 組別由欄位推算，不另外存：`組號 = cols − col`，也就是最右邊一欄是第一組，與現行版面一致。

### 5.4 MUMU 幣

**`coin_transactions`**
| 欄位 | 型別 | 說明 |
|---|---|---|
| class_id | uuid fk | |
| student_id | uuid fk | |
| delta | numeric(12,2) not null, ≠ 0 | 正數是存入，負數是扣除 |
| reason | text not null | 存理由的**文字**，日後修改理由清單不會影響過去的紀錄 |
| note | text | 補充說明 |
| batch_id | uuid | 同一次送出、套用到多位學生的交易共用一個 batch_id |
| voided_at | timestamptz | 作廢（軟刪除） |

- 餘額不存，一律計算：view `student_balances` = 每位學生 `sum(delta) where voided_at is null`。
- 理由清單和金額選項（1、5、10、50、100、500、1000）第一版寫在前端設定檔，內容沿用現行工具。

**RPC**
- `record_coins(student_ids uuid[], delta numeric, reason text, note text) returns uuid`：在一個 transaction 內寫入多筆交易，回傳 batch_id。
- `apply_interest(student_id uuid, rate numeric) returns coin_transactions`：在資料庫端讀取餘額、計算利息並寫入。餘額 ≤ 0 時的處理和小數規則 ⏳ 待朋友確認（預設：不計利息；保留到小數兩位）。
- `void_batch(batch_id uuid)` 和 `restore_batch(batch_id uuid)`：整批作廢與復原。

### 5.5 作業小管家

**`homework_assignments`**
| 欄位 | 型別 | 說明 |
|---|---|---|
| class_id | uuid fk | |
| item_id | uuid fk → homework_items | |
| note | text | 例：P.12、第3課、訂正 |
| assigned_date | date not null | |
| status | text check in ('open','archived') | 「封存＋清空」改為 `archived` |
| archived_at | timestamptz | |
| deleted_at | timestamptz | 「直接清空」改為軟刪除 |
| source | text default 'manual' check in ('manual','planner') | **預留給 B** |
| planner_entry_id | uuid fk null → planner_entries | **預留給 B** |

**`homework_checks`**
| 欄位 | 型別 | 說明 |
|---|---|---|
| assignment_id | uuid fk | |
| student_id | uuid fk | |
| status | text check in ('done','missing') | |
| updated_at | timestamptz | |

- 主鍵：`(assignment_id, student_id)`
- **名單在建立作業時就固定下來**：RPC `create_assignment(item_id, note, assigned_date)` 在同一個 transaction 內，為當下所有在籍學生各建一筆 `missing`。日後轉入的學生不會出現在舊作業中，也不會被誤算為缺交。
- 數量上限：預設不限制 ⏳ 待朋友確認

### 5.6 課程規劃表

**`semesters`**
| 欄位 | 型別 | 說明 |
|---|---|---|
| class_id | uuid fk | |
| name | text | 例：115 上 |
| start_date | date | 預設 2026-08-31 |
| end_date | date | 預設 2027-01-20 |

**`semester_off_days`**
| 欄位 | 型別 | 說明 |
|---|---|---|
| semester_id | uuid fk | |
| date | date | |
| reason | text | 例：校慶補假 |

- 唯一鍵：`(semester_id, date)`。取代現行「逗號分隔日期」的文字欄位。

**`holidays`**（全站共用；任何登入者可讀，只能透過 migration 寫入）
| 欄位 | 型別 |
|---|---|
| date | date pk |
| name | text |

- 初始內容沿用現行程式內建的 2026／2027 國定假日。每學年由開發者以 migration 更新。

**`planner_columns`**
| 欄位 | 型別 | 說明 |
|---|---|---|
| key | text | 沿用現行欄位名稱，例：`國課練`、`國單元考`；路由規則以 key 判斷 |
| label | text | 表頭顯示文字 |
| group_name | text | 固定欄、國語核心、國語補充與複習、社會、其他 |
| kind | text | `calendar`、`period`、`course_zh`、`course_social`、`text`、`multiline` |
| item_id | uuid fk null → homework_items | **預留給 B**：這一欄對應主檔中的哪個項目 |
| sort_order | int | |
| in_summary | bool | 是否列入「當日作業總覽」（`備註` 為 false） |

- 初始 26 欄 = 4 個固定欄（重要行事曆、堂、國語課程進度、社會課程進度）+ 22 個作業欄，順序與分組沿用現行版本。「生字本」是否拆成甲本、乙本 ⏳ 待朋友確認。
- 第一版介面不開放編輯欄位。

**`planner_entries`**（**一格就是一筆資料**）
| 欄位 | 型別 | 說明 |
|---|---|---|
| semester_id | uuid fk | |
| date | date | |
| column_id | uuid fk | |
| value | text not null | 空字串時直接刪除這一列，不存空值 |

- 唯一鍵：`(semester_id, date, column_id)`；寫入一律使用 upsert。
- **不存任何推算出來的內容**：當日作業總覽、「明天考…」、自動帶入課堂進度的行，全部由前端即時計算（§8.4）。這也取代現行的 `__auto國單元考課程Lines` 等暫存欄位。

### 5.7 權限（RLS）

- 每張業務資料表都啟用 RLS，政策為：`using (owner_id = auth.uid()) with check (owner_id = auth.uid())`。
- 子表新增資料時另外檢查**父表也屬於同一位老師**，例如新增 `students` 時檢查 `class_id` 對應的 `classes.owner_id = auth.uid()`，防止把資料掛到別人的班級底下。
- `holidays`：`select` 開放給 `authenticated`，不開放寫入。
- RPC 一律使用 `security invoker`，以呼叫者的身分執行，受 RLS 約束。
- Auth 設定：關閉公開註冊（Disable signups）。

## 6. 資料安全

| 上次事故的成因 | 新設計 |
|---|---|
| `save()` 一次寫入整份資料，空資料會把一切覆寫掉 | **以格或筆為單位寫入**。程式碼中不存在「一次寫入全部」的操作；頁面載入只讀不寫 |
| 刪了就沒了 | 學生、交易、作業、座位表一律軟刪除 |
| 沒有版本紀錄 | `audit_log`：以 trigger 記錄所有業務表的 UPDATE 和 DELETE 前後內容 |
| 只有一個存放位置 | 每晚自動加密備份；設定頁提供手動「下載備份」 |
| 改版測試時碰到真實資料 | dev 和 prod 分開（D7） |

**`audit_log`**
| 欄位 | 型別 |
|---|---|
| owner_id | uuid |
| table_name | text |
| row_id | uuid |
| op | text（UPDATE／DELETE） |
| old_row | jsonb |
| new_row | jsonb |
| at | timestamptz |

- 只能新增，不能修改或刪除（RLS 只開放 `select` 給 owner，寫入由 `security definer` trigger 處理）。
- 第一版沒有「瀏覽變更紀錄」的介面。資料需要救援時，由開發者查詢 `audit_log` 處理。

**大範圍的破壞性操作**，例如清空整學期規劃表、刪除整張座位表：需要輸入確認文字（ConfirmByTyping），而且仍然是軟刪除。

## 7. 畫面架構與導覽

### 7.1 路由

```
/login
/homework              作業小管家：今日作業（登入後的預設首頁）
/homework/missing        缺交總覽
/homework/history        學生歷程
/coins                 MUMU 幣：全班總覽
/coins/new               加扣幣
/coins/history           全班歷程
/coins/student/:id       個別帳戶
/seating               座位表（目前這一張）
/seating/:layoutId/print 列印版
/planner               課程規劃表
/settings              學生名單、作業項目主檔、班級、下載備份、登出
```

- 第一版只有一個班，網址不帶班級代碼；元件內部一律帶 `classId`，日後在網址前加上 `/c/:classId` 即可支援多班級。

### 7.2 版面

- **寬度 ≥ 768px**：左側固定選單（作業小管家、MUMU 幣、座位表、課程規劃、設定），頂端顯示班級名稱與儲存狀態。
- **寬度 < 768px**：底部分頁列，沿用作業小管家現行手機版的形式；頂端顯示模組名稱與儲存狀態。

| 模組 | 主要裝置 |
|---|---|
| 作業小管家 | 手機優先 |
| MUMU 幣 | 手機和電腦都要好用 |
| 座位表 | 電腦或 iPad |
| 課程規劃表 | 電腦優先；手機上可以左右滑動，但不特別設計 |

### 7.3 全站共用的操作設計

- **SaveStatus**（右上角）：`● 已儲存`、`◌ 儲存中…`、`⚠ 有 N 筆未儲存，點此重試`。
- **寫入失敗的欄位標紅框**，輸入的內容保留在畫面上。
- **UndoToast**：作廢或刪除後，畫面下方顯示「已作廢 1 筆交易 · 復原」約 8 秒。
- **ConfirmByTyping**：大範圍破壞性操作專用。

## 8. 各模組要保留的功能

以下是現行工具中**必須保留**的行為，實作時逐項對照。

### 8.1 作業小管家
- 建立作業：用依科目分組的下拉選單選擇簿本，再加上備註（頁數、課次、訂正）。標題 = 簿本｜備註。
- 手機版：上方用橫向分頁切換進行中的作業；學生卡片排兩欄，點一下切換交了或沒交；顯示「已交 X / 30・缺 Y」。
- 電腦版：表格檢視，列是學生、欄是作業；有缺交的學生姓名以醒目色標示。
- 批次輸入座號：支援 `1,2,3,4`、`1-4,6,8-12`，以及全形逗號、頓號、空白分隔；不存在的座號（例如 5、7 號）自動忽略。
- 「直接清空」：軟刪除，不計入歷程。「封存＋清空」：改為 archived，計入歷程。
- 缺交總覽：選擇一份作業，以大字卡片列出未交的學生；全交時顯示「全班完成」。
- 學生歷程：作業總數、完成、缺交、完成率，以及逐筆紀錄。

### 8.2 MUMU 幣
- 全班總覽：全班總額、今日存入、今日扣除；學生卡片顯示餘額，負數以紅色顯示；點卡片進入個別帳戶。
- 卡片上的快捷按鈕：＋1000、－1000、＋5% 利息。處理方式 ⏳ 待朋友確認（預設：保留，搭配復原提示）。
- 加扣幣：可多選學生（全選、清除），選擇存款或扣款，選擇金額，選擇理由（依分組），填寫補充說明；一次送出，每位學生各自留下一筆紀錄。
- 全班歷程：搜尋（學生、理由、補充）、依學生或類型篩選、作廢（取代現行的刪除）、匯出 CSV（UTF-8 BOM，欄位與現行相同）。
- 個別帳戶：餘額、累積存款、累積扣款、交易筆數、個人歷程；「替此學生加扣幣」按鈕。
- 名單管理移到設定頁。

### 8.3 座位表
- 5 × 6 版面，黑板在上方，組別標示從右到左為第一組到第六組。
- 每個座位用下拉選單選學生；已安排的學生不會出現在其他座位的選單中；不允許重複安排。
- 組長：每一組只能有一位，勾選新的組長時，原組長自動取消。
- 隨機排座位、全部清空（需要確認）、未安排學生清單。
- **列印**：A4 直式單頁；只印黑板、組別和座位；姓名放大，姓名下方以小字標示「組長」，並保留手寫空白區。沿用現行版本已調好的列印 CSS 尺寸。
- 新增功能：可以另存為新的座位表、切換「目前座位表」，保留歷次版本。

### 8.4 課程規劃表
- 設定學期開始日、結束日、自訂不上課日；依此產生所有平日。國定假日和自訂不上課日也會顯示並標示「不上課」，但只能填行事曆，不計入上學日。
- 週次由週一推算；週一的那一列上方加粗線。
- 左側 6 欄固定：週次、日期、重要行事曆、當日作業總覽、堂、課堂進度（國語、社會兩行）。
- 表頭兩層，分組與顏色沿用現行版本。
- 跳到月份或週次，跳過去的那一列短暫高亮。
- 在單行欄位按 Enter，會跳到下一個上學日的同一欄。多行欄位自動長高。
- 匯出 CSV（欄位與現行相同，作業總覽為推算結果）。列印：A3 橫式。
- 摘要：上學日天數、週數、學期內國定假日天數。

**推算規則**（全部放在 `features/planner/logic/`，以現行程式行為和老師的回條作為測試案例）

以下所說的「有數字」，判斷方式是內容符合 `/[0-9０-９一二三四五六七八九十百零]/`。「訂簽」是指內容包含「訂簽」兩個字。多行欄位以換行、`；` 或 `;` 分成多個項目，每個項目分別判斷。

| 規則 | 條件 | 結果 |
|---|---|---|
| R1 國課練、字詞本 | 有數字且不含訂簽 | 國語課程進度加一行「國課練：{值}」；不列入作業總覽 |
| | 其他情況 | 列入作業總覽「國課練｜{值}」 |
| R2 詩選 | 「背」＋數字（例：背12） | 只列入作業總覽 |
| | 只有數字（例：12、12-13） | 只帶入國語課程進度「詩選：{值}」 |
| | 其他文字 | 兩邊都列（沿用舊版） |
| R3 字詞考（多行） | 項目有數字且不含訂簽 | 當天國語課程進度「字詞考：{項目}」；**前一個上學日**的作業總覽加上「週{X}考國{項目}字詞考」（X 為考試當天的星期） |
| | 其他情況 | 當天作業總覽「字詞考｜{項目}」 |
| R4 國單元考（多行） | 同 R3 | 當天國語課程進度「考{項目}」；前一個上學日「週{X}考國{項目}單元考」 |
| R5 社單元考（多行） | 同 R3 | 當天社會課程進度「考{項目}」；前一個上學日「週{X}考社{項目}單元考」 |
| R6 其他作業欄 | 有內容且 `in_summary` | 作業總覽「{欄名}｜{值}」；備註不列入 |
| R7 課程進度欄 | — | 畫面顯示 = 老師手打的內容 + R1 到 R5 推算出來的行（附加在後面，以不同樣式區分）。資料庫只存老師手打的部分 |

- 老師確認：「有數字就算進度」維持不變（字詞本填 `P.12` 也算進度）；提醒一律寫出星期，取代舊版的「明天考」。
- R7 改變了現行做法：現行版本會把自動產生的行寫回儲存的資料；新版只在畫面上合併顯示，避免資料被污染。

## 9. 錯誤處理

| 情境 | 處理方式 |
|---|---|
| 作業打勾、規劃表格子、座位選擇 | **樂觀更新**：畫面立即反映，背景寫入；失敗時還原畫面、標紅框、SaveStatus 顯示可重試 |
| MUMU 幣交易、利息 | **等伺服器確認**後才更新畫面；送出期間按鈕停用，避免連點重複送出 |
| 寫入失敗（網路或伺服器） | TanStack Query 自動重試 2 次；仍失敗就保留在未儲存佇列中，使用者點 SaveStatus 重試 |
| 登入過期、RLS 拒絕 | 導向 `/login?next=原路徑`，尚未儲存的佇列保留在記憶體中；重新登入後自動重送 |
| 約束衝突（重複座號、同組兩位組長） | 依約束名稱對應成中文訊息，例如「這位學生已經安排座位」 |
| 規劃表多格快速輸入 | 每一格各自 debounce 約 400ms 再 upsert；不同格之間互不阻塞 |

## 10. 測試策略

| 層級 | 工具 | 範圍 |
|---|---|---|
| 單元 | Vitest | R1 到 R7 推算規則（以現行程式行為建立案例表）；批次座號解析；組別推算；組長唯一性；利息計算與小數處理；上學日、週次、國定假日計算；CSV 輸出 |
| 資料庫 | Supabase CLI + SQL 測試 | **RLS 隔離**：A 帳號無法讀寫 B 帳號的任何資料表；子表不能掛到他人的父表；`create_assignment` 會為每位在籍學生建立紀錄；`apply_interest` 的計算；`audit_log` 有被寫入 |
| 端對端 | Playwright | 在 iPhone 尺寸畫面下清點作業並批次勾選；加扣幣、作廢、復原；排座位與列印頁版面；規劃表填格、重新整理後資料仍在；模擬斷線時顯示未儲存並可重試 |
| CI | GitHub Actions | 每個 PR 都跑 lint、型別檢查、單元測試、build；資料庫測試在本機 Supabase（Docker）上執行 |

**規劃表推算規則的遷移方法**：先把舊版的 `getHomeworkSummaryItems`、`syncChineseCourseFromHomework`、`syncSocialCourseFromExam` 的實際輸出整理成測試案例表，再實作新的純函式並跑過這些案例。這樣新舊版本的行為差異只會來自老師在回條中要求的修改。

## 11. 環境、部署、備份

### 11.1 環境

| | dev | prod |
|---|---|---|
| Supabase 專案 | `mumu-class-dev` | `mumu-class-prod` |
| 使用者 | 開發者和老師在本機開發、Netlify PR 預覽 | 正式站 |
| 資料 | `seed.sql` 假資料 | 真實的 311 班資料 |
| Migration | 開發者在本機以 `supabase db push` 套用 | 合併到 main 之後，由開發者手動套用（第一版不自動化） |

- 機房區域：東京或新加坡，選延遲較低的一個。
- Netlify 環境變數：Production context 使用 prod 的 URL 和 anon key；Deploy Preview 與 Branch deploy context 使用 dev 的。
- `service_role` key 只放在 GitHub Secrets（備份用）和各人的 `.env.local`，絕不進 repo，也不給前端使用。

### 11.2 協作流程

```
本機修改（連 dev）→ push 分支 → 開 PR
  → CI 通過 ＋ Netlify 預覽網址（連 dev）→ 兩人試用
  → 合併到 main → Netlify 自動部署正式站
  → 如果有 migration：開發者套用到 prod
```

- `main` 分支設定保護：必須經過 PR，而且 CI 要通過。
- 有 migration 的 PR，PR 描述中要附上「套用到 prod 的步驟」。

### 11.3 備份

- `backup.yml`：每天台灣時間 03:00 執行。用 `service_role` 把 prod 的所有業務表匯出成 JSON，以 `age` 公鑰加密後上傳為 GitHub Actions artifact，保留 90 天。
- 私鑰由開發者和老師各自離線保存，不進 GitHub。
- 這個排程同時兼作 Supabase 免費方案的活動訊號，避免寒暑假時專案被暫停。上線後要確認它真的有這個效果；如果沒有，就另外加一個輕量查詢。
- 設定頁的「下載備份」：匯出目前登入者的所有資料成 JSON（明文，存在老師的裝置上）。

### 11.4 舊系統下架
- 新站的作業小管家上線後，把 `mumu-homework` 站換成轉址頁，指向新網址；轉址頁中不含任何名單。
- 老師在 iPhone 上重新「加入主畫面」。

## 12. 分階段交付

每個階段都可以單獨上線，各自走一次「計畫 → 實作 → 驗證」。

| 階段 | 內容 | 上線後老師得到什麼 |
|---|---|---|
| **P0 地基** | repo、Vite 骨架、兩個 Supabase 專案、核心 migration（classes、students、homework_items、holidays、audit_log、RLS）、登入、App 版面（側欄、底部分頁、SaveStatus、UndoToast）、設定頁（名單、作業項目、下載備份）、CI、Netlify、每晚備份 | 可以登入，管理名單與作業項目 |
| **P1 作業小管家** | §5.5、§8.1；下架舊的 Netlify 站 | 每天在用的工具不再只存在手機裡 |
| **P2 課程規劃表** | §5.6、§8.4；**評估 B 是否一起做** | 已經掉過一次資料的工具有了保障 |
| **P3 MUMU 幣** | §5.4、§8.2 | |
| **P4 座位表** | §5.3、§8.3 | |

- 順序依回條第 6 項可以調整；上表是預設順序。⏳ 待朋友確認
- **B：規劃表 → 作業小管家**（在 P2 完成時評估）：在規劃表的作業欄（`item_id` 不為 null）填寫內容後，可以一鍵或自動在小管家產生對應日期的作業（`source = 'planner'`、`planner_entry_id`）。規則細節到時候再設計；資料模型已經不需要修改。

## 13. 老師的回條（2026-10-07 回覆）

| # | 項目 | 回覆 | 落實方式 |
|---|---|---|---|
| 1 | 作業項目統一 | 生字本拆成甲本、乙本（規劃表也拆成兩欄）；國複習卷→國複卷；社複習卷→社複卷；考本＝字詞考；小管家新增國預習單、寫作、閱達、成易、社重、字詞考 | `src/lib/defaults.ts` 預設項目與規劃表欄位；建立班級時依名稱填入 `planner_columns.item_id` |
| 2 | 規劃表推算規則 | R1、R3–R6 照舊；詩選改為「背＋數字是作業、只有數字是進度」；提醒寫出星期 | §8.4、`rules.ts` 與測試 |
| 3 | MUMU 幣快捷按鈕 | 保留，搭配「復原」 | 已是預設 |
| 4 | 利息 | 餘額 ≤ 0 不計息；保留到小數兩位 | 已是預設（`apply_interest`） |
| 5 | 作業數量 | 不限制 | 已是預設 |
| 6 | 上線順序 | 課程規劃表 → 座位表 → 作業小管家 → MUMU 幣 | 初版四個模組同時上線，之後的修正依此優先 |
| 7 | 學校規定 | 不確定；老師提議可只存遮蔽後的姓名（如「陳O聖」）、不存英文名、保留座號 | 系統已支援：英文名可空白，姓名照老師輸入的內容儲存；建立班級頁面加上提示 |

未答：舊清單中的形音義小達人、邏輯數學、能力數學、詩詞經選是否還要用（預設不加入，可在設定頁自行新增）；其他新增或改名的簿本。

## 14. 風險

| 風險 | 對策 |
|---|---|
| Supabase 免費方案的政策（暫停、備份、限額）改變 | 每晚自行備份；資料量很小，必要時升級成本可控（價格以官網為準） |
| 學校不允許學生資料放在校外雲端 | 回條第 7 項先確認；名單只存座號和姓名 |
| 推算規則遷移後行為不一致 | 以舊程式的實際輸出建立測試案例表（§10） |
| iOS 主畫面 App 的登入狀態遺失 | 使用 Email 加密碼、延長 session；E2E 測試涵蓋重新登入的流程 |
| 兩人協作時 migration 不一致 | migration 進版本控管；PR 描述附套用步驟；prod 只由開發者套用 |
| 免費專案寒暑假被暫停 | 每晚備份排程兼作活動訊號，上線後驗證 |
