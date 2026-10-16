-- 2026-10-16 migration 的升級函式。以 postgres 身分執行（不受 RLS 限制，和在正式環境套用 migration 時相同）。
-- 測試時 migration 是套用在空資料庫上，所以這裡先建立「舊版」欄位，再呼叫升級函式。
\set ON_ERROR_STOP 1
begin;

insert into auth.users values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');

-- 兩位老師各有一組舊版欄位（只放測試需要的幾欄）
insert into planner_columns (owner_id, key, label, group_name, kind, sort_order, in_summary)
select u.o, k.key, k.key, k.grp, k.kind, k.pos, k.key <> '備註'
from (values ('00000000-0000-0000-0000-0000000000c1'::uuid), ('00000000-0000-0000-0000-0000000000c2'::uuid)) as u(o),
     (values ('重要行事曆', '固定', 'calendar', 0), ('堂', '固定', 'period', 1), ('國習', '國語｜核心', 'text', 2),
             ('社單元考', '社會', 'multiline', 3), ('其他', '其他', 'text', 4), ('備註', '其他', 'text', 5)) as k(key, grp, kind, pos);

-- c1 在「堂」填過內容
insert into classes (id, owner_id, name, school_year) values
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', '311', 115);
insert into semesters (id, owner_id, class_id, name, start_date, end_date) values
  ('50000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '115 上', '2026-08-31', '2027-01-20');
insert into planner_entries (owner_id, semester_id, date, column_id, value)
select '00000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000c1', '2026-10-07', id, '2'
from planner_columns where owner_id = '00000000-0000-0000-0000-0000000000c1' and key = '堂';

-- 執行兩次：必須可以重複執行
select upgrade_planner_columns_20261016();
select upgrade_planner_columns_20261016();

do $$
begin
  assert (select count(*) from planner_columns where key in ('堂', '備註') and hidden) = 4, '兩位老師的堂、備註都應隱藏';
  assert (select count(*) from planner_columns where hidden) = 4, '其他欄位不應被隱藏';
  assert (select count(*) from planner_entries e join planner_columns c on c.id = e.column_id where c.key = '堂') = 1,
    '堂的舊內容應保留';
  assert (select count(*) from planner_columns where key in ('數學', '自然', '其他考試')) = 6,
    '每位老師各新增數學、自然、其他考試，執行兩次也不重複';
  assert (select bool_and(kind = 'multiline' and group_name = '其他') from planner_columns where key = '其他考試'),
    '其他考試應為多行、屬於其他分組';
  assert (select string_agg(key, ',' order by sort_order) from planner_columns where owner_id = '00000000-0000-0000-0000-0000000000c1')
    = '重要行事曆,堂,國習,社單元考,數學,自然,其他,其他考試,備註', '其他分組的順序應為數學、自然、其他、其他考試、備註';
  assert (select column_default from information_schema.columns
          where table_name = 'homework_assignments' and column_name = 'sort_order') = '0', 'sort_order 預設應為 0';
end $$;

-- 登入的使用者不能呼叫升級函式
set local role authenticated;
do $$
begin
  begin
    perform upgrade_planner_columns_20261016();
    assert false, 'authenticated 不應能執行升級函式';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'TEACHER FEEDBACK MIGRATION TESTS PASSED' as result;
rollback;
