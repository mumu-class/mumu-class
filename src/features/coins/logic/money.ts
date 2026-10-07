export const AMOUNTS = [1, 5, 10, 50, 100, 500, 1000];

export const REASON_GROUPS: { label: string; reasons: string[] }[] = [
  { label: "銀行", reasons: ["存款", "提款", "利息"] },
  { label: "環境與整理", reasons: ["座位", "書櫃", "地板", "抽屜", "上課", "書包"] },
  { label: "獎勵", reasons: ["西瓜大賞", "幹部獎勵", "展覽獎金"] },
  { label: "生活", reasons: ["午休好好睡", "午餐吃光光", "運動好健康"] },
  { label: "學習", reasons: ["作業未完成", "簿本未簽名", "好棒印章"] },
];

export function fmt(n: number | string): string {
  return Number(n).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

export function signed(n: number | string): string {
  const v = Number(n);
  return (v >= 0 ? "+" : "") + fmt(v);
}

export function isToday(iso: string, now = new Date()): boolean {
  const a = new Date(iso);
  return a.getFullYear() === now.getFullYear() && a.getMonth() === now.getMonth() && a.getDate() === now.getDate();
}

/** 產生含 BOM 的 CSV（Excel 可直接開啟中文） */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
