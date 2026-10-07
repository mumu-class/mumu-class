import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_PLANNER_COLUMNS, DEFAULT_SEMESTER } from "../../lib/defaults";
import { must, supabase } from "../../lib/supabase";
import type { OffDay, PlannerColumn, PlannerEntry, Semester } from "../../lib/types";

export function useSemester(classId: string) {
  return useQuery({
    queryKey: ["semester", classId],
    queryFn: async () => {
      const found = await must(supabase.from("semesters").select("*").eq("class_id", classId).order("created_at").limit(1).returns<Semester[]>());
      if (found[0]) return found[0];
      return must(supabase.from("semesters").insert({ ...DEFAULT_SEMESTER, class_id: classId }).select("*").single<Semester>());
    },
  });
}

export function useColumns() {
  return useQuery({
    queryKey: ["planner_columns"],
    queryFn: async () => {
      const cols = await must(supabase.from("planner_columns").select("*").order("sort_order").returns<PlannerColumn[]>());
      if (cols.length) return cols;
      return must(supabase.from("planner_columns").insert(DEFAULT_PLANNER_COLUMNS.map((c, i) => ({ ...c, sort_order: i }))).select("*").order("sort_order").returns<PlannerColumn[]>());
    },
    staleTime: Infinity,
  });
}

export function useHolidays() {
  return useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const rows = await must(supabase.from("holidays").select("date,name").returns<{ date: string; name: string }[]>());
      return Object.fromEntries(rows.map((r) => [r.date, r.name])) as Record<string, string>;
    },
    staleTime: Infinity,
  });
}

export function useOffDays(semesterId: string | undefined) {
  return useQuery({
    queryKey: ["offdays", semesterId],
    enabled: !!semesterId,
    queryFn: () => must(supabase.from("semester_off_days").select("*").eq("semester_id", semesterId!).order("date").returns<OffDay[]>()),
  });
}

export function useEntries(semesterId: string | undefined) {
  return useQuery({
    queryKey: ["entries", semesterId],
    enabled: !!semesterId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: () => must(supabase.from("planner_entries").select("*").eq("semester_id", semesterId!).limit(20000).returns<PlannerEntry[]>()),
  });
}

/** 一格一筆：有值就 upsert，空白就刪除這一格 */
export function useSaveCell(semesterId: string | undefined) {
  return useMutation({
    mutationFn: async (v: { date: string; columnId: string; value: string }) => {
      if (v.value === "") {
        await must(supabase.from("planner_entries").delete().eq("semester_id", semesterId!).eq("date", v.date).eq("column_id", v.columnId));
      } else {
        await must(supabase.from("planner_entries").upsert(
          { semester_id: semesterId, date: v.date, column_id: v.columnId, value: v.value },
          { onConflict: "semester_id,date,column_id" },
        ));
      }
    },
  });
}

export function useSemesterMutations(classId: string, semesterId: string | undefined) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (patch: Partial<Semester>) => must(supabase.from("semesters").update(patch).eq("id", semesterId!)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["semester", classId] }),
  });
  const addOff = useMutation({
    mutationFn: (v: { date: string; reason: string }) => must(supabase.from("semester_off_days").upsert({ semester_id: semesterId, ...v }, { onConflict: "semester_id,date" })),
    onSettled: () => qc.invalidateQueries({ queryKey: ["offdays", semesterId] }),
  });
  const removeOff = useMutation({
    mutationFn: (id: string) => must(supabase.from("semester_off_days").delete().eq("id", id)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["offdays", semesterId] }),
  });
  return { update, addOff, removeOff };
}
