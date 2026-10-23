export type Page<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * 分頁讀完整張結果。PostgREST 一次最多回傳 max_rows 列（正式站至少 1000），超過的會被靜默截掉，
 * 所以不能只靠 .limit()。page(from, to) 要回傳依唯一鍵排序、加上 .range(from, to) 的查詢；
 * 讀到空頁才停，即使 max_rows 比 size 小也能讀完。
 */
export async function fetchAll<T>(page: Page<T>, size = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + size - 1);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
  }
}
