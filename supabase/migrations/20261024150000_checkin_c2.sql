-- 任務打卡 C2：中午時段（範本、每日快照、打卡紀錄）、17:00 封存、復原擴充
-- 設計：docs/superpowers/specs/2026-10-23-task-checkin-design.md §4、§5.3、§5.5、§6.2–§6.4、§8
-- 計畫：docs/superpowers/plans/2026-10-24-task-checkin-c2-c3.md Task 1
-- 沿用 C1 的做法：打卡相關的表對登入者只開放讀取，寫入一律走 security definer 的 RPC，
-- 每個 RPC 第一件事是確認班級屬於 auth.uid()；內部函式（_ 開頭）帶 p_at，讓測試能指定時間。

-- ───────────────────────── 資料表 ─────────────────────────
-- 固定任務的範本，老師可以編輯；刪除改成停用（archived_at）
create table public.noon_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  name text not null check (btrim(name) <> ''),
  deadline time not null default '12:40',
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index noon_items_class on public.noon_items (class_id, sort_order);

-- 實際使用的一天。「版本」不另存欄位，就是當天 checkin_events 的筆數（計畫與設計的差異）
create table public.noon_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  class_id uuid not null references public.classes on delete cascade,
  date date not null,
  status text not null default 'open' check (status in ('open','archived')),
  settled_at timestamptz,
  settled_version int,
  settled_summary jsonb,
  scheduled_archive_at timestamptz not null,
  archived_at timestamptz,
  archived_by text check (archived_by in ('schedule','catchup')),
  final_summary jsonb,
  revised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, date),
  constraint archived_complete check
    ((status = 'archived') = (archived_at is not null and archived_by is not null and final_summary is not null))
);
-- 排程只找還沒封存的日子
create index noon_days_due on public.noon_days (status, scheduled_archive_at) where status = 'open';

-- 當天任務的快照：之後改範本，舊日期都不會跟著變（AC30）
create table public.noon_day_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  day_id uuid not null references public.noon_days on delete cascade,
  template_id uuid not null references public.noon_items,
  name text not null,
  deadline time not null,
  sort_order int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (day_id, template_id)
);

-- 當天名單的快照；請假以「整天」為單位
create table public.noon_day_students (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  day_id uuid not null references public.noon_days on delete cascade,
  student_id uuid not null references public.students,
  student_no int not null,
  name_zh text not null,
  on_leave boolean not null default false,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day_id, student_id)
);
create index noon_day_students_student on public.noon_day_students (student_id);

-- 打卡結果在寫入時由 RPC 判定後存下來，畫面和統計直接讀
create table public.noon_marks (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  day_item_id uuid not null references public.noon_day_items on delete cascade,
  student_id uuid not null references public.students,
  day_id uuid not null references public.noon_days on delete cascade,
  result text not null default 'pending' check (result in ('pending','ontime','late')),
  done_at timestamptz,
  source text check (source in ('student','teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day_item_id, student_id),
  constraint pending_is_blank check ((result = 'pending') = (done_at is null and source is null))
);
create index noon_marks_day on public.noon_marks (day_id);
create index noon_marks_student on public.noon_marks (student_id);

-- C1 先留了欄位沒加外鍵，這裡補上；日期的事件會跟著那天一起刪除
alter table public.checkin_events
  add constraint checkin_events_day_fk foreign key (day_id) references public.noon_days on delete cascade,
  add constraint checkin_events_day_item_fk foreign key (day_item_id) references public.noon_day_items on delete cascade;
create index checkin_events_day on public.checkin_events (day_id, id);

-- ───────────────────────── triggers ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['noon_items','noon_days','noon_day_items','noon_day_students','noon_marks']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger audit after update or delete on public.%I for each row execute function public.write_audit()', t);
  end loop;
end $$;

-- 預設固定任務：建立班級時寫入 5 項（security definer，因為不必讓 Setup.tsx 知道這件事）
create function public.noon_seed_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into noon_items (owner_id, class_id, name, sort_order)
  select new.owner_id, new.id, v.name, v.ord
  from (values ('喝水、上廁所', 0), ('清潔桌面', 1), ('打掃地板', 2), ('整理書櫃', 3), ('整理書包', 4)) as v(name, ord);
  return null;
end $$;
create trigger noon_seed_items after insert on public.classes
  for each row execute function public.noon_seed_items();

-- 現有班級：還沒有任何範本的就補上同樣 5 項
insert into public.noon_items (owner_id, class_id, name, sort_order)
select c.owner_id, c.id, v.name, v.ord
from public.classes c
cross join (values ('喝水、上廁所', 0), ('清潔桌面', 1), ('打掃地板', 2), ('整理書櫃', 3), ('整理書包', 4)) as v(name, ord)
where not exists (select 1 from public.noon_items n where n.class_id = c.id);

-- 封存後不能再改打卡；名單只允許補標或取消請假（設計 §4：唯一的例外）
create function public.noon_guard_mark() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.noon_days d where d.id = old.day_id and d.status = 'archived') then
    raise exception 'noon_closed';
  end if;
  return new;
end $$;
create trigger guard_archived before update on public.noon_marks
  for each row execute function public.noon_guard_mark();

create function public.noon_guard_day_student() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.noon_days d where d.id = old.day_id and d.status = 'archived')
     and (new.owner_id, new.day_id, new.student_id, new.student_no, new.name_zh, new.removed_at, new.created_at)
         is distinct from (old.owner_id, old.day_id, old.student_id, old.student_no, old.name_zh, old.removed_at, old.created_at) then
    raise exception 'noon_closed';
  end if;
  return new;
end $$;
create trigger guard_archived before update on public.noon_day_students
  for each row execute function public.noon_guard_day_student();

-- 名單異動（設計 §5.5）：C1 的一般任務部分維持原樣，後面加上中午。
-- 中午只處理「今天、還沒封存、而且還沒到 17:00」的那一天；已過 17:00 的名單就不再動
create or replace function public.checkin_sync_roster() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_day record;
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

  for v_day in
    select d.id, d.owner_id from noon_days d
    where d.class_id = new.class_id and d.owner_id = new.owner_id and d.status = 'open'
      and d.date = (now() at time zone 'Asia/Taipei')::date and now() < d.scheduled_archive_at
  loop
    if new.left_at is null then
      insert into noon_day_students (owner_id, day_id, student_id, student_no, name_zh)
      values (v_day.owner_id, v_day.id, new.id, new.student_no, new.name_zh)
      on conflict (day_id, student_id) do nothing;
      insert into noon_marks (owner_id, day_item_id, student_id, day_id)
      select v_day.owner_id, di.id, new.id, v_day.id from noon_day_items di where di.day_id = v_day.id
      on conflict (day_item_id, student_id) do nothing;
      if tg_op = 'UPDATE' then
        update noon_day_students set removed_at = null
        where day_id = v_day.id and student_id = new.id and removed_at is not null;
      end if;
    else
      update noon_day_students set removed_at = now()
      where day_id = v_day.id and student_id = new.id and removed_at is null;
    end if;
  end loop;
  return null;
end $$;

-- ───────────────────────── RLS 與權限 ─────────────────────────
alter table public.noon_items enable row level security;
alter table public.noon_days enable row level security;
alter table public.noon_day_items enable row level security;
alter table public.noon_day_students enable row level security;
alter table public.noon_marks enable row level security;

create policy owner_all on public.noon_items for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.classes c where c.id = class_id and c.owner_id = auth.uid()));
create policy owner_read on public.noon_days for select to authenticated using (owner_id = auth.uid());
create policy owner_read on public.noon_day_items for select to authenticated using (owner_id = auth.uid());
create policy owner_read on public.noon_day_students for select to authenticated using (owner_id = auth.uid());
create policy owner_read on public.noon_marks for select to authenticated using (owner_id = auth.uid());

-- 先全部收回再逐一授權，不依賴 Supabase 的預設權限
revoke all on public.noon_items, public.noon_days, public.noon_day_items, public.noon_day_students,
  public.noon_marks from anon, authenticated;
grant select, insert, update on public.noon_items to authenticated;
grant select on public.noon_days, public.noon_day_items, public.noon_day_students, public.noon_marks to authenticated;

-- ───────────────────────── 統計（設計 §8）─────────────────────────
-- 只計沒轉出的學生。單項任務的分母 = 沒請假的人數；個別學生的分母 = 當天的任務數；請假的學生全部是 0。
-- 前端的 computeSummary 用同一個形狀。pending 用 total - ontime - late 算，所以三者加起來一定等於 total
create function public.noon_compute_summary(p_day_id uuid) returns jsonb
language sql stable set search_path = public as $$
  with st as (
    select student_id, student_no, name_zh, on_leave
    from noon_day_students where day_id = p_day_id and removed_at is null
  ), it as (
    select id, template_id, name, deadline, sort_order from noon_day_items where day_id = p_day_id
  ), mk as (
    select m.day_item_id, m.student_id, m.result
    from noon_marks m
    join st on st.student_id = m.student_id and not st.on_leave
    where m.day_id = p_day_id
  ), item_rows as (
    select it.*,
      (select count(*) from mk where mk.day_item_id = it.id and mk.result = 'ontime')::int as ontime,
      (select count(*) from mk where mk.day_item_id = it.id and mk.result = 'late')::int as late,
      (select count(*) from st where not st.on_leave)::int as total,
      (select count(*) from st where st.on_leave)::int as leave_n
    from it
  ), student_rows as (
    select st.*,
      case when st.on_leave then 0
           else (select count(*) from mk where mk.student_id = st.student_id and mk.result = 'ontime')::int end as ontime,
      case when st.on_leave then 0
           else (select count(*) from mk where mk.student_id = st.student_id and mk.result = 'late')::int end as late,
      case when st.on_leave then 0 else (select count(*) from it)::int end as total
    from st
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day_item_id', id, 'template_id', template_id, 'name', name,
        'deadline', to_char(deadline, 'HH24:MI'), 'sort_order', sort_order,
        'ontime', ontime, 'late', late, 'pending', total - ontime - late, 'leave', leave_n, 'total', total
      ) order by sort_order, id) from item_rows), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', student_id, 'student_no', student_no, 'name_zh', name_zh, 'on_leave', on_leave,
        'ontime', ontime, 'late', late, 'pending', total - ontime - late, 'total', total
      ) order by student_no, student_id) from student_rows), '[]'::jsonb),
    'overall', jsonb_build_object(
      'ontime', coalesce((select sum(ontime) from item_rows), 0)::int,
      'late', coalesce((select sum(late) from item_rows), 0)::int,
      'pending', coalesce((select sum(total - ontime - late) from item_rows), 0)::int,
      'total', coalesce((select sum(total) from item_rows), 0)::int,
      'students', (select count(*) from st)::int,
      'leave_students', (select count(*) from st where on_leave)::int,
      'items', (select count(*) from it)::int
    )
  )
$$;

-- ───────────────────────── 內部函式 ─────────────────────────
-- 取得（或建立）台北日期那一天的紀錄：第一次寫入時才建立，並拍下任務與名單的快照（設計 §5.3）。
-- 已過 17:00 而且還沒有紀錄就不再建立。呼叫者必須先確認班級屬於 auth.uid()
create function public._noon_ensure_day(p_class_id uuid, p_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_date date := (p_at at time zone 'Asia/Taipei')::date;
  v_id uuid;
begin
  select id into v_id from noon_days where class_id = p_class_id and date = v_date;
  if found then return v_id; end if;
  if (p_at at time zone 'Asia/Taipei')::time >= time '17:00' then raise exception 'noon_no_day'; end if;

  -- 兩台裝置同時第一次寫入時，後到的在 on conflict 等前一筆提交後改讀現有的那天
  insert into noon_days (owner_id, class_id, date, scheduled_archive_at)
  values (auth.uid(), p_class_id, v_date, (v_date + time '17:00') at time zone 'Asia/Taipei')
  on conflict (class_id, date) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from noon_days where class_id = p_class_id and date = v_date;
    return v_id;
  end if;

  insert into noon_day_items (owner_id, day_id, template_id, name, deadline, sort_order)
  select auth.uid(), v_id, n.id, n.name, n.deadline, n.sort_order
  from noon_items n where n.class_id = p_class_id and n.archived_at is null;
  insert into noon_day_students (owner_id, day_id, student_id, student_no, name_zh)
  select auth.uid(), v_id, s.id, s.student_no, s.name_zh
  from students s where s.class_id = p_class_id and s.left_at is null;
  insert into noon_marks (owner_id, day_item_id, student_id, day_id)
  select auth.uid(), di.id, ds.student_id, v_id
  from noon_day_items di
  join noon_day_students ds on ds.day_id = di.day_id
  where di.day_id = v_id;
  return v_id;
end $$;

-- 打卡、取消、補登共用的寫入。p_target：'done'（學生打卡）、'cancel'（取消）、'fill'（老師補登）。
-- 冪等：已經是目標狀態就不寫入、不記事件（event_id 為 null）。
-- 判定：台北時間捨去秒後 <= 截止時間為準時（設計 §4）；補登不看時間，一律逾時
create function public._noon_write_mark(p_class_id uuid, p_template_id uuid, p_student_id uuid, p_target text, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d noon_days; di noon_day_items; ds noon_day_students; m noon_marks;
  v_day_id uuid; v_result text; v_done_at timestamptz; v_source text; v_event bigint;
begin
  perform _checkin_class_owner(p_class_id);
  -- 17:00 之後一律拒絕，就算排程還沒跑
  if (p_at at time zone 'Asia/Taipei')::time >= time '17:00' then raise exception 'noon_closed'; end if;
  v_day_id := _noon_ensure_day(p_class_id, p_at);  -- 先取 id 再讀，同一句 SQL 看不到函式剛建立的列
  select * into d from noon_days where id = v_day_id for share;
  if d.status <> 'open' then raise exception 'noon_closed'; end if;
  select * into di from noon_day_items where day_id = d.id and template_id = p_template_id;
  if not found then raise exception 'noon_no_item'; end if;
  select * into ds from noon_day_students where day_id = d.id and student_id = p_student_id;
  if not found or ds.removed_at is not null then raise exception 'checkin_no_student'; end if;
  if ds.on_leave then raise exception 'noon_on_leave'; end if;
  select * into m from noon_marks where day_item_id = di.id and student_id = p_student_id for update;
  if not found then raise exception 'checkin_no_student'; end if;

  if (p_target = 'cancel' and m.result = 'pending') or (p_target <> 'cancel' and m.result <> 'pending') then
    return jsonb_build_object('result', m.result, 'done_at', m.done_at, 'source', m.source,
                              'event_id', null, 'day_id', d.id);
  end if;

  if p_target = 'cancel' then
    v_result := 'pending'; v_done_at := null; v_source := null;
  else
    v_done_at := p_at;
    v_source := case when p_target = 'fill' then 'teacher' else 'student' end;
    v_result := case
      when p_target = 'fill' then 'late'
      when date_trunc('minute', p_at at time zone 'Asia/Taipei')::time <= di.deadline then 'ontime'
      else 'late' end;
  end if;

  update noon_marks set result = v_result, done_at = v_done_at, source = v_source
  where day_item_id = di.id and student_id = p_student_id;
  insert into checkin_events (owner_id, class_id, series, day_id, day_item_id, student_id, action, prev, next, actor, at)
  values (auth.uid(), p_class_id, 'noon', d.id, di.id, p_student_id,
          case p_target when 'done' then 'done' when 'cancel' then 'cancel' else 'teacher_fill' end,
          jsonb_build_object('result', m.result, 'done_at', m.done_at, 'source', m.source),
          jsonb_build_object('result', v_result, 'done_at', v_done_at, 'source', v_source),
          case when p_target = 'fill' then 'teacher' else 'student' end, p_at)
  returning id into v_event;
  return jsonb_build_object('result', v_result, 'done_at', v_done_at, 'source', v_source,
                            'event_id', v_event, 'day_id', d.id);
end $$;

create function public._noon_set_done(p_class_id uuid, p_template_id uuid, p_student_id uuid, p_done boolean, p_at timestamptz)
returns jsonb language sql security definer set search_path = public as $$
  select public._noon_write_mark(p_class_id, p_template_id, p_student_id, case when p_done then 'done' else 'cancel' end, p_at)
$$;

create function public._noon_teacher_fill(p_class_id uuid, p_template_id uuid, p_student_id uuid, p_at timestamptz)
returns jsonb language sql security definer set search_path = public as $$
  select public._noon_write_mark(p_class_id, p_template_id, p_student_id, 'fill', p_at)
$$;

-- 請假以整天為單位。已封存的日子也可以補標或取消：改 on_leave、用最新資料重算 final_summary、記下 revised_at。
-- 那天還沒有紀錄時，只有「今天而且未過 17:00」可以建立
create function public._noon_set_leave(p_class_id uuid, p_date date, p_student_id uuid, p_on_leave boolean, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d noon_days; ds noon_day_students; v_day_id uuid; v_event bigint;
begin
  perform _checkin_class_owner(p_class_id);
  select * into d from noon_days where class_id = p_class_id and date = p_date for update;
  if not found then
    if p_date <> (p_at at time zone 'Asia/Taipei')::date or (p_at at time zone 'Asia/Taipei')::time >= time '17:00' then
      raise exception 'noon_no_day';
    end if;
    v_day_id := _noon_ensure_day(p_class_id, p_at);
    select * into d from noon_days where id = v_day_id for update;
  end if;
  select * into ds from noon_day_students where day_id = d.id and student_id = p_student_id for update;
  if not found or ds.removed_at is not null then raise exception 'checkin_no_student'; end if;
  if ds.on_leave = p_on_leave then
    return jsonb_build_object('on_leave', ds.on_leave, 'event_id', null, 'day_id', d.id);
  end if;

  update noon_day_students set on_leave = p_on_leave where day_id = d.id and student_id = p_student_id;
  if d.status = 'archived' then
    update noon_days set final_summary = noon_compute_summary(d.id), revised_at = p_at where id = d.id;
  end if;
  insert into checkin_events (owner_id, class_id, series, day_id, student_id, action, prev, next, actor, at)
  values (auth.uid(), p_class_id, 'noon', d.id, p_student_id, case when p_on_leave then 'leave' else 'unleave' end,
          jsonb_build_object('on_leave', ds.on_leave), jsonb_build_object('on_leave', p_on_leave), 'teacher', p_at)
  returning id into v_event;
  return jsonb_build_object('on_leave', p_on_leave, 'event_id', v_event, 'day_id', d.id);
end $$;

-- 結算：存下當下的統計與版本（= 當天事件數）。之後再有打卡，版本就會大於 settled_version
create function public._noon_settle(p_class_id uuid, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d noon_days; v_day_id uuid; v_summary jsonb;
begin
  perform _checkin_class_owner(p_class_id);
  v_day_id := _noon_ensure_day(p_class_id, p_at);
  select * into d from noon_days where id = v_day_id for update;
  if d.status <> 'open' then raise exception 'noon_closed'; end if;
  v_summary := noon_compute_summary(d.id);
  update noon_days set settled_at = p_at,
    settled_version = (select count(*) from checkin_events where day_id = d.id),
    settled_summary = v_summary
  where id = d.id;
  return v_summary;
end $$;

-- 封存（設計 §6.4）。逐筆 for update skip locked；只處理 status = 'open'，所以重跑不會多出第二份。
-- 一律用當下最新的打卡重算 final_summary，不用手動結算的結果。
-- p_min_delay：前端補做時要求排定時間已過一段時間，讓 17:00–17:15 留給排程。
-- p_by 為 null 時依延遲判斷：15 分鐘內是 schedule，否則是 catchup
create function public._noon_archive_due(p_owner uuid, p_at timestamptz, p_min_delay interval, p_by text)
returns int language plpgsql security definer set search_path = public as $$
declare d record; v_n int := 0;
begin
  for d in
    select id, scheduled_archive_at from noon_days
    where status = 'open' and p_at >= scheduled_archive_at + p_min_delay
      and (p_owner is null or owner_id = p_owner)
    order by scheduled_archive_at
    for update skip locked
  loop
    update noon_days set
      final_summary = noon_compute_summary(d.id),
      status = 'archived',
      archived_at = p_at,
      archived_by = coalesce(p_by, case when p_at - d.scheduled_archive_at <= interval '15 minutes' then 'schedule' else 'catchup' end)
    where id = d.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- 給排程用：處理所有老師已到期的日子
create function public.noon_archive_due() returns int
language sql security definer set search_path = public as $$
  select public._noon_archive_due(null, now(), interval '0', null)
$$;

-- ───────────────────────── 公開 RPC ─────────────────────────
create function public.noon_set_done(p_class_id uuid, p_template_id uuid, p_student_id uuid, p_done boolean)
returns jsonb language sql security definer set search_path = public as $$
  select public._noon_set_done(p_class_id, p_template_id, p_student_id, p_done, now())
$$;

create function public.noon_teacher_fill(p_class_id uuid, p_template_id uuid, p_student_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select public._noon_teacher_fill(p_class_id, p_template_id, p_student_id, now())
$$;

create function public.noon_set_leave(p_class_id uuid, p_date date, p_student_id uuid, p_on_leave boolean)
returns jsonb language sql security definer set search_path = public as $$
  select public._noon_set_leave(p_class_id, p_date, p_student_id, p_on_leave, now())
$$;

create function public.noon_settle(p_class_id uuid) returns jsonb
language sql security definer set search_path = public as $$
  select public._noon_settle(p_class_id, now())
$$;

-- 不寫入：回傳伺服器時間、今天的日期、今天那一天的 id / 狀態 / 版本。
-- 紀錄與「範本＋名單」的預覽由前端直接讀表組出來
create function public.noon_today(p_class_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz := now();
  v_date date := (now() at time zone 'Asia/Taipei')::date;
  d noon_days;
begin
  perform _checkin_class_owner(p_class_id);
  select * into d from noon_days where class_id = p_class_id and date = v_date;
  return jsonb_build_object(
    'now', v_at, 'date', v_date,
    'after_cutoff', (v_at at time zone 'Asia/Taipei')::time >= time '17:00',
    'day_id', d.id, 'status', d.status,
    'version', (select count(*) from checkin_events where day_id = d.id)::int
  );
end $$;

-- 給前端開頁面時補做：只處理自己的班級，且排定時間已過 15 分鐘以上
create function public.noon_archive_due_mine() returns int
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 0; end if;
  return _noon_archive_due(auth.uid(), now(), interval '15 minutes', 'catchup');
end $$;

-- 復原（設計 §6.3）：一般任務與中午共用。目前狀態必須還等於該事件的 next，才還原成 prev。
-- 拆成 _checkin_undo(p_event_id, p_at) 讓測試能指定時間；公開的 checkin_undo 傳入 now()
create function public._checkin_undo(p_event_id bigint, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e checkin_events; m checkin_task_marks; nm noon_marks; d noon_days; ds noon_day_students;
  v_event bigint;
begin
  select * into e from checkin_events where id = p_event_id and owner_id = auth.uid();
  if not found then raise exception 'checkin_forbidden' using errcode = '42501'; end if;

  if e.series = 'task' then
    -- 一般任務：行為與 C1 相同
    if e.action not in ('done','cancel') then raise exception 'checkin_not_undoable'; end if;
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
  end if;

  -- 中午：打卡、取消、補登都可以復原；請假、復原本身不行
  if e.action not in ('done','cancel','teacher_fill') then raise exception 'checkin_not_undoable'; end if;
  select * into d from noon_days where id = e.day_id for share;
  if d.status = 'archived' or p_at >= d.scheduled_archive_at then raise exception 'noon_closed'; end if;
  select * into ds from noon_day_students where day_id = e.day_id and student_id = e.student_id;
  select * into nm from noon_marks where day_item_id = e.day_item_id and student_id = e.student_id for update;
  if ds.removed_at is not null or ds.on_leave
     or exists (select 1 from checkin_events where undo_of = p_event_id)
     or nm.result is distinct from e.next->>'result'
     or nm.done_at is distinct from (e.next->>'done_at')::timestamptz
     or nm.source is distinct from e.next->>'source' then
    raise exception 'checkin_stale';
  end if;

  update noon_marks set result = e.prev->>'result', done_at = (e.prev->>'done_at')::timestamptz, source = e.prev->>'source'
  where day_item_id = e.day_item_id and student_id = e.student_id;
  insert into checkin_events (owner_id, class_id, series, day_id, day_item_id, student_id, action, prev, next, undo_of, actor, at)
  values (auth.uid(), e.class_id, 'noon', e.day_id, e.day_item_id, e.student_id, 'undo', e.next, e.prev, e.id, 'student', p_at)
  returning id into v_event;
  return jsonb_build_object('result', e.prev->>'result', 'done_at', e.prev->'done_at', 'source', e.prev->>'source',
                            'event_id', v_event, 'day_id', e.day_id);
end $$;

create or replace function public.checkin_undo(p_event_id bigint)
returns jsonb language sql security definer set search_path = public as $$
  select public._checkin_undo(p_event_id, now())
$$;

-- 內部函式、trigger 函式、排程專用的函式不給任何登入者；公開 RPC 只給 authenticated
revoke execute on function public.noon_seed_items(), public.noon_guard_mark(), public.noon_guard_day_student(),
  public.noon_compute_summary(uuid), public._noon_ensure_day(uuid, timestamptz),
  public._noon_write_mark(uuid, uuid, uuid, text, timestamptz),
  public._noon_set_done(uuid, uuid, uuid, boolean, timestamptz), public._noon_teacher_fill(uuid, uuid, uuid, timestamptz),
  public._noon_set_leave(uuid, date, uuid, boolean, timestamptz), public._noon_settle(uuid, timestamptz),
  public._noon_archive_due(uuid, timestamptz, interval, text), public.noon_archive_due(),
  public._checkin_undo(bigint, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.noon_set_done(uuid, uuid, uuid, boolean), public.noon_teacher_fill(uuid, uuid, uuid),
  public.noon_set_leave(uuid, date, uuid, boolean), public.noon_settle(uuid), public.noon_today(uuid),
  public.noon_archive_due_mine(), public.checkin_undo(bigint)
  from public, anon;
grant execute on function public.noon_set_done(uuid, uuid, uuid, boolean), public.noon_teacher_fill(uuid, uuid, uuid),
  public.noon_set_leave(uuid, date, uuid, boolean), public.noon_settle(uuid), public.noon_today(uuid),
  public.noon_archive_due_mine(), public.checkin_undo(bigint)
  to authenticated;

-- ───────────────────────── 17:00 封存排程 ─────────────────────────
-- 每 5 分鐘一次。Supabase（正式站與本機 Docker）有 pg_cron；scripts/db-test.sh 用的 Homebrew Postgres 沒有，所以先檢查
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('noon-archive-due', '*/5 * * * *', 'select public.noon_archive_due()');
  end if;
end $$;
