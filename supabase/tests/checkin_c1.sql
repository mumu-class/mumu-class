-- 任務打卡 C1：一般任務的 RPC、名單 trigger、復原、封存與權限。
-- 以 postgres 連線；用 set_config 模擬登入者，用 set local role 切換成 authenticated。
-- 內部函式 _task_set_done 只授權給 postgres，測試用它指定打卡時間（設計 §10「可控的測試時鐘」）。
-- DO 區塊之間用 set_config('test.*') 傳遞產生的 id。
\set ON_ERROR_STOP 1
begin;

insert into auth.users values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
insert into classes (id, name, school_year) values ('0c000000-0000-0000-0000-000000000001', '311', 115);
insert into students (id, class_id, student_no, name_zh) values
  ('05000000-0000-0000-0000-000000000001', '0c000000-0000-0000-0000-000000000001', 1, '甲'),
  ('05000000-0000-0000-0000-000000000002', '0c000000-0000-0000-0000-000000000001', 2, '乙'),
  ('05000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000001', 3, '丙');

-- 1. task_create：為每位在籍學生建一列 pending、寫入姓名快照；同一格只能有一項進行中的任務
do $$
declare v uuid;
begin
  v := task_create('0c000000-0000-0000-0000-000000000001', 1, '閱讀認證', '2026-10-23', null, '');
  assert (select count(*) from checkin_task_marks where task_id = v and state = 'pending') = 3, 'task_create 應建立 3 列 pending';
  assert (select name_zh from checkin_task_marks where task_id = v and student_id = '05000000-0000-0000-0000-000000000002') = '乙', '應寫入姓名快照';
  begin
    perform task_create('0c000000-0000-0000-0000-000000000001', 1, '重複', null, null, '');
    assert false, '同一格第二項進行中的任務應被拒絕';
  exception when unique_violation then null;
  end;
  perform set_config('test.task1', v::text, true);
end $$;

-- 2. 打卡；重送同一個狀態不重複記事件；不能直接改 marks、不能直接建任務、不能呼叫內部函式
do $$
declare t uuid := current_setting('test.task1')::uuid; r jsonb;
begin
  r := task_set_done(t, '05000000-0000-0000-0000-000000000001', true);
  assert r->>'state' = 'done' and r->>'event_id' is not null and r->>'done_at' is not null, '打卡應回傳 done、打卡時間與事件 id';
  perform set_config('test.event1', r->>'event_id', true);
  r := task_set_done(t, '05000000-0000-0000-0000-000000000001', true);
  assert r->>'event_id' is null, '重送同一個狀態不應再記事件';
  assert (select count(*) from checkin_events where task_id = t) = 1, '應只有 1 筆事件';
  begin
    update checkin_task_marks set state = 'done' where task_id = t;
    assert false, '不應能直接修改 checkin_task_marks';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into checkin_tasks (class_id, slot, name) values ('0c000000-0000-0000-0000-000000000001', 2, '繞過 RPC');
    assert false, '不應能直接新增 checkin_tasks';
  exception when insufficient_privilege then null;
  end;
  begin
    perform _task_set_done(t, '05000000-0000-0000-0000-000000000001', false, now());
    assert false, '登入者不應能呼叫內部函式';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. 復原（AC17）：取消後按復原，恢復原本的打卡時間；同一筆不能復原兩次；狀態已被改掉時拒絕
reset role;
do $$
declare t uuid := current_setting('test.task1')::uuid; e_cancel bigint; e_first bigint; r jsonb;
begin
  perform _task_set_done(t, '05000000-0000-0000-0000-000000000002', true, '2026-10-23 12:39:00+08');
  e_cancel := (_task_set_done(t, '05000000-0000-0000-0000-000000000002', false, '2026-10-23 12:45:00+08')->>'event_id')::bigint;
  r := checkin_undo(e_cancel);
  assert r->>'state' = 'done', '復原後應回到 done';
  assert (select done_at from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000002')
         = '2026-10-23 12:39:00+08', '復原應恢復原本 12:39 的打卡時間';
  begin
    perform checkin_undo(e_cancel);
    assert false, '同一筆不應能復原兩次';
  exception when raise_exception then assert sqlerrm = 'checkin_stale', sqlerrm;
  end;

  -- 取消後重新打卡：以重新打卡的時間為準；第一次打卡那筆已被後來的操作蓋過，不能再復原
  e_first := (_task_set_done(t, '05000000-0000-0000-0000-000000000003', true, '2026-10-23 12:30:00+08')->>'event_id')::bigint;
  perform _task_set_done(t, '05000000-0000-0000-0000-000000000003', false, '2026-10-23 12:31:00+08');
  perform _task_set_done(t, '05000000-0000-0000-0000-000000000003', true, '2026-10-23 12:50:00+08');
  assert (select done_at from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000003')
         = '2026-10-23 12:50:00+08', '重新打卡應以 12:50 為準';
  begin
    perform checkin_undo(e_first);
    assert false, '狀態已變動的事件不應能復原';
  exception when raise_exception then assert sqlerrm = 'checkin_stale', sqlerrm;
  end;
end $$;

-- 4. 免交：清掉打卡時間、不能再打卡、不算分母
set local role authenticated;
do $$
declare t uuid := current_setting('test.task1')::uuid; r jsonb;
begin
  r := task_set_exempt(t, '05000000-0000-0000-0000-000000000003', true);
  assert r->>'state' = 'exempt' and r->>'event_id' is not null, '應標為免交並記事件';
  assert (select done_at from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000003') is null, '免交應清掉打卡時間';
  begin
    perform task_set_done(t, '05000000-0000-0000-0000-000000000003', false);
    assert false, '免交的學生不應能打卡或取消';
  exception when raise_exception then assert sqlerrm = 'checkin_exempt', sqlerrm;
  end;
  -- 甲、乙完成，丙免交 → 應完成 2、完成 2、免交 1
  assert (select (total, done, exempt) = (2, 2, 1) from checkin_task_stats where task_id = t), '統計應為 total 2、done 2、exempt 1';
end $$;

-- 5. 名單異動（設計 §5.5）：新同學補一列、轉出不算、復學恢復原本的狀態
insert into students (id, class_id, student_no, name_zh) values
  ('05000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-000000000001', 4, '丁');
do $$
declare t uuid := current_setting('test.task1')::uuid;
begin
  assert exists (select 1 from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000004' and state = 'pending'),
    '新同學應補進進行中的任務';
  update students set left_at = now() where id = '05000000-0000-0000-0000-000000000001';
  assert (select removed_at is not null from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000001'), '轉出應填 removed_at';
  assert (select (total, done) = (2, 1) from checkin_task_stats where task_id = t), '轉出的學生不算分母：乙完成、丁未完成';
  update students set left_at = null where id = '05000000-0000-0000-0000-000000000001';
  assert (select removed_at is null and state = 'done' from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000001'),
    '復學應恢復原本的狀態';
end $$;

-- 6. 封存：只能直接改名稱等欄位；封存時更新姓名快照；封存後不能修改；格子騰出來；之後改名、轉出不影響舊紀錄
update students set name_zh = '乙乙' where id = '05000000-0000-0000-0000-000000000002';
do $$
declare t uuid := current_setting('test.task1')::uuid; b uuid;
begin
  update checkin_tasks set name = '閱讀認證（上）' where id = t;
  begin
    update checkin_tasks set status = 'archived' where id = t;
    assert false, '不應能直接改任務狀態';
  exception when insufficient_privilege then null;
  end;

  b := task_archive(array[t], 'round');
  assert (select status = 'archived' and batch_id = b and archived_at is not null from checkin_tasks where id = t), '任務應封存';
  assert (select title like '%任務紀錄' and kind = 'round' from checkin_batches where id = b), '批次應有預設標題';
  assert (select name_zh from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000002') = '乙乙',
    '封存時應更新姓名快照';
  begin
    perform task_set_done(t, '05000000-0000-0000-0000-000000000004', true);
    assert false, '封存後不應能打卡';
  exception when raise_exception then assert sqlerrm = 'checkin_archived', sqlerrm;
  end;
  begin
    update checkin_tasks set name = '改名' where id = t;
    assert false, '封存後不應能改任務';
  exception when raise_exception then assert sqlerrm = 'checkin_archived', sqlerrm;
  end;
  begin
    perform task_archive(array[t], 'round');
    assert false, '不應能重複封存';
  exception when raise_exception then assert sqlerrm = 'checkin_archive_invalid', sqlerrm;
  end;

  perform task_create('0c000000-0000-0000-0000-000000000001', 1, '新任務', null, null, '');
  update students set name_zh = '乙三', left_at = now() where id = '05000000-0000-0000-0000-000000000002';
  assert (select name_zh = '乙乙' and removed_at is null from checkin_task_marks where task_id = t and student_id = '05000000-0000-0000-0000-000000000002'),
    '封存後的紀錄不受改名、轉出影響';
end $$;

-- 7. 設定：可以存 PIN；午餐時序有預設值；hash 與 salt 必須一起設定
do $$
begin
  insert into checkin_settings (class_id, pin_hash, pin_salt) values ('0c000000-0000-0000-0000-000000000001', 'h', 's')
  on conflict (class_id) do update set pin_hash = excluded.pin_hash, pin_salt = excluded.pin_salt;
  assert (select pin_hash from checkin_settings) = 'h', '應能設定 PIN';
  assert (select jsonb_array_length(noon_timeline) from checkin_settings) = 3, '午餐時序應有預設值';
  begin
    update checkin_settings set pin_salt = null;
    assert false, '只有 hash 沒有 salt 應被拒絕';
  exception when check_violation then null;
  end;
end $$;

-- 8. 改以 B 登入：看不到、也改不到 A 的資料
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
do $$
declare t uuid := current_setting('test.task1')::uuid;
begin
  assert (select count(*) from checkin_tasks) = 0, 'B 不應看到 A 的任務';
  assert (select count(*) from checkin_task_marks) = 0, 'B 不應看到 A 的打卡';
  assert (select count(*) from checkin_events) = 0, 'B 不應看到 A 的事件';
  assert (select count(*) from checkin_batches) = 0, 'B 不應看到 A 的封存批次';
  assert (select count(*) from checkin_settings) = 0, 'B 不應看到 A 的設定';
  assert (select count(*) from checkin_task_stats) = 0, 'B 不應看到 A 的統計';
  begin
    perform task_create('0c000000-0000-0000-0000-000000000001', 2, '入侵', null, null, '');
    assert false, 'B 不應能在 A 的班級建任務';
  exception when insufficient_privilege then null;
  end;
  begin
    perform task_set_done(t, '05000000-0000-0000-0000-000000000004', true);
    assert false, 'B 不應能替 A 的學生打卡';
  exception when insufficient_privilege then null;
  end;
  begin
    perform checkin_undo(current_setting('test.event1')::bigint);
    assert false, 'B 不應能復原 A 的操作';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into checkin_settings (class_id, pin_hash, pin_salt) values ('0c000000-0000-0000-0000-000000000001', 'x', 'y');
    assert false, 'B 不應能寫 A 的設定';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'CHECKIN C1 DB TESTS PASSED' as result;
rollback;
