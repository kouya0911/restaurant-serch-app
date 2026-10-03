-- 008_visit_hours_test: visit_hour 列・visit_slot_start()・visit_time_check()・新しい verify_visit() の動作テスト。
-- SQL Editor に貼って1回実行するだけ。
--
-- 【使い方】
--   全文を貼って Run。最後の表に、チェックごとの ✅ OK / ❌ NG が出る。
--   最終行「総合(NGの件数)」が 0 ならすべて期待どおり。書き換える箇所はない。
--   テストに使うユーザーは auth.users の先頭の1人(データは残らないので誰でも良い)。
--   時間未定の予定のルールは、既存の 003_verify_visit_test.sql を再実行して確かめる(NG 0 のままであること)。
--
-- 【データが残らない仕組み】 002/003/004 のテストと同じ
--   テスト用の stores / visit_plans は関数内の副トランザクションで作り、最後に必ず例外を投げて全部 rollback する。
--   関数は pg_temp(このセッション限り)に作る。本物のデータは読みも書きもしない(テスト用 place_id は '__h_...')。
--
-- 【時刻の作り方】
--   now() はトランザクションの中で変わらない。H = 今の「〇時ちょうど」(H <= 今 < H+1時間)を基準に、
--   予定の時間帯の始まり(start)と宣言の時刻(created_at)を相対で作るので、いつ実行しても結果は同じ。
--   ただし start は必ず「〇時ちょうど」なので、「15分前ちょうど」のような境界の時刻は verify_visit では作れない。
--   境界は、時刻を引数で受け取る visit_time_check() に固定の時刻を渡して確かめる(B)。
--   verify_visit がその visit_time_check を使っていることは C と E で確かめる。
--
-- 表の見方: 期待 = 関数の戻り値 (ok / too_early / ...) / denied(SQLSTATE) (権限・制約エラー) / true・false・件数

create function pg_temp.t_my_uid() returns uuid language sql as
$$ select id from auth.users order by created_at limit 1 $$;

create function pg_temp.t_add(res jsonb, p_name text, p_expected text, p_actual text)
returns jsonb language sql as $$
  select res || jsonb_build_array(jsonb_build_object(
    'n', jsonb_array_length(res) + 1,
    'name', p_name, 'expected', p_expected, 'actual', coalesce(p_actual, '(null)'),
    'ok', (coalesce(p_actual, '(null)') = p_expected)
          or (p_expected = 'denied' and p_actual like 'denied%')
  ))
$$;

-- 指定ロール・指定ユーザーとして SQL を1本実行し、1行1列目のテキストを返す
create function pg_temp.t_call(p_role text, p_uid uuid, p_sql text)
returns text language plpgsql as $$
declare
  out text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into out;
  exception when others then
    out := 'denied(' || sqlstate || ')';
  end;
  reset role;
  return out;
end $$;

-- 時間帯ありの予定を作る。p_start(〇時ちょうど)から visit_date / visit_hour を日本時間で求める
create function pg_temp.t_plan(p_uid uuid, p_place text, p_start timestamptz, p_created timestamptz, p_visited boolean)
returns bigint language sql as $$
  insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visit_hour, created_at, visited_at)
  values (p_uid, p_place, 'テスト',
          (p_start at time zone 'Asia/Tokyo')::date,
          extract(hour from p_start at time zone 'Asia/Tokyo')::smallint,
          p_created,
          case when p_visited then now() end)
  returning id
$$;

-- 時間未定(visit_hour = null)の予定を作る
create function pg_temp.t_plan_nohour(p_uid uuid, p_place text, p_date date, p_visited boolean)
returns bigint language sql as $$
  insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visited_at)
  values (p_uid, p_place, 'テスト', p_date, case when p_visited then now() end)
  returning id
$$;

-- verify_visit を本人(authenticated)として呼ぶ
create function pg_temp.t_verify(p_uid uuid, p_plan bigint, p_code text)
returns text language sql as $$
  select pg_temp.t_call('authenticated', p_uid, format('select public.verify_visit(%s, %L)', p_plan, p_code))
$$;

-- visit_time_check の結果。通るなら 'ok'
create function pg_temp.t_check(p_created timestamptz, p_start timestamptz, p_at timestamptz)
returns text language sql as $$
  select coalesce(public.visit_time_check(p_created, p_start, p_at), 'ok')
$$;

create function pg_temp.t_run()
returns table (n int, check_name text, expected text, actual text, result text)
language plpgsql as $$
declare
  my_uid    uuid := pg_temp.t_my_uid();
  jst_today date := (now() at time zone 'Asia/Tokyo')::date;
  h         timestamptz := date_trunc('hour', now());   -- 今の「〇時ちょうど」(日本時間も同じ時刻で区切れる)
  s         timestamptz := '2026-10-03 12:00:00+09';     -- B の境界テスト用の固定の始まり(12時台)
  res       jsonb := '[]'::jsonb;
  p_win     bigint;  -- 時間帯の中・宣言は始まりの2時間前
  p_edge    bigint;  -- 時間帯の中・宣言はちょうど1時間前
  p_late    bigint;  -- 時間帯の中・宣言は59分前
  p_early   bigint;  -- 始まりが2時間後
  p_exp     bigint;  -- 始まりが4時間前
  p_order   bigint;  -- 宣言が遅く、しかも時間前
  p_vis     bigint;  -- 認証済み(しかも時間前)
  p_nostore bigint;  -- 時間帯の中・店なし
  p_leg     bigint;  -- 時間未定・今日
  p_leg_tm  bigint;  -- 時間未定・明日
  p_leg_vis bigint;  -- 時間未定・今日・認証済み
  ng        int;
begin
  if my_uid is null then
    raise exception 'auth.users にユーザーがいません(先に一度ログインしてください)';
  end if;

  -- A. 列と時間帯の始まり ------------------------------------------------------
  res := pg_temp.t_add(res, '列: visit_hour は smallint・null 可', 'smallint/YES',
    (select data_type || '/' || is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'visit_plans' and column_name = 'visit_hour'));
  res := pg_temp.t_add(res, '始まり: 10/3 の12時台 = 03:00 UTC', '2026-10-03 03:00',
    to_char(public.visit_slot_start('2026-10-03', 12::smallint) at time zone 'UTC', 'YYYY-MM-DD HH24:MI'));
  res := pg_temp.t_add(res, '始まり: 10/3 の23時台 = 14:00 UTC', '2026-10-03 14:00',
    to_char(public.visit_slot_start('2026-10-03', 23::smallint) at time zone 'UTC', 'YYYY-MM-DD HH24:MI'));
  res := pg_temp.t_add(res, '始まり: 10/4 の0時台 = 前日 15:00 UTC', '2026-10-03 15:00',
    to_char(public.visit_slot_start('2026-10-04', 0::smallint) at time zone 'UTC', 'YYYY-MM-DD HH24:MI'));
  res := pg_temp.t_add(res, '始まり: 時が null なら null', '(null)',
    public.visit_slot_start('2026-10-03', null)::text);

  -- B. 時刻のルールの境界(固定の時刻。start = 10/3 12:00 日本時間) ----------------
  res := pg_temp.t_add(res, '境界: 始まりの15分前ちょうど → ok', 'ok',
    pg_temp.t_check(s - interval '2 hours', s, s - interval '15 minutes'));
  res := pg_temp.t_add(res, '境界: 始まりの16分前 → too_early', 'too_early',
    pg_temp.t_check(s - interval '2 hours', s, s - interval '16 minutes'));
  res := pg_temp.t_add(res, '境界: 15分前の1秒前 → too_early', 'too_early',
    pg_temp.t_check(s - interval '2 hours', s, s - interval '15 minutes 1 second'));
  res := pg_temp.t_add(res, '境界: 始まりちょうど → ok', 'ok',
    pg_temp.t_check(s - interval '2 hours', s, s));
  res := pg_temp.t_add(res, '境界: 始まりの3時間後ちょうど → ok', 'ok',
    pg_temp.t_check(s - interval '2 hours', s, s + interval '3 hours'));
  res := pg_temp.t_add(res, '境界: 3時間後の1秒後 → expired', 'expired',
    pg_temp.t_check(s - interval '2 hours', s, s + interval '3 hours 1 second'));
  res := pg_temp.t_add(res, '境界: 宣言がちょうど1時間前 → ok', 'ok',
    pg_temp.t_check(s - interval '1 hour', s, s));
  res := pg_temp.t_add(res, '境界: 宣言が59分前 → late_declaration', 'late_declaration',
    pg_temp.t_check(s - interval '59 minutes', s, s));
  res := pg_temp.t_add(res, '境界: 宣言が1時間前の1秒後 → late_declaration', 'late_declaration',
    pg_temp.t_check(s - interval '59 minutes 59 seconds', s, s));
  res := pg_temp.t_add(res, '順番: 宣言が遅く、しかも16分前 → late_declaration が先', 'late_declaration',
    pg_temp.t_check(s - interval '30 minutes', s, s - interval '16 minutes'));
  res := pg_temp.t_add(res, '順番: 宣言が遅く、しかも期限切れ → late_declaration が先', 'late_declaration',
    pg_temp.t_check(s - interval '30 minutes', s, s + interval '4 hours'));
  res := pg_temp.t_add(res, '日またぎ: 23時台は翌日 02:00 ちょうどまで ok', 'ok',
    pg_temp.t_check('2026-10-03 20:00:00+09', public.visit_slot_start('2026-10-03', 23::smallint), '2026-10-04 02:00:00+09'));
  res := pg_temp.t_add(res, '日またぎ: 23時台は翌日 02:00 を過ぎたら expired', 'expired',
    pg_temp.t_check('2026-10-03 20:00:00+09', public.visit_slot_start('2026-10-03', 23::smallint), '2026-10-04 02:00:01+09'));

  begin  -- ここから rollback される範囲
    insert into public.stores (place_id, name, verify_code)
    select p, 'テスト店', '4321'
      from unnest(array['__h_win__', '__h_edge__', '__h_late__', '__h_early__', '__h_exp__',
                        '__h_order__', '__h_vis__', '__h_leg__', '__h_leg_tm__', '__h_leg_vis__']) p;

    p_win     := pg_temp.t_plan(my_uid, '__h_win__',     h - interval '1 hour', h - interval '3 hours', false);
    p_edge    := pg_temp.t_plan(my_uid, '__h_edge__',    h - interval '1 hour', h - interval '2 hours', false);
    p_late    := pg_temp.t_plan(my_uid, '__h_late__',    h - interval '1 hour', h - interval '1 hour 59 minutes', false);
    p_early   := pg_temp.t_plan(my_uid, '__h_early__',   h + interval '2 hours', h - interval '1 hour', false);
    p_exp     := pg_temp.t_plan(my_uid, '__h_exp__',     h - interval '4 hours', h - interval '6 hours', false);
    p_order   := pg_temp.t_plan(my_uid, '__h_order__',   h + interval '2 hours', h + interval '1 hour 30 minutes', false);
    p_vis     := pg_temp.t_plan(my_uid, '__h_vis__',     h + interval '2 hours', h - interval '1 hour', true);
    p_nostore := pg_temp.t_plan(my_uid, '__h_nostore__', h - interval '1 hour', h - interval '3 hours', false);
    p_leg     := pg_temp.t_plan_nohour(my_uid, '__h_leg__',     jst_today,     false);
    p_leg_tm  := pg_temp.t_plan_nohour(my_uid, '__h_leg_tm__',  jst_today + 1, false);
    p_leg_vis := pg_temp.t_plan_nohour(my_uid, '__h_leg_vis__', jst_today,     true);

    -- C. verify_visit: 時間帯ありの予定で、認証が通らないケース ---------------------
    res := pg_temp.t_add(res, '時間帯あり: 宣言が始まりの59分前(時間帯の中) → late_declaration', 'late_declaration',
      pg_temp.t_verify(my_uid, p_late, '4321'));
    res := pg_temp.t_add(res, '時間帯あり: 始まりが2時間後 → too_early', 'too_early',
      pg_temp.t_verify(my_uid, p_early, '4321'));
    res := pg_temp.t_add(res, '時間帯あり: 始まりが4時間前 → expired', 'expired',
      pg_temp.t_verify(my_uid, p_exp, '4321'));
    res := pg_temp.t_add(res, '時間帯あり: 宣言が遅く、しかも時間前 → late_declaration', 'late_declaration',
      pg_temp.t_verify(my_uid, p_order, '4321'));
    res := pg_temp.t_add(res, '時間帯あり: 認証済み(しかも時間前) → already', 'already',
      pg_temp.t_verify(my_uid, p_vis, '4321'));
    res := pg_temp.t_add(res, '時間帯あり: 店が stores に無い → no_store', 'no_store',
      pg_temp.t_verify(my_uid, p_nostore, '4321'));
    res := pg_temp.t_add(res, '時間帯あり: 誤ったコード → wrong_code', 'wrong_code',
      pg_temp.t_verify(my_uid, p_win, '0000'));
    res := pg_temp.t_add(res, '時間帯あり: 未ログイン(anon)は実行できない', 'denied',
      pg_temp.t_call('anon', null, format('select public.verify_visit(%s, %L)', p_win, '4321')));
    res := pg_temp.t_add(res, 'ここまでで visited_at が入った予定は増えていない', 'false',
      (select bool_or(visited_at is not null)::text from public.visit_plans
        where id in (p_win, p_late, p_early, p_exp, p_order, p_nostore)));

    -- D. verify_visit: 時間帯ありの予定で、認証が通るケース -------------------------
    res := pg_temp.t_add(res, '時間帯あり: 時間帯の中・2時間前に宣言・正しいコード → ok', 'ok',
      pg_temp.t_verify(my_uid, p_win, '4321'));
    res := pg_temp.t_add(res, 'ok のあと visited_at が記録されている', 'true',
      (select (visited_at is not null)::text from public.visit_plans where id = p_win));
    res := pg_temp.t_add(res, '同じ予定で2回目 → already', 'already',
      pg_temp.t_verify(my_uid, p_win, '4321'));
    res := pg_temp.t_add(res, '時間帯あり: 宣言がちょうど1時間前 → ok', 'ok',
      pg_temp.t_verify(my_uid, p_edge, '4321'));

    -- E. verify_visit: 時間未定(既存)の予定は今までどおり ---------------------------
    res := pg_temp.t_add(res, '時間未定: 明日の予定 → not_today', 'not_today',
      pg_temp.t_verify(my_uid, p_leg_tm, '4321'));
    res := pg_temp.t_add(res, '時間未定: 今日・認証済み → already', 'already',
      pg_temp.t_verify(my_uid, p_leg_vis, '4321'));
    res := pg_temp.t_add(res, '時間未定: 今日・正しいコード → ok', 'ok',
      pg_temp.t_verify(my_uid, p_leg, '4321'));

    -- F. 利用者(authenticated)からの直接の書き込み --------------------------------
    res := pg_temp.t_add(res, '直接 insert: visit_hour を指定して宣言できる', '12',
      pg_temp.t_call('authenticated', my_uid, format(
        'insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visit_hour) '
        'values (%L, %L, %L, %L, 12) returning visit_hour', my_uid, '__h_ins__', 'テスト', jst_today + 1)));
    res := pg_temp.t_add(res, '直接 insert: visit_hour = 24 は制約で拒否', 'denied(23514)',
      pg_temp.t_call('authenticated', my_uid, format(
        'insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visit_hour) '
        'values (%L, %L, %L, %L, 24) returning visit_hour', my_uid, '__h_ins24__', 'テスト', jst_today + 1)));
    res := pg_temp.t_add(res, '直接 insert: created_at は今までどおり指定できない', 'denied(42501)',
      pg_temp.t_call('authenticated', my_uid, format(
        'insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visit_hour, created_at) '
        'values (%L, %L, %L, %L, 12, now() - interval ''1 day'') returning id', my_uid, '__h_insc__', 'テスト', jst_today + 1)));
    res := pg_temp.t_add(res, '直接 update: visit_hour は書き換えられない', 'denied(42501)',
      pg_temp.t_call('authenticated', my_uid, format(
        'update public.visit_plans set visit_hour = 20 where id = %s returning id', p_early)));

    raise exception 'test rollback' using errcode = 'RB000';  -- 必ず rollback
  exception when others then
    if sqlstate <> 'RB000' then
      res := pg_temp.t_add(res, 'テスト実行中に想定外のエラー', '(なし)', sqlerrm);
    end if;
  end;

  -- G. 設定の確認 ---------------------------------------------------------------
  res := pg_temp.t_add(res, '設定: verify_visit は SECURITY DEFINER', 'true',
    (select prosecdef::text from pg_proc where oid = 'public.verify_visit(bigint,text)'::regprocedure));
  res := pg_temp.t_add(res, '設定: verify_visit の search_path が空', 'true',
    (select exists (select 1 from unnest(proconfig) c where replace(c, '"', '') = 'search_path=')::text
       from pg_proc where oid = 'public.verify_visit(bigint,text)'::regprocedure));
  res := pg_temp.t_add(res, '設定: verify_visit は visit_time_check を使っている', 'true',
    (select (prosrc like '%public.visit_time_check(%')::text
       from pg_proc where oid = 'public.verify_visit(bigint,text)'::regprocedure));
  res := pg_temp.t_add(res, '設定: verify_visit は authenticated が実行できる', 'true',
    has_function_privilege('authenticated', 'public.verify_visit(bigint,text)', 'execute')::text);
  res := pg_temp.t_add(res, '設定: verify_visit は anon が実行できない', 'false',
    has_function_privilege('anon', 'public.verify_visit(bigint,text)', 'execute')::text);
  res := pg_temp.t_add(res, '設定: visit_slot_start / visit_time_check は anon が実行できない', 'false/false',
    has_function_privilege('anon', 'public.visit_slot_start(date,smallint)', 'execute')::text || '/' ||
    has_function_privilege('anon', 'public.visit_time_check(timestamptz,timestamptz,timestamptz)', 'execute')::text);
  res := pg_temp.t_add(res, '設定: authenticated は visit_hour を insert できる / update できない', 'true/false',
    has_column_privilege('authenticated', 'public.visit_plans', 'visit_hour', 'insert')::text || '/' ||
    has_column_privilege('authenticated', 'public.visit_plans', 'visit_hour', 'update')::text);

  -- H. テストデータが残っていない(rollback の確認)
  res := pg_temp.t_add(res, '後始末: テスト用 stores / visit_plans の残り(件数)', '0',
    ((select count(*) from public.stores where place_id like '\_\_h\_%')
   + (select count(*) from public.visit_plans where place_id like '\_\_h\_%'))::text);

  select count(*) into ng from jsonb_array_elements(res) e where not (e->>'ok')::boolean;
  res := pg_temp.t_add(res, '総合(NGの件数)', '0', ng::text);

  return query
    select (e->>'n')::int, e->>'name', e->>'expected', e->>'actual',
           case when (e->>'ok')::boolean then '✅ OK' else '❌ NG' end
    from jsonb_array_elements(res) e
    order by 1;
end $$;

select * from pg_temp.t_run();
