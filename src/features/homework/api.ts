import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAll } from "../../lib/fetchAll";
import { must, supabase } from "../../lib/supabase";
import type { Assignment } from "../../lib/types";

const key = (classId: string) => ["assignments", classId];

export function useAssignments(classId: string) {
  return useQuery({
    queryKey: key(classId),
    queryFn: () =>
      fetchAll((from, to) =>
        supabase.from("homework_assignments")
          .select("id,class_id,item_id,note,assigned_date,sort_order,status,archived_at,created_at,homework_checks(student_id,status)")
          .eq("class_id", classId).is("deleted_at", null)
          .order("assigned_date", { ascending: false }).order("created_at", { ascending: false }).order("id")
          .range(from, to)
          .returns<Assignment[]>(),
      ),
  });
}

/** 打勾／取消：樂觀更新，失敗時還原 */
export function useSetChecks(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { assignmentId: string; studentIds: string[]; status: "done" | "missing" }) => {
      await must(supabase.from("homework_checks")
        .update({ status: v.status })
        .eq("assignment_id", v.assignmentId).in("student_id", v.studentIds));
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key(classId) });
      const prev = qc.getQueryData<Assignment[]>(key(classId));
      qc.setQueryData<Assignment[]>(key(classId), (list) => list?.map((a) => a.id !== v.assignmentId ? a : {
        ...a,
        homework_checks: a.homework_checks.map((c) => v.studentIds.includes(c.student_id) ? { ...c, status: v.status } : c),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key(classId), ctx.prev); },
  });
}

export function useCreateAssignment(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { itemId: string; note: string; date: string }) =>
      must(supabase.rpc("create_assignment", { p_class_id: classId, p_item_id: v.itemId, p_note: v.note, p_date: v.date })) as Promise<string>,
    onSuccess: () => qc.invalidateQueries({ queryKey: key(classId) }),
  });
}

export function useUpdateAssignment(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown> }) =>
      must(supabase.from("homework_assignments").update(v.patch).eq("id", v.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(classId) }),
  });
}

/** 調整進行中作業的順序：依傳入的 id 順序寫入 sort_order = 1、2、3…；樂觀更新，失敗時還原 */
export function useReorderAssignments(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id, i) => must(supabase.from("homework_assignments").update({ sort_order: i + 1 }).eq("id", id))));
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key(classId) });
      const prev = qc.getQueryData<Assignment[]>(key(classId));
      const pos = new Map(ids.map((id, i) => [id, i + 1]));
      qc.setQueryData<Assignment[]>(key(classId), (list) => list?.map((a) => (pos.has(a.id) ? { ...a, sort_order: pos.get(a.id)! } : a)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key(classId), ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key(classId) }),
  });
}
