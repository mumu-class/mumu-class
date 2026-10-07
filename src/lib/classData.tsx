import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { must, supabase } from "./supabase";
import type { Cls, HomeworkItem, Student } from "./types";

export function useClassQuery() {
  return useQuery({
    queryKey: ["class"],
    queryFn: async (): Promise<Cls | null> =>
      (await must(supabase.from("classes").select("id,name,school_year").is("archived_at", null).order("created_at").limit(1).returns<Cls[]>()))[0] ?? null,
  });
}

export function useStudentsQuery(classId: string | undefined) {
  return useQuery({
    queryKey: ["students", classId],
    enabled: !!classId,
    queryFn: () => must(supabase.from("students").select("*").eq("class_id", classId!).order("student_no").returns<Student[]>()),
  });
}

export function useItemsQuery() {
  return useQuery({
    queryKey: ["items"],
    queryFn: () =>
      must(supabase.from("homework_items").select("*").is("archived_at", null).order("sort_order").order("name").returns<HomeworkItem[]>()),
  });
}

type ClassData = { cls: Cls; students: Student[]; allStudents: Student[]; items: HomeworkItem[] };
const Ctx = createContext<ClassData | null>(null);

export function ClassProvider({ value, children }: { value: ClassData; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 目前班級、在籍學生（依座號）、全部學生（含轉出）、作業項目 */
export function useClassData(): ClassData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useClassData must be inside ClassProvider");
  return v;
}

export const SUBJECTS = ["國語", "數學", "自然", "社會", "其他"];

export function itemTitle(items: HomeworkItem[], itemId: string, note: string): string {
  const item = items.find((i) => i.id === itemId);
  return [item?.name ?? "（已停用的項目）", note.trim()].filter(Boolean).join("｜");
}
