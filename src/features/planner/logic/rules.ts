/**
 * 課程規劃表的推算規則（設計文件 §8.4 R1–R7），由舊版 v22 程式行為移植。
 * 只讀不寫：輸入是老師填寫的格子，輸出是畫面上顯示的推算內容。
 */
export type DayValues = Record<string, string | undefined>;
export type SummaryItem = { label: string; text: string; plain: boolean };

const NUM = /[0-9０-９一二三四五六七八九十百零]/;
const SIGN = /訂簽/;

export function splitEntries(value: string | undefined): string[] {
  return String(value ?? "").split(/\r?\n|[；;]/).map((x) => x.trim()).filter(Boolean);
}

/** 有數字且不含訂簽 → 算課堂進度；否則算作業 */
export function goesToCourse(raw: string): boolean {
  return !SIGN.test(raw) && NUM.test(raw);
}

/** 舊版作業欄的順序（「備註」不列入作業總覽） */
export const HOMEWORK_KEYS = [
  "國預習單", "生字本", "國習", "國簿", "國白卷", "字詞本", "字詞考", "國課練", "國單元考",
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
  const poem = String(day["詩選"] ?? "").trim();
  if (poem) lines.push(`詩選：${poem}`);
  splitEntries(day["字詞考"]).filter(goesToCourse).forEach((x) => lines.push(`字詞考：${x}`));
  splitEntries(day["國單元考"]).filter(goesToCourse).forEach((x) => lines.push(`考${x}`));
  return lines;
}

/** R5：自動帶入「社會課程進度」的行 */
export function autoCourseSocial(day: DayValues): string[] {
  return splitEntries(day["社單元考"]).filter(goesToCourse).map((x) => `考${x}`);
}

/** 當日作業總覽：當天的作業項目，加上下一個上學日的考試提醒 */
export function summaryItems(day: DayValues, nextDay: DayValues | null): SummaryItem[] {
  const items: SummaryItem[] = [];
  for (const k of SUMMARY_KEYS) {
    const v = String(day[k] ?? "").trim();
    if (!v) continue;
    if (MULTI_EXAM.has(k)) {
      splitEntries(v).filter((x) => !goesToCourse(x)).forEach((x) => items.push({ label: k, text: x, plain: false }));
      continue;
    }
    if (SINGLE_STUDY.has(k) && goesToCourse(v)) continue;
    items.push({ label: k, text: v, plain: false });
  }
  if (nextDay) {
    splitEntries(nextDay["字詞考"]).filter(goesToCourse).forEach((x) => items.push({ label: "", text: `明天考國${x}字詞考`, plain: true }));
    splitEntries(nextDay["國單元考"]).filter(goesToCourse).forEach((x) => items.push({ label: "", text: `明天考國${x}單元考`, plain: true }));
    splitEntries(nextDay["社單元考"]).filter(goesToCourse).forEach((x) => items.push({ label: "", text: `明天考社${x}單元考`, plain: true }));
  }
  return items;
}

export function summaryText(items: SummaryItem[]): string {
  return items.map((x) => (x.plain ? x.text : `${x.label}｜${x.text}`)).join("；");
}
