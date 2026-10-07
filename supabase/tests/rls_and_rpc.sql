-- RLS 隔離與 RPC 測試。以 postgres 身分執行；用 set_config 模擬登入者。
-- 執行方式見 scripts/db-test.sh（在本機暫時的 Postgres 上跑，含 auth 的最小替身）。
\set ON_ERROR_STOP 1
begin;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');

-- 以 A 登入，建立班級、學生、作業項目
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into classes (id, name, school_year) values ('10000000-0000-0000-0000-000000000001', '311', 115);
insert into students (id, class_id, student_no, name_zh) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, '測試學生01'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 2, '測試學生02');
insert into homework_items (id, subject, name) values ('30000000-0000-0000-0000-000000000001', '國語', '國習');

-- create_assignment 為每位在籍學生建立 missing
do $$
declare v uuid; n int;
begin
  v := create_assignment('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'P.12', '2026-10-07');
  select count(*) into n from homework_checks where assignment_id = v and status = 'missing';
  assert n = 2, format('create_assignment 應建立 2 筆 missing，實際 %s', n);
end $$;

-- 交易與利息：餘額 100 → 利息 5；餘額 ≤ 0 不計息
insert into coin_transactions (class_id, student_id, delta, reason) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 100, '存款'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', -10, '提款');
do $$
begin
  assert apply_interest('20000000-0000-0000-0000-000000000001', 0.05) = 5, '餘額 100 的利息應為 5';
  assert apply_interest('20000000-0000-0000-0000-000000000002', 0.05) = 0, '負餘額不計息';
  assert (select balance from student_balances where student_id = '20000000-0000-0000-0000-000000000001') = 105, '餘額應為 105';
end $$;

-- 作廢後餘額扣除，且 audit_log 有紀錄
update coin_transactions set voided_at = now() where reason = '利息';
do $$
begin
  assert (select balance from student_balances where student_id = '20000000-0000-0000-0000-000000000001') = 100, '作廢後餘額應回到 100';
  assert exists (select 1 from audit_log where table_name = 'coin_transactions' and op = 'UPDATE'), 'audit_log 應有紀錄';
end $$;

-- 同座號在籍學生不可重複
do $$
begin
  begin
    insert into students (class_id, student_no, name_zh) values ('10000000-0000-0000-0000-000000000001', 1, '重複');
    assert false, '重複座號應被拒絕';
  exception when unique_violation then null;
  end;
end $$;

-- 座位表：一組只能一位組長、一位學生只能坐一個位置
insert into seating_layouts (id, class_id, name, is_current) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '10 月', true);
insert into seat_assignments (layout_id, "row", col, student_id, is_leader) values
  ('40000000-0000-0000-0000-000000000001', 0, 5, '20000000-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    insert into seat_assignments (layout_id, "row", col, student_id, is_leader) values
      ('40000000-0000-0000-0000-000000000001', 1, 5, '20000000-0000-0000-0000-000000000002', true);
    assert false, '同組第二位組長應被拒絕';
  exception when unique_violation then null;
  end;
  begin
    insert into seat_assignments (layout_id, "row", col, student_id) values
      ('40000000-0000-0000-0000-000000000001', 2, 2, '20000000-0000-0000-0000-000000000001');
    assert false, '同一位學生坐兩個位置應被拒絕';
  exception when unique_violation then null;
  end;
end $$;

-- 改以 B 登入：看不到、也寫不進 A 的資料
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
begin
  assert (select count(*) from classes) = 0, 'B 不應看到 A 的班級';
  assert (select count(*) from students) = 0, 'B 不應看到 A 的學生';
  assert (select count(*) from coin_transactions) = 0, 'B 不應看到 A 的交易';
  assert (select count(*) from homework_checks) = 0, 'B 不應看到 A 的作業紀錄';
  assert (select count(*) from audit_log) = 0, 'B 不應看到 A 的 audit_log';
  assert (select count(*) from holidays) > 0, '國定假日所有人可讀';
  begin
    insert into students (class_id, student_no, name_zh) values ('10000000-0000-0000-0000-000000000001', 9, '入侵');
    assert false, 'B 不應能把學生加到 A 的班級';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into coin_transactions (class_id, student_id, delta, reason)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 999, '入侵');
    assert false, 'B 不應能替 A 的學生加幣';
  exception when insufficient_privilege then null;
  end;
  update students set name_zh = '改名' where id = '20000000-0000-0000-0000-000000000001';
  begin
    perform apply_interest('20000000-0000-0000-0000-000000000001', 0.05);
    assert false, 'B 不應能替 A 的學生計息';
  exception when raise_exception then null;
  end;
end $$;

-- 回到 A 確認 B 的 update 沒有生效
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
begin
  assert (select name_zh from students where id = '20000000-0000-0000-0000-000000000001') = '測試學生01', 'B 的修改不應生效';
end $$;

select 'ALL DB TESTS PASSED' as result;
rollback;
