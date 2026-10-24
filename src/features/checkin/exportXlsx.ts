import { useCallback, useState } from "react";
import { useToast } from "../../shared/Toast";
import type { Cell, ExportSheet } from "./logic/exportRows";

export type Sheet = ExportSheet;

/** 顯示寬度：中文字佔兩格 */
function width(v: Cell): number {
  const s = v === null ? "" : String(v);
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 255 ? 2 : 1;
  return w;
}

/** 欄寬依內容估，限制在 6–40 個字元之間 */
export function columnWidths(header: string[], rows: Cell[][]): number[] {
  return header.map((h, i) => Math.min(40, Math.max(6, width(h), ...rows.map((r) => width(r[i] ?? null))) + 2));
}

/** Excel 的工作表名稱最多 31 字，不能有 [ ] : * ? / \ */
const sheetName = (s: string) => s.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet1";

/** 產生 .xlsx 並下載。write-excel-file 只在這裡才載入，所以不在首次載入的大小裡（設計 §9） */
export async function downloadXlsx(filename: string, sheets: Sheet[]): Promise<void> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const data = sheets.map((s) => ({
    sheet: sheetName(s.sheet),
    data: [
      s.header.map((h) => ({ value: h, fontWeight: "bold" as const })),
      ...s.rows.map((r) => r.map((c) => (c === null ? null : c))),
    ],
    columns: columnWidths(s.header, s.rows).map((w) => ({ width: w })),
    stickyRowsCount: 1,
  }));
  await writeExcelFile(data).toFile(filename);
}

/** 匯出按鈕用：busy 期間按鈕停用；build 可以是非同步（要先去讀資料），任何一步失敗都 toast */
export function useXlsxExport() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (filename: string, build: () => Sheet[] | Promise<Sheet[]>) => {
    setBusy(true);
    try {
      await downloadXlsx(filename, await build());
    } catch {
      toast("匯出失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return { busy, run };
}
