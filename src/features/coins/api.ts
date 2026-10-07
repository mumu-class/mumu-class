import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, supabase } from "../../lib/supabase";
import type { CoinTx } from "../../lib/types";

const key = (classId: string) => ["coins", classId];

export function useTxs(classId: string) {
  return useQuery({
    queryKey: key(classId),
    queryFn: async () => {
      const rows = await must(supabase.from("coin_transactions").select("*").eq("class_id", classId)
        .order("created_at", { ascending: false }).limit(10000).returns<CoinTx[]>());
      return rows.map((t) => ({ ...t, delta: Number(t.delta) }));
    },
  });
}

/** 依交易紀錄計算每位學生的餘額（作廢的不算） */
export function balances(txs: CoinTx[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txs) if (!t.voided_at) m.set(t.student_id, Math.round(((m.get(t.student_id) ?? 0) + t.delta) * 100) / 100);
  return m;
}

/** 新增交易：等伺服器確認才更新畫面（不做樂觀更新） */
export function useRecord(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { studentIds: string[]; delta: number; reason: string; note: string }) => {
      const batch_id = crypto.randomUUID();
      await must(supabase.from("coin_transactions").insert(
        v.studentIds.map((student_id) => ({ class_id: classId, student_id, delta: v.delta, reason: v.reason, note: v.note, batch_id })),
      ));
      return batch_id;
    },
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: key(classId) }),
  });
}

export function useInterest(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => must(supabase.rpc("apply_interest", { p_student_id: studentId, p_rate: 0.05 })) as Promise<number>,
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: key(classId) }),
  });
}

/** 作廢或復原：依單筆 id 或整批 batch_id */
export function useVoid(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id?: string; batchId?: string; voided: boolean }) => {
      let q = supabase.from("coin_transactions").update({ voided_at: v.voided ? new Date().toISOString() : null });
      q = v.id ? q.eq("id", v.id) : q.eq("batch_id", v.batchId!);
      await must(q);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(classId) }),
  });
}
