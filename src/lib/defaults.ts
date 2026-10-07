/**
 * 新班級建立時預先放入的作業項目（老師回條 2026-10-07）：
 * 國複習卷→國複卷、社複習卷→社複卷、考本→字詞考；加入規劃表才有的國預習單、寫作、閱達、成易、社重。
 */
export const DEFAULT_ITEMS: Record<string, string[]> = {
  國語: ["國課本", "國預習單", "甲本", "乙本", "國習", "國簿", "國課練", "想想本", "字詞本", "字詞考", "國單元考", "國白卷", "國複卷", "寫作", "閱達", "成易"],
  數學: ["數祕本", "數考卷", "課綱數卷", "數複習卷"],
  自然: ["自綠本", "自黃本", "自紅本", "自小考卷", "自複習卷"],
  社會: ["社課本", "社隨", "社簿", "社習", "社重", "社單元考", "社白卷", "社複卷"],
  其他: ["聯絡簿", "回條", "閱讀認證", "詩選", "背詩選", "讀經護照"],
};

type Col = { key: string; label: string; group_name: string; kind: string; in_summary: boolean };
const hw = (group_name: string, keys: string[], multi: string[] = []): Col[] =>
  keys.map((key) => ({
    key,
    label: key === "國單元考" || key === "社單元考" ? "單元考" : key,
    group_name,
    kind: multi.includes(key) ? "multiline" : "text",
    in_summary: key !== "備註",
  }));

/** 課程規劃表的欄位（沿用 v22 的順序與分組；生字本依回條拆成甲本、乙本） */
export const DEFAULT_PLANNER_COLUMNS: Col[] = [
  { key: "重要行事曆", label: "重要行事曆", group_name: "固定", kind: "calendar", in_summary: false },
  { key: "堂", label: "堂", group_name: "固定", kind: "period", in_summary: false },
  { key: "國語課程進度", label: "國語", group_name: "固定", kind: "course_zh", in_summary: false },
  { key: "社會課程進度", label: "社會", group_name: "固定", kind: "course_social", in_summary: false },
  ...hw("國語｜核心", ["國預習單", "甲本", "乙本", "國習", "國簿", "國白卷", "字詞本", "字詞考", "國課練", "國單元考"], ["字詞考", "國單元考"]),
  ...hw("國語｜補充與複習", ["寫作", "閱達", "成易", "詩選", "國複卷"]),
  ...hw("社會", ["社習", "社重", "社簿", "社白卷", "社複卷", "社單元考"], ["社單元考"]),
  ...hw("其他", ["其他", "備註"]),
];

export const DEFAULT_SEMESTER = { name: "115 上", start_date: "2026-08-31", end_date: "2027-01-20" };
