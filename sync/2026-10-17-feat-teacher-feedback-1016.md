# 2026-10-17 feat/teacher-feedback-1016 — 老師回饋（規劃表＋小管家）已實作完成並在本機實測，待 Safari 確認、push、開 PR、prod 先套 migration

## Focus
依老師 2026-10-16 回饋調整課程規劃表與作業小管家。設計：`docs/superpowers/specs/2026-10-16-teacher-feedback-planner-homework-design.md`；計畫（未勾選項＝剩餘工作）：`docs/superpowers/plans/2026-10-16-teacher-feedback-planner-homework.md`。

## Done
- `57d6dd5` migration `20261016120000_teacher_feedback.sql`：`planner_columns.hidden`、`homework_assignments.sort_order`、升級函式 `upgrade_planner_columns_20261016()`（隱藏堂／備註、新增數學／自然／其他考試、重排）；DB 測試 `supabase/tests/teacher_feedback_20261016.sql`。
- `f3e24f7` 型別與新班級預設欄位（`src/lib/types.ts`、`src/lib/defaults.ts`）。
- `1e441ec` `rules.ts`：作業總覽回傳 `{ homework, sign }`、所有欄位逐項判斷、R8 其他考試在前一個上學日預告。
- `71a2f37`／`52c378a` 規劃表：電腦固定週次＋日期＋作業總覽、手機只固定「第N週＋日期」；作業格改自動長高文字框（Enter 跳下一上學日、Alt/Shift+Enter 換行、忽略輸入法選字）；隱藏欄不顯示；CSV 拆作業總覽／訂簽總覽、移除堂。
- `a166557`／`e085630`／`638e009` 小管家：`logic/order.ts`（`sortOpen`／`moveItem`／`missingByStudent`）、今日作業 ◀ ▶ 排序（寫 sort_order 1..n）、缺交總覽「依作業／依學生」。
- `src/app/Layout.tsx`：電腦版左側選單可收合成圖示窄欄（«／»，存在 localStorage `mumu.sidebar`）；課程規劃頁移除 `max-w-6xl` 限制。1440px 寬實測：展開時規劃表可視寬 1168px、收合時 1312px（原本上限約 1100px）；其他頁仍為 1152px。
- 驗證：`npm run typecheck`、`npm test`（57 passed）、`npm run build`、`./scripts/db-test.sh`（兩組 PASSED）全過。本機 Supabase 已套用新 migration，內建瀏覽器實測電腦與手機寬度的規劃表、◀ ▶ 重新整理後保存、依學生缺交皆正確。

## Blocker / WIP
- **部署順序（硬性）**：前端 `src/features/homework/api.ts:useAssignments` 會 select `sort_order`、`PlannerPage.tsx` 讀 `hidden`。若先合併（Netlify 自動部署）再套 migration，小管家會讀取失敗。必須**先在 prod SQL Editor 套 `20261016120000_teacher_feedback.sql`，再合併**（migration 只加欄位，舊前端不受影響）。PR 描述範本在計畫 Task 10。
- **未實測**：`PlannerRow.tsx:cellKeys` 用 `isComposing || keyCode === 229` 擋注音選字 Enter，只在 Chromium 測過；老師用 Mac，Safari 尚未確認。CSV 實際下載未測（只做程式審查）。計畫 Task 9 Step 3、Step 6（效能：約 100 列 × 28 個文字框，未刻意壓測）仍未勾。
- **既有疑似問題（未確認是否本分支引入）**：主控台有 React 警告「Cannot update a component (SaveStatus) while rendering (HomeworkToday)」。推測來源：TanStack `MutationObserver` 建構時（`useMutation` 的 `useState` 初始化，在 render 中）呼叫 `setOptions` → mutation cache `notify` → `src/shared/SaveStatus.tsx` 的 `cache.subscribe(count)` 在別的元件 render 中 `setFailed`。HomeworkToday 在 main 上已有 3 個 `useMutation`，應為既有問題；想用 main 對照時被權限擋下，尚未驗證。
- 尚未 push、尚未開 PR（需使用者同意）。

## Files
- 已提交（相對 main）：`supabase/migrations/20261016120000_teacher_feedback.sql`、`supabase/tests/teacher_feedback_20261016.sql`、`src/lib/types.ts`、`src/lib/defaults.ts`、`src/features/planner/{PlannerRow,PlannerPage}.tsx`、`src/features/planner/logic/rules{,.test}.ts`、`src/features/homework/{api.ts,HomeworkToday.tsx,HomeworkMissing.tsx}`、`src/features/homework/logic/order{,.test}.ts`、兩份 docs。
- 本次交接新增：`SYNC.md`、`sync/2026-10-17-feat-teacher-feedback-1016.md`；計畫檔勾選已完成步驟。
- 本機環境（不進 git）：`.env.local` 末尾記有本機 Supabase 測試帳號 `claude-qa@mumu.test`（只存在本機資料庫，班級為 4 位假學生）；原本的本機帳號 `teacher@mumu.test` 未動。Docker Desktop 與本機 Supabase 正在執行。

## Branch
feat/teacher-feedback-1016
