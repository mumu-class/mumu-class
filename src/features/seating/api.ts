import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, supabase } from "../../lib/supabase";
import type { Layout, Seat } from "../../lib/types";

export function useLayouts(classId: string) {
  return useQuery({
    queryKey: ["layouts", classId],
    queryFn: () => must(supabase.from("seating_layouts").select("*").eq("class_id", classId).is("deleted_at", null).order("created_at").returns<Layout[]>()),
  });
}

export function useSeats(layoutId: string | undefined) {
  return useQuery({
    queryKey: ["seats", layoutId],
    enabled: !!layoutId,
    queryFn: () => must(supabase.from("seat_assignments").select("layout_id,row,col,student_id,is_leader").eq("layout_id", layoutId!).returns<Seat[]>()),
  });
}

export function useSeatMutations(classId: string, layoutId: string | undefined) {
  const qc = useQueryClient();
  const key = ["seats", layoutId];
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const patchCache = (fn: (seats: Seat[]) => Seat[]) => qc.setQueryData<Seat[]>(key, (s) => fn(s ?? []));

  const setSeat = useMutation({
    mutationFn: async (v: { row: number; col: number; studentId: string | null }) => {
      await must(supabase.from("seat_assignments").upsert(
        { layout_id: layoutId, row: v.row, col: v.col, student_id: v.studentId, is_leader: false },
        { onConflict: "layout_id,row,col" },
      ));
    },
    onMutate: (v) => patchCache((s) => [...s.filter((x) => !(x.row === v.row && x.col === v.col)), { layout_id: layoutId!, row: v.row, col: v.col, student_id: v.studentId, is_leader: false }]),
    onError: refresh,
  });

  /** 每組只能有一位組長：先取消同欄其他組長，再設定這一位 */
  const setLeader = useMutation({
    mutationFn: async (v: { row: number; col: number; on: boolean }) => {
      if (v.on) await must(supabase.from("seat_assignments").update({ is_leader: false }).eq("layout_id", layoutId!).eq("col", v.col).eq("is_leader", true));
      await must(supabase.from("seat_assignments").update({ is_leader: v.on }).eq("layout_id", layoutId!).eq("row", v.row).eq("col", v.col));
    },
    onMutate: (v) => patchCache((s) => s.map((x) => x.col !== v.col ? x : { ...x, is_leader: x.row === v.row ? v.on : v.on ? false : x.is_leader })),
    onError: refresh,
  });

  /** 整張座位表換成新的安排（隨機排座位、全部清空） */
  const replaceAll = useMutation({
    mutationFn: async (seats: { row: number; col: number; student_id: string | null }[]) => {
      await must(supabase.from("seat_assignments").delete().eq("layout_id", layoutId!));
      const rows = seats.filter((s) => s.student_id).map((s) => ({ ...s, layout_id: layoutId, is_leader: false }));
      if (rows.length) await must(supabase.from("seat_assignments").insert(rows));
    },
    onSettled: refresh,
  });

  const saveAs = useMutation({
    mutationFn: async (v: { name: string; rows: number; cols: number; seats: Seat[] }) => {
      const layout = await must(supabase.from("seating_layouts").insert({ class_id: classId, name: v.name, rows: v.rows, cols: v.cols, is_current: false }).select("id").single<{ id: string }>());
      const rows = v.seats.filter((s) => s.student_id).map((s) => ({ layout_id: layout.id, row: s.row, col: s.col, student_id: s.student_id, is_leader: s.is_leader }));
      if (rows.length) await must(supabase.from("seat_assignments").insert(rows));
      await must(supabase.from("seating_layouts").update({ is_current: false }).eq("class_id", classId).eq("is_current", true));
      await must(supabase.from("seating_layouts").update({ is_current: true }).eq("id", layout.id));
      return layout.id as string;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["layouts", classId] }),
  });

  const makeCurrent = useMutation({
    mutationFn: async (id: string) => {
      await must(supabase.from("seating_layouts").update({ is_current: false }).eq("class_id", classId).eq("is_current", true));
      await must(supabase.from("seating_layouts").update({ is_current: true }).eq("id", id));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["layouts", classId] }),
  });

  const createFirst = useMutation({
    mutationFn: () => must(supabase.from("seating_layouts").insert({ class_id: classId, name: "目前座位", rows: 5, cols: 6, is_current: true })),
    onSettled: () => qc.invalidateQueries({ queryKey: ["layouts", classId] }),
  });

  return { setSeat, setLeader, replaceAll, saveAs, makeCurrent, createFirst };
}
