-- 任務打卡 C1：一般任務、操作歷程、教室模式的 PIN
-- 設計：docs/superpowers/specs/2026-10-23-task-checkin-design.md §5.1、§5.2、§5.4–§5.6、§6.1、§6.3
-- 打卡相關的表對登入者只開放讀取，寫入一律走 security definer 的 RPC（§5.6），
-- 所以每個 RPC 第一件事是確認資料屬於 auth.uid()。

-- ───────────────────────── 資料表 ─────────────────────────
create table public.checkin_settings (
  class_id uuid primary key references public.classes on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  pin_hash text,
  pin_salt text,
  noon_timeline jsonb not null default
    '[{"time":"12:30","label":"加餐、倒餐"},{"time":"12:40","label":"全班收餐"},{"time":"12:45","label":"回到座位"}]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pin_pair check ((pin_hash is null) = (pin_salt is null))
);

create table public.checkin_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  kind text not null check (kind in ('round','single')),
  title text not null,
  archived_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checkin_batches_class on public.checkin_batches (class_id, archived_at desc);

create table public.checkin_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  slot smallint not null check (slot between 1 and 4),
  name text not null check (btrim(name) <> ''),
  task_date date not null default (now() at time zone 'Asia/Taipei')::date,
  due_date date,
  note text not null default '',
  status text not null default 'open' check (status in ('open','archived')),
  batch_id uuid references public.checkin_batches,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint archived_has_batch check ((status = 'archived') = (batch_id is not null and archived_at is not null))
);
create unique index checkin_tasks_open_slot on public.checkin_tasks (class_id, slot) where status = 'open';
create index checkin_tasks_batch on public.checkin_tasks (batch_id);

create table public.checkin_task_marks (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references public.checkin_tasks on delete cascade,
  student_id uuid not null references public.students,
  student_no int not null,
  name_zh text not null,
  state text not null default 'pending' check (state in ('pending','done','exempt')),
  done_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, student_id),
  constraint done_has_time check ((state = 'done') = (done_at is not null))
);
create index checkin_task_marks_student on public.checkin_task_marks (student_id);

-- 操作歷程：只能新增（登入者只有 select 權限，RPC 只 insert）
create table public.checkin_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  series text not null check (series in ('task','noon')),
  task_id uuid references public.checkin_tasks on delete cascade,
  day_id uuid,       -- C2 中午時段才用，屆時加外鍵
  day_item_id uuid,  -- 同上
  student_id uuid not null references public.students,
  action text not null check (action in ('done','cancel','undo','exempt','unexempt','leave','unleave','teacher_fill')),
  prev jsonb,
  next jsonb,
  undo_of bigint references public.checkin_events,
  actor text not null check (actor in ('student','teacher')),
  at timestamptz not null default now()
);
create index checkin_events_student on public.checkin_events (student_id, id desc);
create unique index checkin_events_undo_once on public.checkin_events (undo_of) where undo_of is not null;

-- 一般任務的完成統計：應完成數不含免交與轉出（設計 §8）
create view public.checkin_task_stats with (security_invoker = true) as
  select t.id as task_id, t.class_id, t.batch_id, t.name, t.slot, t.task_date, t.status,
         count(m.task_id) filter (where m.removed_at is null and m.state <> 'exempt')::int as total,
         count(m.task_id) filter (where m.removed_at is null and m.state = 'done')::int as done,
         count(m.task_id) filter (where m.removed_at is null and m.state = 'exempt')::int as exempt
  from public.checkin_tasks t
  left join public.checkin_task_marks m on m.task_id = t.id
  group by t.id;

-- ───────────────────────── triggers ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['checkin_settings','checkin_batches','checkin_tasks','checkin_task_marks']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit after update or delete on public.%I for each row execute function public.write_audit()', t);
  end loop;
end $$;

-- 封存後不能再修改（設計 §5.2）
create function public.checkin_guard_task() returns trigger
language plpgsql as $$
begin
  if old.status = 'archived' then raise exception 'checkin_archived'; end if;
  return new;
end $$;
create trigger guard_archived before update on public.checkin_tasks
  for each row execute function public.checkin_guard_task();

create function public.checkin_guard_mark() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.checkin_tasks t where t.id = old.task_id and t.status = 'archived') then
    raise exception 'checkin_archived';
  end if;
  return new;
end $$;
create trigger guard_archived before update on public.checkin_task_marks
  for each row execute function public.checkin_guard_mark();

-- 名單異動（設計 §5.5）：只動進行中的任務；marks 對登入者唯讀，所以用 security definer，並限定同一位老師
create function public.checkin_sync_roster() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.left_at is null then
    -- 新增或復學：進行中的任務還沒有這位學生就補一列 pending；復學的人清掉 removed_at，保留原本的狀態
    insert into checkin_task_marks (owner_id, task_id, student_id, student_no, name_zh)
    select t.owner_id, t.id, new.id, new.student_no, new.name_zh
    from checkin_tasks t
    where t.class_id = new.class_id and t.owner_id = new.owner_id and t.status = 'open'
    on conflict (task_id, student_id) do nothing;
    if tg_op = 'UPDATE' then
      update checkin_task_marks m set removed_at = null
      from checkin_tasks t
      where t.id = m.task_id and t.status = 'open' and m.student_id = new.id and m.removed_at is not null;
    end if;
  else
    update checkin_task_marks m set removed_at = now()
    from checkin_tasks t
    where t.id = m.task_id and t.status = 'open' and m.student_id = new.id and m.removed_at is null;
  end if;
  return null;
end $$;
create trigger checkin_sync_roster_insert after insert on public.students
  for each row execute function public.checkin_sync_roster();
create trigger checkin_sync_roster_left after update of left_at on public.students
  for each row when (old.left_at is distinct from new.left_at) execute function public.checkin_sync_roster();

-- ───────────────────────── RLS 與權限 ─────────────────────────
alter table public.checkin_settings enable row level security;
alter table public.checkin_batches enable row level security;
alter table public.checkin_tasks enable row level security;
alter table public.checkin_task_marks enable row level security;
alter table public.checkin_events enable row level security;

create policy owner_all on public.checkin_settings for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()));
create policy owner_all on public.checkin_tasks for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()));
create policy owner_read on public.checkin_batches for select to authenticated using (owner_id = auth.uid());
create policy owner_read on public.checkin_task_marks for select to authenticated using (owner_id = auth.uid());
create policy owner_read on public.checkin_events for select to authenticated using (owner_id = auth.uid());

-- 先全部收回再逐一授權，不依賴 Supabase 的預設權限
revoke all on public.checkin_settings, public.checkin_batches, public.checkin_tasks, public.checkin_task_marks,
  public.checkin_events, public.checkin_task_stats from anon, authenticated;
grant select, insert, update on public.checkin_settings to authenticated;
grant select on public.checkin_batches, public.checkin_tasks, public.checkin_task_marks, public.checkin_events,
  public.checkin_task_stats to authenticated;
-- 任務的名稱、日期、說明可以直接改（設計 §5.6）；狀態、格子只能透過 RPC
grant update (name, task_date, due_date, note) on public.checkin_tasks to authenticated;

-- ───────────────────────── RPC ─────────────────────────
create function public._checkin_class_owner(p_class_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from classes where id = p_class_id and owner_id = auth.uid()) then
    raise exception 'checkin_forbidden' using errcode = '42501';
  end if;
end $$;

-- 建立任務：同一個 transaction 內為在籍學生各建一列 pending（設計 §6.1）
create function public.task_create(p_class_id uuid, p_slot int, p_name text, p_task_date date, p_due_date date, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _checkin_class_owner(p_class_id);
  insert into checkin_tasks (owner_id, class_id, slot, name, task_date, due_date, note)
  values (auth.uid(), p_class_id, p_slot, btrim(p_name),
          coalesce(p_task_date, (now() at time zone 'Asia/Taipei')::date), p_due_date, coalesce(p_note, ''))
  returning id into v_id;

  insert into checkin_task_marks (owner_id, task_id, student_id, student_no, name_zh)
  select auth.uid(), v_id, s.id, s.student_no, s.name_zh
  from students s
  where s.class_id = p_class_id and s.left_at is null;
  return v_id;
end $$;

-- 打卡或取消：送的是目標狀態，已經是目標狀態就不寫入、不記事件（冪等）。p_at 讓測試能指定時間
create function public._task_set_done(p_task_id uuid, p_student_id uuid, p_done boolean, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t checkin_tasks;
  m checkin_task_marks;
  v_next text := case when p_done then 'done' else 'pending' end;
  v_at timestamptz := case when p_done then p_at end;
  v_event bigint;
begin
  select * into t from checkin_tasks where id = p_task_id and owner_id = auth.uid() for share;
  if not found then raise exception 'checkin_forbidden' using errcode = '42501'; end if;
  if t.status <> 'open' then raise exception 'checkin_archived'; end if;
  select * into m from checkin_task_marks where task_id = p_task_id and student_id = p_student_id for update;
  if not found or m.removed_at is not null then raise exception 'checkin_no_student'; end if;
  if m.state = 'exempt' then raise exception 'checkin_exempt'; end if;
  if m.state = v_next then
    return jsonb_build_object('state', m.state, 'done_at', m.done_at, 'event_id', null);
  end if;

  update checkin_task_marks set state = v_next, done_at = v_at
  where task_id = p_task_id and student_id = p_student_id;
  -- 一般任務的打卡不區分是誰按的（設計 §13 #4），actor 一律記 student
  insert into checkin_events (owner_id, class_id, series, task_id, student_id, action, prev, next, actor, at)
  values (auth.uid(), t.class_id, 'task', p_task_id, p_student_id, case when p_done then 'done' else 'cancel' end,
          jsonb_build_object('state', m.state, 'done_at', m.done_at),
          jsonb_build_object('state', v_next, 'done_at', v_at),
          'student', p_at)
  returning id into v_event;
  return jsonb_build_object('state', v_next, 'done_at', v_at, 'event_id', v_event);
end $$;

create function public.task_set_done(p_task_id uuid, p_student_id uuid, p_done boolean)
returns jsonb language sql security definer set search_path = public as $$
  select public._task_set_done(p_task_id, p_student_id, p_done, now())
$$;

-- 標免交或取消免交（只有老師用）。取消免交一律回到未完成
create function public.task_set_exempt(p_task_id uuid, p_student_id uuid, p_exempt boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t checkin_tasks; m checkin_task_marks; v_next text; v_event bigint;
begin
  select * into t from checkin_tasks where id = p_task_id and owner_id = auth.uid() for share;
  if not found then raise exception 'checkin_forbidden' using errcode = '42501'; end if;
  if t.status <> 'open' then raise exception 'checkin_archived'; end if;
  select * into m from checkin_task_marks where task_id = p_task_id and student_id = p_student_id for update;
  if not found or m.removed_at is not null then raise exception 'checkin_no_student'; end if;
  v_next := case when p_exempt then 'exempt' when m.state = 'exempt' then 'pending' else m.state end;
  if m.state = v_next then
    return jsonb_build_object('state', m.state, 'done_at', m.done_at, 'event_id', null);
  end if;

  update checkin_task_marks set state = v_next, done_at = null
  where task_id = p_task_id and student_id = p_student_id;
  insert into checkin_events (owner_id, class_id, series, task_id, student_id, action, prev, next, actor)
  values (auth.uid(), t.class_id, 'task', p_task_id, p_student_id, case when p_exempt then 'exempt' else 'unexempt' end,
          jsonb_build_object('state', m.state, 'done_at', m.done_at),
          jsonb_build_object('state', v_next, 'done_at', null),
          'teacher')
  returning id into v_event;
  return jsonb_build_object('state', v_next, 'done_at', null, 'event_id', v_event);
end $$;

-- 封存：建一個批次、用當下名單更新姓名快照、把任務設為 archived（騰出格子）
create function public.task_archive(p_task_ids uuid[], p_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_classes uuid[]; v_n int; v_batch uuid;
begin
  perform 1 from checkin_tasks where id = any(p_task_ids) and owner_id = auth.uid() for update;
  select array_agg(distinct class_id), count(*) into v_classes, v_n
  from checkin_tasks
  where id = any(p_task_ids) and owner_id = auth.uid() and status = 'open';
  if v_n = 0 or v_n <> cardinality(p_task_ids) or cardinality(v_classes) <> 1 then
    raise exception 'checkin_archive_invalid';
  end if;

  insert into checkin_batches (owner_id, class_id, kind, title)
  values (auth.uid(), v_classes[1], p_kind, to_char((now() at time zone 'Asia/Taipei')::date, 'YYYY-MM-DD') || ' 任務紀錄')
  returning id into v_batch;
  update checkin_task_marks m set student_no = s.student_no, name_zh = s.name_zh
  from students s
  where s.id = m.student_id and m.task_id = any(p_task_ids)
    and (m.student_no, m.name_zh) is distinct from (s.student_no, s.name_zh);
  update checkin_tasks set status = 'archived', batch_id = v_batch, archived_at = now()
  where id = any(p_task_ids);
  return v_batch;
end $$;

-- 復原（設計 §6.3）：只復原打卡或取消；目前狀態必須還等於該事件的 next，否則拒絕
create function public.checkin_undo(p_event_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e checkin_events; m checkin_task_marks; v_event bigint;
begin
  select * into e from checkin_events where id = p_event_id and owner_id = auth.uid();
  if not found then raise exception 'checkin_forbidden' using errcode = '42501'; end if;
  if e.series <> 'task' or e.action not in ('done','cancel') then raise exception 'checkin_not_undoable'; end if;
  perform 1 from checkin_tasks where id = e.task_id and status = 'open' for share;
  if not found then raise exception 'checkin_archived'; end if;
  select * into m from checkin_task_marks where task_id = e.task_id and student_id = e.student_id for update;
  if m.removed_at is not null
     or exists (select 1 from checkin_events where undo_of = p_event_id)
     or m.state is distinct from e.next->>'state'
     or m.done_at is distinct from (e.next->>'done_at')::timestamptz then
    raise exception 'checkin_stale';
  end if;

  update checkin_task_marks set state = e.prev->>'state', done_at = (e.prev->>'done_at')::timestamptz
  where task_id = e.task_id and student_id = e.student_id;
  insert into checkin_events (owner_id, class_id, series, task_id, student_id, action, prev, next, undo_of, actor)
  values (auth.uid(), e.class_id, 'task', e.task_id, e.student_id, 'undo', e.next, e.prev, e.id, 'student')
  returning id into v_event;
  return jsonb_build_object('state', e.prev->>'state', 'done_at', e.prev->'done_at', 'event_id', v_event);
end $$;

revoke execute on function public._checkin_class_owner(uuid), public._task_set_done(uuid, uuid, boolean, timestamptz),
  public.checkin_sync_roster(), public.checkin_guard_task(), public.checkin_guard_mark()
  from public, anon, authenticated;
revoke execute on function public.task_create(uuid, int, text, date, date, text), public.task_set_done(uuid, uuid, boolean),
  public.task_set_exempt(uuid, uuid, boolean), public.task_archive(uuid[], text), public.checkin_undo(bigint)
  from public, anon;
grant execute on function public.task_create(uuid, int, text, date, date, text), public.task_set_done(uuid, uuid, boolean),
  public.task_set_exempt(uuid, uuid, boolean), public.task_archive(uuid[], text), public.checkin_undo(bigint)
  to authenticated;
