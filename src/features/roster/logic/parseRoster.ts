export type RosterLine = { student_no: number; name_zh: string; name_en: string | null };

/**
 * 把貼上的名單轉成資料。每行一位：座號 中文名 英文名（英文名可省略、可含空白）。
 * 分隔可用空白、Tab、逗號、｜。回傳成功解析的行與無法解析的行號（從 1 起算）。
 */
export function parseRoster(text: string): { rows: RosterLine[]; errors: number[] } {
  const rows: RosterLine[] = [];
  const errors: number[] = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const m = t.match(/^(\d+)[\s,，|｜\t.、號]+(\S+?)(?:[\s,，|｜\t]+(.+))?$/);
    if (!m) { errors.push(i + 1); return; }
    rows.push({ student_no: Number(m[1]), name_zh: m[2], name_en: m[3]?.trim() || null });
  });
  return { rows, errors };
}
