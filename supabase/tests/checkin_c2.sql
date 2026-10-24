-- 任務打卡 C2：中午時段的建立、判定、補登、冪等、復原、請假、結算、17:00 封存、名單 trigger 與權限。
-- 以 postgres 連線；用 set_config 模擬登入者，用 set local role 切換成 authenticated。
-- 內部函式（_noon_*、_checkin_undo、_noon_archive_due）只授權給 postgres，測試用它們指定時間（設計 §10「可控的測試時鐘」）。
-- 日期固定用過去的 2026-10-21 起；只有名單 trigger 那段（第 11 項）需要「今天」，用 now() 建立。
-- 整份測試包在 transaction 裡，最後 rollback，不會影響其他測試檔。
\set ON_ERROR_STOP 1
begin;

-- 取某班第 n 個範本的 id（只給 postgres 的 DO 區塊用）
create function pg_temp.item(c uuid, n int) returns uuid language sql as
  $$ select id from public.noon_items where class_id = c and sort_order = n $$;

insert into auth.users values ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
insert into classes (id, name, school_year) values
  ('c2000000-0000-0000-0000-00000000000a', '311', 115),
  ('c2000000-0000-0000-0000-00000000000b', '312', 115),
  ('c2000000-0000-0000-0000-00000000000c', '313', 115);
insert into students (id, class_id, student_no, name_zh) values
  ('c2500000-0000-0000-0000-0000000000a1', 'c2000000-0000-0000-0000-00000000000a', 1, '甲'),
  ('c2500000-0000-0000-0000-0000000000a2', 'c2000000-0000-0000-0000-00000000000a', 2, '乙'),
  ('c2500000-0000-0000-0000-0000000000a3', 'c2000000-0000-0000-0000-00000000000a', 3, '丙'),
  ('c2500000-0000-0000-0000-0000000000a4', 'c2000000-0000-0000-0000-00000000000a', 4, '丁'),
  ('c2500000-0000-0000-0000-0000000000b1', 'c2000000-0000-0000-0000-00000000000b', 1, '戊'),
  ('c2500000-0000-0000-0000-0000000000b2', 'c2000000-0000-0000-0000-00000000000b', 2, '己'),
  ('c2500000-0000-0000-0000-0000000000c1', 'c2000000-0000-0000-0000-00000000000c', 1, '庚'),
  ('c2500000-0000-0000-0000-0000000000c2', 'c2000000-0000-0000-0000-00000000000c', 2, '辛');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
insert into classes (id, name, school_year) values ('c2000000-0000-0000-0000-00000000000d', '321', 115);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);

-- 1. 新建班級自動有 5 項固定任務，截止時間預設 12:40
do $$
begin
  assert (select array_agg(name order by sort_order) from noon_items where class_id = 'c2000000-0000-0000-0000-00000000000a')
         = array['喝水、上廁所','清潔桌面','打掃地板','整理書櫃','整理書包'], '新班級應有 5 項預設固定任務';
  assert (select count(*) from noon_items where class_id = 'c2000000-0000-0000-0000-00000000000a' and deadline = '12:40' and archived_at is null) = 5,
    '預設截止時間應為 12:40、未停用';
  assert (select count(*) from noon_items) = 15, 'A 老師的三個班共 15 項';
end $$;

-- 3a. noon_today 不寫入：還沒有任何人打卡時，不會多出一天的紀錄
do $$
declare r jsonb;
begin
  r := noon_today('c2000000-0000-0000-0000-00000000000a');
  assert r->>'day_id' is null and r->>'status' is null and (r->>'version')::int = 0, '沒有紀錄時 day_id、status 為 null、version 為 0';
  assert (r->>'date')::date = (now() at time zone 'Asia/Taipei')::date, '應回傳台北的今天';
  assert (r->>'after_cutoff')::boolean = ((now() at time zone 'Asia/Taipei')::time >= time '17:00'), 'after_cutoff 應依伺服器時間';
  assert (select count(*) from noon_days) = 0, 'noon_today 不應建立任何一天';
  assert (select count(*) from noon_marks) = 0, 'noon_today 不應建立任何打卡列';
end $$;

reset role;

-- 2. 判定時間點（12:40 截止）：12:39:59、12:40:59 準時；12:41:00、16:59:59 逾時；17:00:00 拒絕
--    同時確認「第一次寫入才建立那一天」並拍下快照
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  i0 uuid := pg_temp.item(a, 0); i1 uuid := pg_temp.item(a, 1); r jsonb; v_day uuid;
begin
  assert (select count(*) from noon_days) = 0, '寫入前不應有任何一天';
  r := _noon_set_done(a, i0, 'c2500000-0000-0000-0000-0000000000a1', true, '2026-10-21 12:39:59+08');
  assert r->>'result' = 'ontime' and r->>'source' = 'student' and r->>'event_id' is not null, '12:39:59 應準時';
  assert (r->>'done_at')::timestamptz = '2026-10-21 12:39:59+08', '應回傳打卡時間';
  v_day := (r->>'day_id')::uuid;

  assert (select count(*) from noon_days where class_id = a) = 1, '第一次寫入應建立當天';
  assert (select date = '2026-10-21' and status = 'open' and scheduled_archive_at = '2026-10-21 17:00+08' from noon_days where id = v_day),
    '當天的日期與排定封存時間（台北 17:00）';
  assert (select count(*) from noon_day_items where day_id = v_day) = 5, '應拍下 5 項任務的快照';
  assert (select count(*) from noon_day_students where day_id = v_day) = 4, '應拍下 4 位學生的快照';
  assert (select count(*) from noon_marks where day_id = v_day and result = 'pending') = 19, '其餘 19 列為未完成';
  assert (select action = 'done' and actor = 'student' and series = 'noon' and next->>'result' = 'ontime' and prev->>'result' = 'pending'
          from checkin_events where id = (r->>'event_id')::bigint), '事件應記 done、student 與前後狀態';

  r := _noon_set_done(a, i0, 'c2500000-0000-0000-0000-0000000000a2', true, '2026-10-21 12:40:59+08');
  assert r->>'result' = 'ontime', '12:40:59 應準時';
  r := _noon_set_done(a, i0, 'c2500000-0000-0000-0000-0000000000a3', true, '2026-10-21 12:41:00+08');
  assert r->>'result' = 'late', '12:41:00 應逾時';
  r := _noon_set_done(a, i0, 'c2500000-0000-0000-0000-0000000000a4', true, '2026-10-21 16:59:59+08');
  assert r->>'result' = 'late', '16:59:59 應逾時';
  begin
    perform _noon_set_done(a, i1, 'c2500000-0000-0000-0000-0000000000a1', true, '2026-10-21 17:00:00+08');
    assert false, '17:00:00 應被拒絕';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;
  assert (select result = 'pending' from noon_marks where day_item_id = (select id from noon_day_items where day_id = v_day and template_id = i1)
          and student_id = 'c2500000-0000-0000-0000-0000000000a1'), '被拒絕的打卡不應留下痕跡';
  perform set_config('test.day1021', v_day::text, true);
end $$;

-- 4. 補登一律逾時、source 為 teacher、actor 為 teacher；已完成的不動；17:00 後拒絕
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  i0 uuid := pg_temp.item(a, 0); i1 uuid := pg_temp.item(a, 1); r jsonb;
begin
  r := _noon_teacher_fill(a, i1, 'c2500000-0000-0000-0000-0000000000a2', '2026-10-21 12:30:00+08');
  assert r->>'result' = 'late' and r->>'source' = 'teacher' and r->>'event_id' is not null, '補登一律逾時，就算在截止前';
  assert (select action = 'teacher_fill' and actor = 'teacher' and next->>'source' = 'teacher'
          from checkin_events where id = (r->>'event_id')::bigint), '補登事件應記 teacher_fill 與 teacher';
  r := _noon_teacher_fill(a, i1, 'c2500000-0000-0000-0000-0000000000a2', '2026-10-21 12:31:00+08');
  assert r->>'event_id' is null and (r->>'done_at')::timestamptz = '2026-10-21 12:30:00+08', '已補登的再補登不應有變動';
  r := _noon_teacher_fill(a, i0, 'c2500000-0000-0000-0000-0000000000a1', '2026-10-21 12:31:00+08');
  assert r->>'result' = 'ontime' and r->>'source' = 'student' and r->>'event_id' is null, '學生已準時完成的，補登不應覆蓋';
  begin
    perform _noon_teacher_fill(a, i1, 'c2500000-0000-0000-0000-0000000000a3', '2026-10-21 17:00:00+08');
    assert false, '17:00 後不能補登';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;
end $$;

-- 5. 冪等：同一個設定重送兩次只有一筆事件；對未完成的格子取消也不記事件。
--    另外：別班的學生、別班的範本都找不到
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  b constant uuid := 'c2000000-0000-0000-0000-00000000000b';
  i2 uuid := pg_temp.item(a, 2); r jsonb; v_day uuid := current_setting('test.day1021')::uuid;
begin
  r := _noon_set_done(a, i2, 'c2500000-0000-0000-0000-0000000000a3', true, '2026-10-21 12:00:00+08');
  assert r->>'event_id' is not null, '第一次應記事件';
  r := _noon_set_done(a, i2, 'c2500000-0000-0000-0000-0000000000a3', true, '2026-10-21 12:05:00+08');
  assert r->>'event_id' is null and (r->>'done_at')::timestamptz = '2026-10-21 12:00:00+08', '重送不應記事件、不應改打卡時間';
  assert (select count(*) from checkin_events where day_id = v_day and student_id = 'c2500000-0000-0000-0000-0000000000a3'
          and day_item_id = (select id from noon_day_items where day_id = v_day and template_id = i2)) = 1, '應只有 1 筆事件';
  r := _noon_set_done(a, i2, 'c2500000-0000-0000-0000-0000000000a4', false, '2026-10-21 12:05:00+08');
  assert r->>'event_id' is null and r->>'result' = 'pending', '對未完成的取消不應記事件';

  begin
    perform _noon_set_done(a, i2, 'c2500000-0000-0000-0000-0000000000b1', true, '2026-10-21 12:00:00+08');
    assert false, '別班的學生不應能打卡';
  exception when raise_exception then assert sqlerrm = 'checkin_no_student', sqlerrm;
  end;
  begin
    perform _noon_set_done(a, pg_temp.item(b, 0), 'c2500000-0000-0000-0000-0000000000a1', true, '2026-10-21 12:00:00+08');
    assert false, '別班的範本不應能使用';
  exception when raise_exception then assert sqlerrm = 'noon_no_item', sqlerrm;
  end;
end $$;

-- 6. 復原（AC17）與其他規則
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  i3 uuid := pg_temp.item(a, 3); r jsonb; e_cancel bigint; e_c bigint; e_b bigint; e_fill bigint; e_g bigint; e_undo bigint;
  s1 constant uuid := 'c2500000-0000-0000-0000-0000000000a1'; s2 constant uuid := 'c2500000-0000-0000-0000-0000000000a2';
  s3 constant uuid := 'c2500000-0000-0000-0000-0000000000a3'; s4 constant uuid := 'c2500000-0000-0000-0000-0000000000a4';
  v_day uuid := current_setting('test.day1021')::uuid;
begin
  -- 12:39 打卡 → 12:42 取消 → 復原：恢復原本 12:39 的時間，維持準時
  perform _noon_set_done(a, i3, s1, true, '2026-10-21 12:39:00+08');
  e_cancel := (_noon_set_done(a, i3, s1, false, '2026-10-21 12:42:00+08')->>'event_id')::bigint;
  r := _checkin_undo(e_cancel, '2026-10-21 12:43:00+08');
  assert r->>'result' = 'ontime' and r->>'source' = 'student' and (r->>'done_at')::timestamptz = '2026-10-21 12:39:00+08', '復原應回到 12:39 準時';
  assert (select result = 'ontime' and done_at = '2026-10-21 12:39:00+08' from noon_marks
          where student_id = s1 and day_item_id = (select id from noon_day_items where day_id = v_day and template_id = i3)), '資料表也應恢復';
  assert (select action = 'undo' and undo_of = e_cancel and actor = 'student' and prev->>'result' = 'pending' and next->>'result' = 'ontime'
          from checkin_events where id = (r->>'event_id')::bigint), '應記一筆 undo 事件，prev/next 互換';
  begin
    perform _checkin_undo(e_cancel, '2026-10-21 12:44:00+08');
    assert false, '同一筆不應能復原兩次';
  exception when raise_exception then assert sqlerrm = 'checkin_stale', sqlerrm;
  end;
  e_undo := (r->>'event_id')::bigint;
  begin
    perform _checkin_undo(e_undo, '2026-10-21 12:44:00+08');
    assert false, 'undo 事件本身不能復原';
  exception when raise_exception then assert sqlerrm = 'checkin_not_undoable', sqlerrm;
  end;

  -- 12:39 打卡 → 12:42 取消 → 12:43 重打：以 12:43 判定為逾時；取消那筆已被蓋過，不能再復原
  perform _noon_set_done(a, i3, s2, true, '2026-10-21 12:39:00+08');
  e_b := (_noon_set_done(a, i3, s2, false, '2026-10-21 12:42:00+08')->>'event_id')::bigint;
  r := _noon_set_done(a, i3, s2, true, '2026-10-21 12:43:00+08');
  e_c := (r->>'event_id')::bigint;
  assert r->>'result' = 'late' and (r->>'done_at')::timestamptz = '2026-10-21 12:43:00+08', '重打應以 12:43 判定為逾時';
  begin
    perform _checkin_undo(e_b, '2026-10-21 12:44:00+08');
    assert false, '狀態已變動的事件不應能復原';
  exception when raise_exception then assert sqlerrm = 'checkin_stale', sqlerrm;
  end;

  -- 補登也可以復原，回到未完成（source 清空）
  e_fill := (_noon_teacher_fill(a, i3, s3, '2026-10-21 12:30:00+08')->>'event_id')::bigint;
  r := _checkin_undo(e_fill, '2026-10-21 12:31:00+08');
  assert r->>'result' = 'pending' and r->>'source' is null and r->>'done_at' is null, '補登復原後應回到未完成';

  -- 已過 17:00 就不能復原，就算排程還沒跑；16:59:59 還可以
  e_g := (_noon_set_done(a, i3, s4, true, '2026-10-21 12:39:00+08')->>'event_id')::bigint;
  begin
    perform _checkin_undo(e_g, '2026-10-21 17:00:00+08');
    assert false, '17:00 後不能復原';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;
  perform set_config('test.ev_g', e_g::text, true);
end $$;

-- 7a. 請假（10-21）：請假中不能打卡、取消、補登；請假事件的內容；冪等；不能復原；打卡後請假，原本那筆就不能復原
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  i4 uuid := pg_temp.item(a, 4); r jsonb; e_done bigint; e_leave bigint;
  s1 constant uuid := 'c2500000-0000-0000-0000-0000000000a1'; v_day uuid := current_setting('test.day1021')::uuid;
begin
  e_done := (_noon_set_done(a, i4, s1, true, '2026-10-21 12:00:00+08')->>'event_id')::bigint;
  r := _noon_set_leave(a, '2026-10-21', s1, true, '2026-10-21 12:10:00+08');
  e_leave := (r->>'event_id')::bigint;
  assert (r->>'on_leave')::boolean and e_leave is not null and (r->>'day_id')::uuid = v_day, '應標為請假並記事件';
  assert (select action = 'leave' and actor = 'teacher' and day_item_id is null and series = 'noon'
          and prev->>'on_leave' = 'false' and next->>'on_leave' = 'true' from checkin_events where id = e_leave), '請假事件的內容';
  assert (_noon_set_leave(a, '2026-10-21', s1, true, '2026-10-21 12:11:00+08')->>'event_id') is null, '重複標請假不應記事件';

  begin
    perform _noon_set_done(a, i4, s1, false, '2026-10-21 12:12:00+08');
    assert false, '請假中不能取消打卡';
  exception when raise_exception then assert sqlerrm = 'noon_on_leave', sqlerrm;
  end;
  begin
    perform _noon_set_done(a, pg_temp.item(a, 0), s1, true, '2026-10-21 12:12:00+08');
    assert false, '請假中不能打卡';
  exception when raise_exception then assert sqlerrm = 'noon_on_leave', sqlerrm;
  end;
  begin
    perform _noon_teacher_fill(a, pg_temp.item(a, 0), s1, '2026-10-21 12:12:00+08');
    assert false, '請假中不能補登';
  exception when raise_exception then assert sqlerrm = 'noon_on_leave', sqlerrm;
  end;
  begin
    perform _checkin_undo(e_done, '2026-10-21 12:13:00+08');
    assert false, '學生請假中不能復原';
  exception when raise_exception then assert sqlerrm = 'checkin_stale', sqlerrm;
  end;
  begin
    perform _checkin_undo(e_leave, '2026-10-21 12:13:00+08');
    assert false, '請假事件不能復原';
  exception when raise_exception then assert sqlerrm = 'checkin_not_undoable', sqlerrm;
  end;
  r := _noon_set_leave(a, '2026-10-21', s1, false, '2026-10-21 12:20:00+08');
  assert not (r->>'on_leave')::boolean and r->>'event_id' is not null, '取消請假應記事件';
  assert (select action = 'unleave' from checkin_events where id = (r->>'event_id')::bigint), '應記 unleave';
  assert (select result <> 'pending' from noon_marks where student_id = s1
          and day_item_id = (select id from noon_day_items where day_id = v_day and template_id = i4)), '請假期間原本的打卡紀錄保留';
end $$;

-- 7b. 統計（10-22）：請假 2 人時，單項任務的分母 = 人數 − 2；ontime + late + pending = total
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  s1 constant uuid := 'c2500000-0000-0000-0000-0000000000a1'; s2 constant uuid := 'c2500000-0000-0000-0000-0000000000a2';
  s3 constant uuid := 'c2500000-0000-0000-0000-0000000000a3'; s4 constant uuid := 'c2500000-0000-0000-0000-0000000000a4';
  v_day uuid; v_sum jsonb; v_it jsonb;
begin
  -- 那天還沒有紀錄時，今天（相對 p_at）未過 17:00 的請假會建立那一天
  v_day := (_noon_set_leave(a, '2026-10-22', s3, true, '2026-10-22 08:00:00+08')->>'day_id')::uuid;
  perform _noon_set_leave(a, '2026-10-22', s4, true, '2026-10-22 08:01:00+08');
  assert (select count(*) from noon_days where id = v_day and date = '2026-10-22') = 1, '請假應建立那一天';
  begin
    perform _noon_set_done(a, pg_temp.item(a, 0), s3, true, '2026-10-22 12:30:00+08');
    assert false, '請假的學生不能打卡';
  exception when raise_exception then assert sqlerrm = 'noon_on_leave', sqlerrm;
  end;

  perform _noon_set_done(a, pg_temp.item(a, 0), s1, true, '2026-10-22 12:30:00+08');   -- 準時
  perform _noon_set_done(a, pg_temp.item(a, 1), s1, true, '2026-10-22 12:35:00+08');   -- 準時
  perform _noon_set_done(a, pg_temp.item(a, 2), s1, true, '2026-10-22 12:50:00+08');   -- 逾時
  perform _noon_set_done(a, pg_temp.item(a, 0), s2, true, '2026-10-22 12:40:30+08');   -- 準時（12:40:30）
  perform _noon_teacher_fill(a, pg_temp.item(a, 1), s2, '2026-10-22 12:30:00+08');     -- 補登 → 逾時

  v_sum := noon_compute_summary(v_day);
  assert jsonb_array_length(v_sum->'items') = 5 and jsonb_array_length(v_sum->'students') = 4, '5 項任務、4 位學生';
  assert (v_sum->'overall') = '{"ontime":3,"late":2,"pending":5,"total":10,"students":4,"leave_students":2,"items":5}'::jsonb,
    '全班合計：' || (v_sum->'overall')::text;
  v_it := v_sum->'items'->0;
  assert v_it->>'name' = '喝水、上廁所' and v_it->>'deadline' = '12:40' and (v_it->>'sort_order')::int = 0, '第一項任務與 HH:MM 格式的截止時間';
  assert (v_it->>'total')::int = 2 and (v_it->>'leave')::int = 2 and (v_it->>'ontime')::int = 2 and (v_it->>'pending')::int = 0, '第一項：2 人準時';
  assert (v_sum->'items'->1->>'ontime')::int = 1 and (v_sum->'items'->1->>'late')::int = 1, '第二項：1 準時 1 逾時（補登）';
  assert (v_sum->'items'->2->>'late')::int = 1 and (v_sum->'items'->2->>'pending')::int = 1, '第三項：1 逾時 1 未完成';
  assert (v_sum->'items'->3->>'pending')::int = 2 and (v_sum->'items'->4->>'pending')::int = 2, '第四、五項都未完成';
  assert (select bool_and((e->>'ontime')::int + (e->>'late')::int + (e->>'pending')::int = (e->>'total')::int)
          from jsonb_array_elements(v_sum->'items') e), '每項任務：準時 + 逾時 + 未完成 = 應完成數';
  assert (select bool_and((e->>'ontime')::int + (e->>'late')::int + (e->>'pending')::int = (e->>'total')::int)
          from jsonb_array_elements(v_sum->'students') e), '每位學生：準時 + 逾時 + 未完成 = 應完成數';
  assert (v_sum->'students'->0) = format('{"student_id":"%s","student_no":1,"name_zh":"甲","on_leave":false,"ontime":2,"late":1,"pending":2,"total":5}', s1)::jsonb,
    '甲：' || (v_sum->'students'->0)::text;
  assert (v_sum->'students'->1->>'ontime')::int = 1 and (v_sum->'students'->1->>'late')::int = 1 and (v_sum->'students'->1->>'pending')::int = 3,
    '乙：1 準時、1 逾時、3 未完成';
  assert (v_sum->'students'->2) = format('{"student_id":"%s","student_no":3,"name_zh":"丙","on_leave":true,"ontime":0,"late":0,"pending":0,"total":0}', s3)::jsonb,
    '請假的學生全部是 0';
  assert (select count(*) from jsonb_array_elements(v_sum->'students') e where e->>'name_zh' in ('甲','乙','丙','丁')) = 4, '學生依座號排序、全部列出';
  assert (select array_agg((e->>'student_no')::int) from jsonb_array_elements(v_sum->'students') e) = array[1,2,3,4], '依座號排序';

  perform set_config('test.day1022', v_day::text, true);
end $$;

-- 8. 結算：settled_version = 事件數；之後再打卡，事件數就大於 settled_version
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  v_day uuid := current_setting('test.day1022')::uuid; v_sum jsonb; v_events int;
begin
  v_sum := _noon_settle(a, '2026-10-22 13:00:00+08');
  v_events := (select count(*) from checkin_events where day_id = v_day);
  assert (select settled_version = v_events and settled_at = '2026-10-22 13:00:00+08' and settled_summary = v_sum from noon_days where id = v_day),
    '結算應存下時間、版本（事件數）與統計';
  assert v_sum = noon_compute_summary(v_day), '結算回傳的就是統計';
  perform _noon_set_done(a, pg_temp.item(a, 3), 'c2500000-0000-0000-0000-0000000000a1', true, '2026-10-22 12:35:00+08');
  assert (select count(*) from checkin_events where day_id = v_day) > (select settled_version from noon_days where id = v_day), '結算後再打卡，版本應大於 settled_version';
  assert (select settled_summary->'overall'->>'ontime' from noon_days where id = v_day) = '3', '舊的結算內容維持原樣';
  begin
    perform _noon_settle(a, '2026-10-24 17:30:00+08');
    assert false, '已過 17:00 而且沒有紀錄時不能結算';
  exception when raise_exception then assert sqlerrm = 'noon_no_day', sqlerrm;
  end;
  -- 還沒封存的日子可以隨時結算（封存後就不行，見第 10 項）
  perform _noon_settle(a, '2026-10-21 12:00:00+08');
  assert (select settled_at is not null from noon_days where id = current_setting('test.day1021')::uuid), '10-21 尚未封存，應可結算';
end $$;

-- 9. 17:00 封存：schedule；重跑只有一份；跨日補做是 catchup 而且打卡時間不變；封存用最新的打卡重算；15 分鐘門檻
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  v_day21 uuid := current_setting('test.day1021')::uuid; v_day22 uuid := current_setting('test.day1022')::uuid;
  v_before timestamptz; v_day23 uuid; r int;
begin
  r := _noon_archive_due(null, '2026-10-21 16:59:59+08', interval '0', null);
  assert r = 0, '17:00 以前不處理';
  r := _noon_archive_due(null, '2026-10-21 17:03:00+08', interval '0', null);
  assert r = 1, '17:03 應封存 10-21 一天，實際 ' || r;
  assert (select status = 'archived' and archived_by = 'schedule' and archived_at = '2026-10-21 17:03:00+08' and final_summary is not null
          from noon_days where id = v_day21), '準時封存應標 schedule';
  assert _noon_archive_due(null, '2026-10-21 17:08:00+08', interval '0', null) = 0, '第二次不應再處理';
  assert _noon_archive_due(null, '2026-10-21 17:13:00+08', interval '0', null) = 0, '第三次不應再處理';
  assert (select count(*) from noon_days where class_id = a and status = 'archived') = 1, '只有一份封存';
  assert (select status from noon_days where id = v_day22) = 'open', '10-22 還沒到時間，仍是進行中';

  -- 隔天 08:00 開啟時補做：catchup，原本的打卡時間不變；封存的統計包含結算之後的打卡
  v_before := (select done_at from noon_marks where day_id = v_day22 and student_id = 'c2500000-0000-0000-0000-0000000000a1'
               and day_item_id = (select id from noon_day_items where day_id = v_day22 and template_id = pg_temp.item(a, 0)));
  assert _noon_archive_due(null, '2026-10-23 08:00:00+08', interval '0', null) = 1, '隔天補做應處理 10-22';
  assert (select archived_by = 'catchup' and archived_at = '2026-10-23 08:00:00+08' from noon_days where id = v_day22), '跨日補做應標 catchup';
  assert (select done_at from noon_marks where day_id = v_day22 and student_id = 'c2500000-0000-0000-0000-0000000000a1'
          and day_item_id = (select id from noon_day_items where day_id = v_day22 and template_id = pg_temp.item(a, 0))) = v_before, '補做不應改打卡時間';
  assert (select (final_summary->'items'->3->>'ontime')::int = 1 and (settled_summary->'items'->3->>'ontime')::int = 0
          from noon_days where id = v_day22), '封存用最新的打卡重算，不用結算時的結果';

  -- 前端補做（p_min_delay 15 分鐘、p_by catchup）：未滿 15 分鐘不處理
  v_day23 := (_noon_set_done(a, pg_temp.item(a, 0), 'c2500000-0000-0000-0000-0000000000a1', true, '2026-10-23 12:30:00+08')->>'day_id')::uuid;
  assert _noon_archive_due('00000000-0000-0000-0000-0000000000e1', '2026-10-23 17:05:00+08', interval '15 minutes', 'catchup') = 0,
    '17:05 未滿 15 分鐘，前端補做不處理';
  assert _noon_archive_due('00000000-0000-0000-0000-0000000000e2', '2026-10-23 17:20:00+08', interval '15 minutes', 'catchup') = 0,
    '別人的班級不處理';
  assert _noon_archive_due('00000000-0000-0000-0000-0000000000e1', '2026-10-23 17:15:00+08', interval '15 minutes', 'catchup') = 1,
    '滿 15 分鐘才處理';
  assert (select status = 'archived' and archived_by = 'catchup' from noon_days where id = v_day23), '前端補做一律標 catchup';
end $$;

-- 10. 封存後：打卡、取消、補登、復原都拒絕；補標請假成功並重算 final_summary
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  v_day uuid := current_setting('test.day1021')::uuid; i0 uuid := pg_temp.item(a, 0); r jsonb; d0 noon_days; v_final_before jsonb;
  s2 constant uuid := 'c2500000-0000-0000-0000-0000000000a2';
begin
  begin
    perform _noon_set_done(a, i0, s2, true, '2026-10-21 12:50:00+08');
    assert false, '封存後不能打卡';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;
  begin
    perform _noon_set_done(a, i0, 'c2500000-0000-0000-0000-0000000000a1', false, '2026-10-21 12:50:00+08');
    assert false, '封存後不能取消';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;
  begin
    perform _noon_teacher_fill(a, pg_temp.item(a, 2), s2, '2026-10-21 12:50:00+08');
    assert false, '封存後不能補登';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;
  begin
    perform _checkin_undo(current_setting('test.ev_g')::bigint, '2026-10-21 12:50:00+08');
    assert false, '封存後不能復原';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;
  begin
    perform _noon_settle(a, '2026-10-21 12:50:00+08');
    assert false, '封存後不能結算';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;
  begin
    update noon_marks set result = 'pending', done_at = null, source = null where day_id = v_day and student_id = s2;
    assert false, '封存後直接改打卡列應被 trigger 擋下';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;
  begin
    update noon_day_students set name_zh = '改' where day_id = v_day and student_id = s2;
    assert false, '封存後名單快照不能改';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;

  select * into d0 from noon_days where id = v_day;
  v_final_before := d0.final_summary;
  assert d0.revised_at is null, '還沒補標前 revised_at 為空';
  r := _noon_set_leave(a, '2026-10-21', s2, true, '2026-10-22 09:00:00+08');
  assert (r->>'on_leave')::boolean and r->>'event_id' is not null, '封存後可以補標請假';
  assert (select revised_at = '2026-10-22 09:00:00+08' and status = 'archived' and archived_at = d0.archived_at and archived_by = d0.archived_by
          from noon_days where id = v_day), 'revised_at 有值、封存資訊不變';
  assert (select final_summary <> v_final_before and (final_summary->'overall'->>'leave_students')::int = 1
          and (final_summary->'items'->0->>'total')::int = 3 from noon_days where id = v_day), 'final_summary 應重算：請假 1 人，分母 3';
  assert (select (e->>'on_leave')::boolean and (e->>'total')::int = 0 from noon_days d, jsonb_array_elements(d.final_summary->'students') e
          where d.id = v_day and e->>'name_zh' = '乙'), '乙在重算後的統計中是請假';
  r := _noon_set_leave(a, '2026-10-21', s2, false, '2026-10-22 09:30:00+08');
  assert (select revised_at = '2026-10-22 09:30:00+08' and (final_summary->'overall'->>'leave_students')::int = 0 from noon_days where id = v_day),
    '取消請假也會重算';
  assert (select count(*) from checkin_events where day_id = v_day and action in ('leave','unleave') and actor = 'teacher') = 4, '請假相關事件都記錄在案';

  -- 沒有紀錄的日子不能補標（過去、未來、今天但已過 17:00）
  begin
    perform _noon_set_leave(a, '2026-10-19', s2, true, '2026-10-22 09:00:00+08');
    assert false, '過去沒有紀錄的日子不能補標';
  exception when raise_exception then assert sqlerrm = 'noon_no_day', sqlerrm;
  end;
  begin
    perform _noon_set_leave(a, '2026-10-25', s2, true, '2026-10-24 09:00:00+08');
    assert false, '未來的日子不能標';
  exception when raise_exception then assert sqlerrm = 'noon_no_day', sqlerrm;
  end;
  begin
    perform _noon_set_leave(a, '2026-10-24', s2, true, '2026-10-24 17:30:00+08');
    assert false, '已過 17:00 而且沒有紀錄不能標';
  exception when raise_exception then assert sqlerrm = 'noon_no_day', sqlerrm;
  end;
  begin
    perform _noon_set_done(a, i0, s2, true, '2026-10-24 17:30:00+08');
    assert false, '已過 17:00 不能打卡';
  exception when raise_exception then assert sqlerrm = 'noon_closed', sqlerrm;
  end;
end $$;

-- 3b. 快照（AC30）：建立那一天之後，改範本名稱、停用任務、新增學生、改學生姓名，那天的快照都不變；下一天才會用新的
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
do $$
declare
  b constant uuid := 'c2000000-0000-0000-0000-00000000000b';
  r jsonb; v_day20 uuid; v_day21 uuid;
begin
  -- 範本與學生由登入者自己改（noon_items 可直接寫入）
  reset role;
  r := _noon_set_done(b, pg_temp.item(b, 0), 'c2500000-0000-0000-0000-0000000000b1', true, '2026-10-20 12:30:00+08');
  v_day20 := (r->>'day_id')::uuid;
  set local role authenticated;
  update noon_items set name = '喝水改名', deadline = '12:50' where class_id = b and sort_order = 0;
  update noon_items set archived_at = now() where class_id = b and sort_order = 1;
  insert into students (id, class_id, student_no, name_zh) values ('c2500000-0000-0000-0000-0000000000b3', b, 3, '壬');
  update students set name_zh = '戊改' where id = 'c2500000-0000-0000-0000-0000000000b1';
  reset role;

  assert (select name from noon_day_items where day_id = v_day20 and sort_order = 0) = '喝水、上廁所', '10-20 的任務名稱不變';
  assert (select deadline from noon_day_items where day_id = v_day20 and sort_order = 0) = '12:40', '10-20 的截止時間不變';
  assert (select count(*) from noon_day_items where day_id = v_day20) = 5, '10-20 仍有 5 項任務（停用的也在）';
  assert (select count(*) from noon_day_students where day_id = v_day20) = 2, '10-20 的名單不含後來才新增的學生';
  assert (select name_zh from noon_day_students where day_id = v_day20 and student_id = 'c2500000-0000-0000-0000-0000000000b1') = '戊', '10-20 的姓名快照不變';

  r := _noon_set_done(b, pg_temp.item(b, 0), 'c2500000-0000-0000-0000-0000000000b2', true, '2026-10-21 12:45:00+08');
  v_day21 := (r->>'day_id')::uuid;
  assert r->>'result' = 'ontime', '10-21 用新的截止時間 12:50，12:45 準時';
  assert (select count(*) from noon_day_items where day_id = v_day21) = 4, '10-21 不含已停用的任務';
  assert (select name from noon_day_items where day_id = v_day21 and sort_order = 0) = '喝水改名', '10-21 使用新名稱';
  assert (select count(*) from noon_day_students where day_id = v_day21) = 3, '10-21 包含新學生';
  assert (select name_zh from noon_day_students where day_id = v_day21 and student_id = 'c2500000-0000-0000-0000-0000000000b1') = '戊改', '10-21 使用新姓名';
  begin
    perform _noon_set_done(b, pg_temp.item(b, 1), 'c2500000-0000-0000-0000-0000000000b2', true, '2026-10-21 12:46:00+08');
    assert false, '已停用的任務不在新的一天';
  exception when raise_exception then assert sqlerrm = 'noon_no_item', sqlerrm;
  end;
end $$;

-- 11. 名單 trigger（需要「今天」的紀錄，用 now() 建立；台北時間已過 17:00 就跳過）
do $$
declare
  c constant uuid := 'c2000000-0000-0000-0000-00000000000c';
  s1 constant uuid := 'c2500000-0000-0000-0000-0000000000c1'; s2 constant uuid := 'c2500000-0000-0000-0000-0000000000c2';
  s3 constant uuid := 'c2500000-0000-0000-0000-0000000000c3';
  v_at timestamptz := now(); v_day uuid; v_mark noon_marks; r jsonb; v_settled int;
begin
  if (v_at at time zone 'Asia/Taipei')::time >= time '17:00' then
    raise notice '台北時間已過 17:00，跳過名單 trigger 的「今天」測試';
    return;
  end if;
  v_day := (_noon_set_done(c, pg_temp.item(c, 0), s1, true, v_at)->>'day_id')::uuid;
  assert (select date = (v_at at time zone 'Asia/Taipei')::date from noon_days where id = v_day), '今天的紀錄';
  assert (select count(*) from noon_day_students where day_id = v_day) = 2 and (select count(*) from noon_marks where day_id = v_day) = 10, '建立時 2 人 × 5 項';

  -- 新增學生：補進名單與 5 列 pending
  insert into students (id, class_id, student_no, name_zh) values (s3, c, 3, '壬');
  assert (select count(*) from noon_day_students where day_id = v_day and student_id = s3 and removed_at is null) = 1, '新學生應補進當天名單';
  assert (select count(*) from noon_marks where day_id = v_day and student_id = s3 and result = 'pending') = 5, '新學生應有 5 列未完成';
  assert (select (noon_compute_summary(v_day)->'overall'->>'students')::int) = 3, '統計包含新學生';

  -- 轉出：填 removed_at；打卡列保留；不再計入統計，也不能打卡
  update students set left_at = now() where id = s3;
  assert (select removed_at is not null from noon_day_students where day_id = v_day and student_id = s3), '轉出應填 removed_at';
  assert (select count(*) from noon_marks where day_id = v_day and student_id = s3) = 5, '轉出不刪打卡列';
  assert (select (noon_compute_summary(v_day)->'overall'->>'students')::int) = 2, '轉出的學生不計入統計';
  begin
    perform _noon_set_done(c, pg_temp.item(c, 0), s3, true, v_at);
    assert false, '轉出的學生不能打卡';
  exception when raise_exception then assert sqlerrm = 'checkin_no_student', sqlerrm;
  end;

  -- 復學：清掉 removed_at；已打卡的人轉出再復學，原本的結果保留
  update students set left_at = null where id = s3;
  assert (select removed_at is null from noon_day_students where day_id = v_day and student_id = s3), '復學應清掉 removed_at';
  assert (select count(*) from noon_marks where day_id = v_day and student_id = s3) = 5, '復學後仍是 5 列，沒有重複';
  select * into v_mark from noon_marks where day_id = v_day and student_id = s1 and day_item_id = (select id from noon_day_items where day_id = v_day and template_id = pg_temp.item(c, 0));
  update students set left_at = now() where id = s1;
  update students set left_at = null where id = s1;
  assert (select result = v_mark.result and done_at = v_mark.done_at from noon_marks
          where day_item_id = v_mark.day_item_id and student_id = s1), '轉出再復學，原本的打卡結果保留';

  -- noon_today：有紀錄時回傳 day_id、狀態與版本（= 事件數）；結算後再打卡，版本大於 settled_version
  r := noon_today(c);
  assert (r->>'day_id')::uuid = v_day and r->>'status' = 'open' and (r->>'version')::int = 1 and not (r->>'after_cutoff')::boolean, 'noon_today：' || r::text;
  perform _noon_settle(c, v_at);
  v_settled := (select settled_version from noon_days where id = v_day);
  assert v_settled = 1, '結算時版本為 1';
  perform _noon_set_done(c, pg_temp.item(c, 1), s2, true, v_at);
  assert (noon_today(c)->>'version')::int = 2 and (noon_today(c)->>'version')::int > v_settled, '結算後再打卡，版本變大';
end $$;

-- 12. RLS 與權限
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  s1 constant uuid := 'c2500000-0000-0000-0000-0000000000a1';
  v_day uuid := current_setting('test.day1021')::uuid; v_mark_day uuid;
begin
  assert (select count(*) from noon_days where class_id = a) = 3, 'A 老師看得到自己的 3 天';
  assert (select count(*) from noon_marks where day_id = v_day) = 20 and (select count(*) from noon_day_items where day_id = v_day) = 5
     and (select count(*) from noon_day_students where day_id = v_day) = 4, '讀得到自己的快照與打卡列';

  -- 自己能改範本，但不能刪
  update noon_items set name = '整理書包（新）' where class_id = a and sort_order = 4;
  begin
    delete from noon_items where class_id = a;
    assert false, '不應能刪除範本';
  exception when insufficient_privilege then null;
  end;
  -- 其餘的表不能直接寫入
  begin
    update noon_marks set result = 'pending', done_at = null, source = null where day_id = v_day;
    assert false, '不應能直接修改 noon_marks';
  exception when insufficient_privilege then null;
  end;
  begin
    update noon_day_students set on_leave = true where day_id = v_day;
    assert false, '不應能直接修改 noon_day_students';
  exception when insufficient_privilege then null;
  end;
  begin
    update noon_days set status = 'open' where id = v_day;
    assert false, '不應能直接修改 noon_days';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into noon_days (class_id, date, scheduled_archive_at) values (a, '2026-10-01', now());
    assert false, '不應能直接新增 noon_days';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into checkin_events (owner_id, class_id, series, student_id, action, actor)
    values (auth.uid(), a, 'noon', s1, 'done', 'student');
    assert false, '不應能直接新增事件';
  exception when insufficient_privilege then null;
  end;
  -- 內部函式、排程專用函式、統計函式都不能呼叫
  begin perform _noon_set_done(a, pg_temp.item(a, 0), s1, true, now()); assert false, '_noon_set_done';
  exception when insufficient_privilege then null; end;
  begin perform _noon_teacher_fill(a, pg_temp.item(a, 0), s1, now()); assert false, '_noon_teacher_fill';
  exception when insufficient_privilege then null; end;
  begin perform _noon_set_leave(a, '2026-10-21', s1, true, now()); assert false, '_noon_set_leave';
  exception when insufficient_privilege then null; end;
  begin perform _noon_settle(a, now()); assert false, '_noon_settle';
  exception when insufficient_privilege then null; end;
  begin perform _noon_ensure_day(a, now()); assert false, '_noon_ensure_day';
  exception when insufficient_privilege then null; end;
  begin perform _noon_write_mark(a, pg_temp.item(a, 0), s1, 'done', now()); assert false, '_noon_write_mark';
  exception when insufficient_privilege then null; end;
  begin perform _noon_archive_due(null, now(), interval '0', null); assert false, '_noon_archive_due';
  exception when insufficient_privilege then null; end;
  begin perform noon_archive_due(); assert false, 'noon_archive_due';
  exception when insufficient_privilege then null; end;
  begin perform noon_compute_summary(v_day); assert false, 'noon_compute_summary';
  exception when insufficient_privilege then null; end;
  begin perform _checkin_undo(current_setting('test.ev_g')::bigint, now()); assert false, '_checkin_undo';
  exception when insufficient_privilege then null; end;
  -- 公開 RPC 可以呼叫
  assert noon_today(a) is not null, '自己的班級可以呼叫 noon_today';
  -- B 班 10-20、10-21 的兩天還開著，開頁面時補封存：標 catchup，再呼叫就沒有了
  assert noon_archive_due_mine() = 2, '應補封存 B 班過去的兩天';
  assert (select count(*) from noon_days where class_id = 'c2000000-0000-0000-0000-00000000000b' and status = 'archived' and archived_by = 'catchup') = 2,
    '補封存一律標 catchup';
  assert noon_archive_due_mine() = 0, '再呼叫不會重複處理';
end $$;

-- 改以 B 老師登入：看不到、也寫不進 A 老師的資料
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
do $$
declare
  a constant uuid := 'c2000000-0000-0000-0000-00000000000a';
  s1 constant uuid := 'c2500000-0000-0000-0000-0000000000a1';
  i0 uuid; v_ev bigint := current_setting('test.ev_g')::bigint;
begin
  assert (select count(*) from noon_days) = 0 and (select count(*) from noon_day_items) = 0
     and (select count(*) from noon_day_students) = 0 and (select count(*) from noon_marks) = 0, 'B 不應看到 A 的中午紀錄';
  assert (select count(*) from checkin_events) = 0, 'B 不應看到 A 的事件';
  assert (select count(*) from noon_items) = 5 and (select count(*) from noon_items where class_id = a) = 0, 'B 只看得到自己班級的 5 項範本';
  i0 := (select id from noon_items limit 1);
  begin perform noon_set_done(a, i0, s1, true); assert false, 'B 不應能替 A 的學生打卡';
  exception when insufficient_privilege then null; end;
  begin perform noon_teacher_fill(a, i0, s1); assert false, 'B 不應能替 A 的學生補登';
  exception when insufficient_privilege then null; end;
  begin perform noon_set_leave(a, '2026-10-21', s1, true); assert false, 'B 不應能替 A 的學生標請假';
  exception when insufficient_privilege then null; end;
  begin perform noon_settle(a); assert false, 'B 不應能結算 A 的班級';
  exception when insufficient_privilege then null; end;
  begin perform noon_today(a); assert false, 'B 不應能讀 A 的 noon_today';
  exception when insufficient_privilege then null; end;
  begin perform checkin_undo(v_ev); assert false, 'B 不應能復原 A 的操作';
  exception when insufficient_privilege then null; end;
  begin
    insert into noon_items (class_id, name) values (a, '入侵');
    assert false, 'B 不應能在 A 的班級新增範本';
  exception when insufficient_privilege then null;
  end;
  update noon_items set name = '被改' where class_id = a;
  assert not exists (select 1 from noon_items where name = '被改'), 'B 改不到 A 的範本';
  assert noon_archive_due_mine() = 0, 'B 的補封存不會動 A 的資料';
end $$;

select 'CHECKIN C2 DB TESTS PASSED' as result;
rollback;
