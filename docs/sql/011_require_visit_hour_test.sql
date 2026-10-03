-- 011_require_visit_hour_test: 新しい宣言で「時間未定」が禁止されたことの動作テスト。SQL Editor に貼って1回実行するだけ。
-- ★ 011_require_visit_hour.sql と同じく、本番へのアプリの反映を確認し、011 を実行したあとで実行する。
--
-- 【使い方】
--   全文を貼って Run。最後の表に、チェックごとの ✅ OK / ❌ NG が出る。
--   最終行「総合(NGの件数)」が 0 ならすべて期待どおり。書き換える箇所はない。
--   テストに使うユーザーは auth.users の先頭の1人(データは残らないので誰でも良い)。
--
-- 【データが残らない仕組み】 003/008 のテストと同じ
--   テスト用の stores / visit_plans は関数内の副トランザクションで作り、最後に必ず例外を投げて全部 rollback する。
--   関数は pg_temp(このセッション限り)に作る。本物のデータは読みも書きもしない(テスト用 place_id は '__r_...')。
--
-- 表の見方: 期待 = 結果の値 / denied(SQLSTATE) (権限・ポリシーのエラー) / true・false・件数

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

create function pg_temp.t_run()
returns table (n int, check_name text, expected text, actual text, result text)
language plpgsql as $$
declare
  my_uid    uuid := pg_temp.t_my_uid();
  other_uid uuid := gen_random_uuid();
  t         date := (now() at time zone 'Asia/Tokyo')::date;
  res       jsonb := '[]'::jsonb;
  p_legacy  bigint;  -- 今日・時間未定(011 より前に登録された予定)
  p_legacy2 bigint;  -- 3日後・時間未定(変更の確認用)
  ng        int;
begin
  if my_uid is null then
    raise exception 'auth.users にユーザーがいません(先に一度ログインしてください)';
  end if;

  begin  -- ここから rollback される範囲
    insert into public.stores (place_id, name, verify_code) values ('__r_leg__', 'テスト店', '4321');
    -- 既存の時間未定の予定(SQL Editor = postgres からは今でも入れられる)
    insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date)
      values (my_uid, '__r_leg__', 'テスト', t) returning id into p_legacy;
    insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date)
      values (my_uid, '__r_leg2__', 'テスト', t + 3) returning id into p_legacy2;

    -- A. 利用者(authenticated)からの insert ------------------------------------
    res := pg_temp.t_add(res, '時間帯なし(visit_hour = null)の宣言は拒否', 'denied(42501)',
      pg_temp.t_call('authenticated', my_uid, format(
        'insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visit_hour) '
        'values (%L, %L, %L, %L, null) returning id', my_uid, '__r_null__', 'テスト', t + 1)));
    res := pg_temp.t_add(res, 'visit_hour の列を省いた宣言(古いアプリと同じ形)も拒否', 'denied(42501)',
      pg_temp.t_call('authenticated', my_uid, format(
        'insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date) '
        'values (%L, %L, %L, %L) returning id', my_uid, '__r_omit__', 'テスト', t + 1)));
    res := pg_temp.t_add(res, '時間帯ありの宣言は今までどおり通る', '18',
      pg_temp.t_call('authenticated', my_uid, format(
        'insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visit_hour) '
        'values (%L, %L, %L, %L, 18) returning visit_hour', my_uid, '__r_ok__', 'テスト', t + 1)));
    res := pg_temp.t_add(res, '他人の user_id での宣言は今までどおり拒否', 'denied(42501)',
      pg_temp.t_call('authenticated', other_uid, format(
        'insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visit_hour) '
        'values (%L, %L, %L, %L, 18) returning id', my_uid, '__r_other__', 'テスト', t + 1)));

    -- B. 既存の時間未定の予定は壊れない ------------------------------------------
    res := pg_temp.t_add(res, '時間未定の今日の予定は、今までどおり来店認証できる → ok', 'ok',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_legacy, '4321')));
    res := pg_temp.t_add(res, '↑ visited_at が記録されている(時間未定の行の update が通る)', 'true',
      (select (visited_at is not null)::text from public.visit_plans where id = p_legacy));
    res := pg_temp.t_add(res, '時間未定の予定に時間帯を付ける変更 → ok', 'ok',
      pg_temp.t_call('authenticated', my_uid, format('select public.update_visit_plan(%s, %L, %L)', p_legacy2, t + 3, 19)));
    res := pg_temp.t_add(res, '時間未定の予定は本人が今までどおり取り消せる', 'true',
      (pg_temp.t_call('authenticated', my_uid, format(
        'delete from public.visit_plans where id = %s returning id', p_legacy2)) is not null)::text);

    raise exception 'test rollback' using errcode = 'RB000';  -- 必ず rollback
  exception when others then
    if sqlstate <> 'RB000' then
      res := pg_temp.t_add(res, 'テスト実行中に想定外のエラー', '(なし)', sqlerrm);
    end if;
  end;

  -- C. 設定の確認 ---------------------------------------------------------------
  res := pg_temp.t_add(res, '設定: insert のポリシーが visit_hour を必須にしている', 'true',
    (select (with_check like '%visit_hour IS NOT NULL%')::text from pg_policies
      where schemaname = 'public' and tablename = 'visit_plans' and policyname = 'visit_plans_insert_own'));
  res := pg_temp.t_add(res, '設定: insert のポリシーは1つだけ(古いポリシーが残っていない)', '1',
    (select count(*)::text from pg_policies
      where schemaname = 'public' and tablename = 'visit_plans' and cmd = 'INSERT'));

  -- D. テストデータが残っていない(rollback の確認)
  res := pg_temp.t_add(res, '後始末: テスト用 stores / visit_plans の残り(件数)', '0',
    ((select count(*) from public.stores where place_id like '\_\_r\_%')
   + (select count(*) from public.visit_plans where place_id like '\_\_r\_%'))::text);

  select count(*) into ng from jsonb_array_elements(res) e where not (e->>'ok')::boolean;
  res := pg_temp.t_add(res, '総合(NGの件数)', '0', ng::text);

  return query
    select (e->>'n')::int, e->>'name', e->>'expected', e->>'actual',
           case when (e->>'ok')::boolean then '✅ OK' else '❌ NG' end
    from jsonb_array_elements(res) e
    order by 1;
end $$;

select * from pg_temp.t_run();
