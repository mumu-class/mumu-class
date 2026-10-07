/**
 * 課程規劃表的推算規則（設計文件 §8.4 R1–R7），由舊版 v22 程式行為移植。
 * 只讀不寫：輸入是老師填寫的格子，輸出是畫面上顯示的推算內容。
 */
export type DayValues = Record<string, string | undefined>;
export type SummaryItem = { label: string; text: string; plain: boolean };

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

/** 作業欄的順序（「備註」不列入作業總覽） */
export const HOMEWORK_KEYS = [
  "國預習單", "甲本", "乙本", "國習", "國簿", "國白卷", "字詞本", "字詞考", "國課練", "國單元考",
  "寫作", "閱達", "成易", "詩選", "國複卷",
  "社習", "社重", "社簿", "社白卷", "社複卷", "社單元考",
  "其他", "備註",
];
const SUMMARY_KEYS = HOMEWORK_KEYS.filter((k) => k !== "備註");
const MULTI_EXAM = new Set(["字詞考", "國單元考", "社單元考"]);
const SINGLE_STUDY = new Set(["國課練", "字詞本"]);

/** R1–R4：自動帶入「國語課程進度」的行 */
export function autoCourseZh(day: DayValues): string[] {
  const lines: string[] = [];
  for (const k of ["國課練", "字詞本"]) {
    const v = String(day[k] ?? "").trim();
    if (v && goesToCourse(v)) lines.push(`${k}：${v}`);
  }
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

/** 當日作業總覽：當天的作業項目，加上下一個上學日的考試提醒（寫出星期，例：週一考國L3字詞考） */
export function summaryItems(day: DayValues, next: NextDay | null): SummaryItem[] {
  const items: SummaryItem[] = [];
  for (const k of SUMMARY_KEYS) {
    const v = String(day[k] ?? "").trim();
    if (!v) continue;
    if (MULTI_EXAM.has(k)) {
      splitEntries(v).filter((x) => !goesToCourse(x)).forEach((x) => items.push({ label: k, text: x, plain: false }));
      continue;
    }
    if (SINGLE_STUDY.has(k) && goesToCourse(v)) continue;
    if (k === "詩選") {
      splitEntries(v).filter((x) => poemRoute(x) !== "course").forEach((x) => items.push({ label: k, text: x, plain: false }));
      continue;
    }
    items.push({ label: k, text: v, plain: false });
  }
  if (next) {
    const when = `週${WEEKDAY[next.dow]}考`;
    splitEntries(next.vals["字詞考"]).filter(goesToCourse).forEach((x) => items.push({ label: "", text: `${when}國${x}字詞考`, plain: true }));
    splitEntries(next.vals["國單元考"]).filter(goesToCourse).forEach((x) => items.push({ label: "", text: `${when}國${x}單元考`, plain: true }));
    splitEntries(next.vals["社單元考"]).filter(goesToCourse).forEach((x) => items.push({ label: "", text: `${when}社${x}單元考`, plain: true }));
  }
  return items;
}

export function summaryText(items: SummaryItem[]): string {
  return items.map((x) => (x.plain ? x.text : `${x.label}｜${x.text}`)).join("；");
}
