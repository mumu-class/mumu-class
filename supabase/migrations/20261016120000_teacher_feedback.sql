-- 老師使用回饋（2026-10-16）：
-- 規劃表隱藏「堂」「備註」（資料保留）、其他分組改為數學／自然／其他／其他考試；小管家的進行中作業可排序。
-- 設計：docs/superpowers/specs/2026-10-16-teacher-feedback-planner-homework-design.md

alter table public.planner_columns add column hidden boolean not null default false;
alter table public.homework_assignments add column sort_order int not null default 0;

-- 升級每位老師既有的規劃表欄位；可重複執行。包成函式是為了讓 supabase/tests 能在有舊資料的情況下測試。
create function public.upgrade_planner_columns_20261016() returns void
language plpgsql as $$
declare
  o uuid;
  base int;
begin
  update public.planner_columns set hidden = true where key in ('堂', '備註') and not hidden;
  for o in select distinct owner_id from public.planner_columns loop
    insert into public.planner_columns (owner_id, key, label, group_name, kind, in_summary) values
      (o, '數學', '數學', '其他', 'text', true),
      (o, '自然', '自然', '其他', 'text', true),
      (o, '其他考試', '其他考試', '其他', 'multiline', true)
    on conflict (owner_id, key) do nothing;
    select coalesce(max(sort_order), -1) into base from public.planner_columns where owner_id = o and group_name <> '其他';
    update public.planner_columns c set sort_order = base + x.pos
    from (values ('數學', 1), ('自然', 2), ('其他', 3), ('其他考試', 4), ('備註', 5)) as x(key, pos)
    where c.owner_id = o and c.key = x.key and c.sort_order <> base + x.pos;
  end loop;
end $$;

revoke execute on function public.upgrade_planner_columns_20261016() from public, anon, authenticated;

select public.upgrade_planner_columns_20261016();
