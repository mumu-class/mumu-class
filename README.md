# MuMu 班級工作台

把「作業小管家」「MUMU 幣銀行」「座位表」「整學期課程進度規劃表」四個工具合併成一個需要登入的網站，資料存在 Supabase，不再依賴瀏覽器的 localStorage。

- 設計文件：[docs/superpowers/specs/2026-10-07-mumu-class-workbench-design.md](docs/superpowers/specs/2026-10-07-mumu-class-workbench-design.md)
- 技術：React + TypeScript + Vite、TanStack Query、Tailwind CSS、Supabase（Postgres、Auth、RLS）、Netlify

## 第一次部署

### 1. Supabase

1. 在 [supabase.com](https://supabase.com) 建立專案，區域選 **Tokyo**。
2. 套用資料庫結構，以下兩種方法擇一：
   - **SQL Editor**：把 `supabase/migrations/20261007120000_init.sql` 的內容整份貼上，按 Run。
   - **CLI**：`supabase link --project-ref <專案代碼>`，然後執行 `supabase db push`。
3. 到 **Authentication → Sign In / Providers**，關閉「Allow new users to sign up」。
4. 到 **Authentication → Users → Add user**，替老師建立帳號（Email 加密碼，勾選 Auto Confirm User）。
5. 到 **Project Settings → API**，記下 Project URL 和 anon key（新專案稱為 publishable key）。

### 2. Netlify

1. Add new site → Import from Git → 選擇這個 GitHub repo。建置設定會自動讀取 `netlify.toml`。
2. Site configuration → Environment variables，新增以下兩個變數：
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon key（publishable key）
3. 重新部署（Deploys → Trigger deploy）。

### 3. 第一次登入

用老師的帳號登入後，會出現「建立班級」頁面。貼上學生名單即可，每行一位，格式是 `座號 中文名 英文名`。系統會自動建立預設的作業項目、課程規劃表欄位、學期和座位表。

> 名單只存在資料庫裡，**不要**寫進程式碼或 commit 到 repo。

### 4. 每晚自動備份（可以之後再設定）

1. 在本機產生一組加密金鑰：`age-keygen -o mumu-backup.key`。私鑰檔案請離線保管，不要放進 GitHub。
2. GitHub repo → Settings → Secrets and variables → Actions：
   - Secrets：`PROD_SUPABASE_URL`、`PROD_SUPABASE_SERVICE_ROLE_KEY`
   - Variables：`BACKUP_AGE_RECIPIENT` = 金鑰檔裡 `# public key:` 後面那一串
3. 到 Actions 頁面，手動執行一次「Nightly backup」確認可以成功。備份檔會以 artifact 保存 90 天。
4. 需要還原時，先下載 artifact，再執行 `age -d -i mumu-backup.key backup-日期.json.age > backup.json` 解密。

## 本機開發

```bash
npm install
cp .env.example .env.local   # 填入 dev 專案或本機 Supabase 的 URL 與 anon key
npm run dev
```

本機 Supabase（需要 Docker）：

```bash
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta,mailpit
supabase status            # 取得本機的 API URL 和 anon key
```

## 測試

```bash
npm test                   # 單元測試：規劃表推算規則、批次座號、座位、金額
./scripts/db-test.sh       # 資料庫測試：RLS 隔離、RPC（需要 Homebrew 的 postgresql，不需要 Docker）
npm run typecheck
```

## 協作規則

- `main` 分支會自動部署到正式站，修改一律走 PR。Netlify 會為每個 PR 產生預覽網址。
- **PR 預覽要連到 dev 的 Supabase 專案，不能連正式資料庫**：在 Netlify 的環境變數中，把 Deploy Previews context 設成 dev 專案的值。
- 有資料庫結構變更時，在 `supabase/migrations/` 新增檔案，不要修改已經套用過的檔案；並在 PR 描述中寫明套用到 prod 的步驟。
- 舊版單檔 HTML 放在 `legacy/`，已被 `.gitignore` 排除，因為裡面有真實學生名單。
