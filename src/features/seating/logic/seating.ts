/** 組號：最右邊一欄是第一組（與舊版座位表一致）。col 從 0 起算、由左往右。 */
export function groupNo(col: number, cols: number): number {
  return cols - col;
}

export const GROUP_NAMES = ["第一組", "第二組", "第三組", "第四組", "第五組", "第六組", "第七組", "第八組", "第九組", "第十組"];

export function groupName(col: number, cols: number): string {
  return GROUP_NAMES[groupNo(col, cols) - 1] ?? `第${groupNo(col, cols)}組`;
}

export type SeatPos = { row: number; col: number };

/** 依列優先（左到右、前到後）列出所有座位 */
export function allSeats(rows: number, cols: number): SeatPos[] {
  const out: SeatPos[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ row: r, col: c });
  return out;
}

/** 隨機排座位：回傳每個座位對應的學生 id（學生比座位少時其餘為 null） */
export function randomAssign(studentIds: string[], rows: number, cols: number, rand: () => number = Math.random): (SeatPos & { student_id: string | null })[] {
  const ids = [...studentIds];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return allSeats(rows, cols).map((p, i) => ({ ...p, student_id: ids[i] ?? null }));
}
