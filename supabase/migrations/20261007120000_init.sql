-- MuMu 班級工作台：初始資料庫結構
-- 設計依據：docs/superpowers/specs/2026-10-07-mumu-class-workbench-design.md §5、§6

create extension if not exists pgcrypto;

-- ───────────────────────── 共用函式 ─────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── 共用核心 ─────────────────────────
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  school_year int not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  student_no int not null check (student_no > 0),
  name_zh text not null,
  name_en text,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index students_active_no on public.students (class_id, student_no) where left_at is null;

create table public.homework_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject text not null,
  name text not null,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index homework_items_active_name on public.homework_items (owner_id, subject, name) where archived_at is null;

create table public.holidays (
  date date primary key,
  name text not null
);

-- ───────────────────────── 座位表 ─────────────────────────
create table public.seating_layouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  name text not null,
  rows int not null default 5 check (rows between 1 and 10),
  cols int not null default 6 check (cols between 1 and 10),
  is_current boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index seating_layouts_one_current on public.seating_layouts (class_id) where is_current and deleted_at is null;

create table public.seat_assignments (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  layout_id uuid not null references public.seating_layouts on delete cascade,
  "row" int not null,
  col int not null,
  student_id uuid references public.students,
  is_leader boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (layout_id, "row", col),
  constraint leader_needs_student check (not is_leader or student_id is not null)
);
create unique index seat_assignments_student_once on public.seat_assignments (layout_id, student_id) where student_id is not null;
create unique index seat_assignments_one_leader_per_group on public.seat_assignments (layout_id, col) where is_leader;

-- ───────────────────────── MUMU 幣 ─────────────────────────
create table public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  student_id uuid not null references public.students,
  delta numeric(12,2) not null check (delta <> 0),
  reason text not null,
  note text not null default '',
  batch_id uuid not null default gen_random_uuid(),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coin_transactions_student on public.coin_transactions (student_id);
create index coin_transactions_batch on public.coin_transactions (batch_id);

create view public.student_balances with (security_invoker = true) as
  select s.id as student_id,
         s.class_id,
         coalesce(sum(t.delta) filter (where t.voided_at is null), 0)::numeric(12,2) as balance
  from public.students s
  left join public.coin_transactions t on t.student_id = s.id
  group by s.id, s.class_id;

-- ───────────────────────── 課程規劃表 ─────────────────────────
create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.semester_off_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  semester_id uuid not null references public.semesters on delete cascade,
  date date not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, date)
);

create table public.planner_columns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  label text not null,
  group_name text not null,
  kind text not null check (kind in ('calendar','period','course_zh','course_social','text','multiline')),
  item_id uuid references public.homework_items on delete set null,
  sort_order int not null default 0,
  in_summary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, key)
);

create table public.planner_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  semester_id uuid not null references public.semesters on delete cascade,
  date date not null,
  column_id uuid not null references public.planner_columns on delete cascade,
  value text not null check (value <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, date, column_id)
);

-- ───────────────────────── 作業小管家 ─────────────────────────
create table public.homework_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  item_id uuid not null references public.homework_items,
  note text not null default '',
  assigned_date date not null default current_date,
  status text not null default 'open' check (status in ('open','archived')),
  archived_at timestamptz,
  deleted_at timestamptz,
  source text not null default 'manual' check (source in ('manual','planner')),
  planner_entry_id uuid references public.planner_entries on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.homework_checks (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  assignment_id uuid not null references public.homework_assignments on delete cascade,
  student_id uuid not null references public.students,
  status text not null default 'missing' check (status in ('done','missing')),
  updated_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);

-- ───────────────────────── updated_at triggers ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['classes','students','homework_items','seating_layouts','seat_assignments',
    'coin_transactions','semesters','semester_off_days','planner_columns','planner_entries',
    'homework_assignments','homework_checks']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ───────────────────────── audit_log ─────────────────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  table_name text not null,
  row_id uuid,
  op text not null,
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);

create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb := to_jsonb(old);
        n jsonb := case when tg_op = 'UPDATE' then to_jsonb(new) else null end;
begin
  insert into public.audit_log (owner_id, table_name, row_id, op, old_row, new_row)
  values ((o->>'owner_id')::uuid, tg_table_name, nullif(o->>'id','')::uuid, tg_op, o, n);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['classes','students','homework_items','seating_layouts','seat_assignments',
    'coin_transactions','semesters','semester_off_days','planner_columns','planner_entries',
    'homework_assignments','homework_checks']
  loop
    execute format('create trigger audit after update or delete on public.%I for each row execute function public.write_audit()', t);
  end loop;
end $$;

-- ───────────────────────── RLS ─────────────────────────
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.homework_items enable row level security;
alter table public.holidays enable row level security;
alter table public.seating_layouts enable row level security;
alter table public.seat_assignments enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.semesters enable row level security;
alter table public.semester_off_days enable row level security;
alter table public.planner_columns enable row level security;
alter table public.planner_entries enable row level security;
alter table public.homework_assignments enable row level security;
alter table public.homework_checks enable row level security;
alter table public.audit_log enable row level security;

-- 沒有父表的資料表：只看 owner_id
create policy owner_all on public.classes for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.homework_items for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy owner_all on public.planner_columns for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 子表：寫入時也要確認父表屬於同一位老師
create policy owner_all on public.students for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()));
create policy owner_all on public.seating_layouts for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()));
create policy owner_all on public.seat_assignments for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
    and exists (select 1 from public.seating_layouts l where l.id = layout_id and l.owner_id = auth.uid())
    and (student_id is null or exists (select 1 from public.students s where s.id = student_id and s.owner_id = auth.uid())));
create policy owner_all on public.coin_transactions for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
    and exists (select 1 from public.students s where s.id = student_id and s.class_id = coin_transactions.class_id and s.owner_id = auth.uid()));
create policy owner_all on public.semesters for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()));
create policy owner_all on public.semester_off_days for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.semesters m where m.id = semester_id and m.owner_id = auth.uid()));
create policy owner_all on public.planner_entries for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
    and exists (select 1 from public.semesters m where m.id = semester_id and m.owner_id = auth.uid())
    and exists (select 1 from public.planner_columns pc where pc.id = column_id and pc.owner_id = auth.uid()));
create policy owner_all on public.homework_assignments for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
    and exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid())
    and exists (select 1 from public.homework_items i where i.id = item_id and i.owner_id = auth.uid()));
create policy owner_all on public.homework_checks for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
    and exists (select 1 from public.homework_assignments a where a.id = assignment_id and a.owner_id = auth.uid())
    and exists (select 1 from public.students s where s.id = student_id and s.owner_id = auth.uid()));

create policy read_all on public.holidays for select to authenticated using (true);
create policy owner_read on public.audit_log for select to authenticated using (owner_id = auth.uid());

-- ───────────────────────── RPC ─────────────────────────
-- 建立作業：同一個 transaction 內為所有在籍學生建立「未交」紀錄，名單在此刻固定
create or replace function public.create_assignment(p_class_id uuid, p_item_id uuid, p_note text, p_date date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  insert into homework_assignments (class_id, item_id, note, assigned_date)
  values (p_class_id, p_item_id, coalesce(p_note, ''), coalesce(p_date, current_date))
  returning id into v_id;

  insert into homework_checks (assignment_id, student_id, status)
  select v_id, s.id, 'missing' from students s
  where s.class_id = p_class_id and s.left_at is null;

  return v_id;
end $$;

-- 計算利息：在資料庫端讀餘額、算利息、寫入，避免連點重複計算
-- 餘額 ≤ 0 不計利息；利息四捨五入到小數兩位（⏳ 待朋友確認，見設計文件 §13 #4）
create or replace function public.apply_interest(p_student_id uuid, p_rate numeric)
returns numeric language plpgsql security invoker set search_path = public as $$
declare v_class uuid; v_balance numeric; v_interest numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));
  select class_id into v_class from students where id = p_student_id;
  if v_class is null then raise exception 'student not found'; end if;

  select coalesce(sum(delta), 0) into v_balance
  from coin_transactions where student_id = p_student_id and voided_at is null;

  if v_balance <= 0 then return 0; end if;
  v_interest := round(v_balance * p_rate, 2);
  if v_interest = 0 then return 0; end if;

  insert into coin_transactions (class_id, student_id, delta, reason, note)
  values (v_class, p_student_id, v_interest, '利息',
          format('依帳戶餘額 %s 幣計算 %s%%', v_balance, round(p_rate * 100, 2)));
  return v_interest;
end $$;

-- ───────────────────────── 國定假日（115 學年上學期）─────────────────────────
insert into public.holidays (date, name) values
  ('2026-09-25', '中秋節'),
  ('2026-09-28', '孔子誕辰紀念日／教師節'),
  ('2026-10-09', '國慶日補假'),
  ('2026-10-26', '臺灣光復暨金門古寧頭大捷紀念日補假'),
  ('2026-12-25', '行憲紀念日'),
  ('2027-01-01', '中華民國開國紀念日')
on conflict (date) do nothing;
