import { createClient } from "@supabase/supabase-js";

/** 只保留專案網址本身：填成 REST URL（…/rest/v1）或結尾多了斜線時自動修正 */
export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  return v.replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || "http://localhost:54321", key || "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** 把 supabase 回傳的 { data, error } 轉成丟例外，方便給 TanStack Query 使用 */
export async function must<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw error;
  return data as NonNullable<T>; // 沒有 select 的寫入會回傳 null，呼叫端不會使用它
}

/** 分頁讀完全部資料。Supabase 一次最多回 1000 列（max_rows），超過的會被直接截掉、不會報錯；呼叫端要用唯一的欄位排序 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const data = await must(page(from, from + size - 1));
    rows.push(...data);
    if (data.length < size) return rows;
  }
}
