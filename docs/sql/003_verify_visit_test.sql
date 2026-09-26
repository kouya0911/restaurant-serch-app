-- 003_verify_visit_test: verify_visit() の動作テスト。SQL Editor に貼って1回実行するだけ。
--
-- 【使い方】
--   全文を貼って Run。最後の表に、チェックごとの ✅ OK / ❌ NG が出る。
--   最終行「総合(NGの件数)」が 0 ならすべて期待どおり。
--   テストに使うユーザーは auth.users の先頭の1人(データは残らないので誰でも良い)。
--   特定のユーザーにしたい場合だけ、下の t_my_uid() の中身を書き換える。
--
-- 【データが残らない仕組み】 002_stores_test.sql と同じ
--   テスト用の stores / visit_plans は関数内の副トランザクションで作り、最後に必ず
--   例外を投げて全部 rollback する。関数は pg_temp(このセッション限り)に作る。
--   ※ 本物のデータ(あなたの stores / visit_plans)は読みも書きもしない
--     (テスト用の place_id は '__t1__' などの専用の値)。
--
-- 表の見方: 期待 = 関数の戻り値 (ok / wrong_code / ...) / denied (権限エラー) / true・false・件数

create function pg_temp.t_my_uid() returns uuid language sql as
$$ select id from auth.users order by created_at limit 1 $$;   -- 固定したい場合: select '<uuid>'::uuid

create function pg_temp.t_add(res jsonb, p_name text, p_expected text, p_actual text)
returns jsonb language sql as $$
  select res || jsonb_build_array(jsonb_build_object(
    'n', jsonb_array_length(res) + 1,
    'name', p_name, 'expected', p_expected, 'actual', p_actual,
    'ok', (p_actual = p_expected) or (p_expected = 'denied' and p_actual like 'denied%')
  ))
$$;

-- 指定ロール・指定ユーザーとして SELECT を1本実行し、1行1列目のテキストを返す
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
  my_uid     uuid := pg_temp.t_my_uid();
  other_uid  uuid := gen_random_uuid();          -- auth.users に存在しない「別人」
  jst_today  date := (now() at time zone 'Asia/Tokyo')::date;
  res        jsonb := '[]'::jsonb;
  p_today    bigint;   -- 今日・店あり(コード 4321)
  p_visited  bigint;   -- 今日・店あり・認証済み
  p_nostore  bigint;   -- 今日・店なし
  p_tomorrow bigint;   -- 明日・店あり
  p_yesterday bigint;  -- 昨日・店あり
  ng         int;
begin
  if my_uid is null then
    raise exception 'auth.users にユーザーがいません(先に一度ログインしてください)';
  end if;

  begin  -- ここから rollback される範囲
    insert into public.stores (place_id, name, verify_code)
      values ('__t1__', 'テスト店1', '4321'), ('__t2__', 'テスト店2', '4321');

    insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date)
      values (my_uid, '__t1__', 'テスト店1', jst_today) returning id into p_today;
    insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visited_at)
      values (my_uid, '__t2__', 'テスト店2', jst_today, now()) returning id into p_visited;
    insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date)
      values (my_uid, '__t3_nostore__', '店なし', jst_today) returning id into p_nostore;
    insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date)
      values (my_uid, '__t1__', 'テスト店1', jst_today + 1) returning id into p_tomorrow;
    insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date)
      values (my_uid, '__t1__', 'テスト店1', jst_today - 1) returning id into p_yesterday;

    -- A. 認証が通らないケース(どれも visited_at は変わらない) -------------------
    res := pg_temp.t_add(res, '誤ったコード → wrong_code', 'wrong_code',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_today, '0000')));
    res := pg_temp.t_add(res, '空のコード → wrong_code', 'wrong_code',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_today, '')));
    res := pg_temp.t_add(res, 'NULLのコード → wrong_code', 'wrong_code',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, null)', p_today)));
    res := pg_temp.t_add(res, '別人が自分の予定を指定 → not_found', 'not_found',
      pg_temp.t_call('authenticated', other_uid, format('select public.verify_visit(%s, %L)', p_today, '4321')));
    res := pg_temp.t_add(res, '存在しない予定ID → not_found', 'not_found',
      pg_temp.t_call('authenticated', my_uid, 'select public.verify_visit(-1, ''4321'')'));
    res := pg_temp.t_add(res, '明日の予定(正しいコード) → not_today', 'not_today',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_tomorrow, '4321')));
    res := pg_temp.t_add(res, '昨日の予定(正しいコード) → not_today', 'not_today',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_yesterday, '4321')));
    res := pg_temp.t_add(res, '店が stores に無い → no_store', 'no_store',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_nostore, '4321')));
    res := pg_temp.t_add(res, '認証済みの予定(正しいコード) → already', 'already',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_visited, '4321')));
    res := pg_temp.t_add(res, 'ログインなし(auth.uid()が空) → not_authenticated', 'not_authenticated',
      pg_temp.t_call('authenticated', null, format('select public.verify_visit(%s, %L)', p_today, '4321')));
    res := pg_temp.t_add(res, '未ログイン(anon)は関数を実行できない', 'denied',
      pg_temp.t_call('anon', null, format('select public.verify_visit(%s, %L)', p_today, '4321')));

    res := pg_temp.t_add(res, 'ここまでで visited_at が入った予定は増えていない(今日/明日/昨日/店なし)', 'false',
      (select bool_or(visited_at is not null)::text from public.visit_plans
        where id in (p_today, p_tomorrow, p_yesterday, p_nostore)));

    -- B. 認証が通るケース ---------------------------------------------------------
    res := pg_temp.t_add(res, '正しいコード → ok', 'ok',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_today, '4321')));
    res := pg_temp.t_add(res, 'ok のあと visited_at が記録されている', 'true',
      (select (visited_at is not null)::text from public.visit_plans where id = p_today));
    res := pg_temp.t_add(res, '同じ予定で2回目(正しいコード) → already', 'already',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_today, '4321')));

    -- C. 設定の確認 ---------------------------------------------------------------
    res := pg_temp.t_add(res, '設定: SECURITY DEFINER である', 'true',
      (select prosecdef::text from pg_proc where oid = 'public.verify_visit(bigint,text)'::regprocedure));
    res := pg_temp.t_add(res, '設定: search_path が空に固定されている', 'true',
      (select exists (select 1 from unnest(proconfig) c where replace(c, '"', '') = 'search_path=')::text
         from pg_proc where oid = 'public.verify_visit(bigint,text)'::regprocedure));
    res := pg_temp.t_add(res, '設定: authenticated は実行できる', 'true',
      has_function_privilege('authenticated', 'public.verify_visit(bigint,text)', 'execute')::text);
    res := pg_temp.t_add(res, '設定: anon は実行できない', 'false',
      has_function_privilege('anon', 'public.verify_visit(bigint,text)', 'execute')::text);

    raise exception 'test rollback' using errcode = 'RB000';  -- 必ず rollback
  exception when others then
    if sqlstate <> 'RB000' then
      res := pg_temp.t_add(res, 'テスト実行中に想定外のエラー', '(なし)', sqlerrm);
    end if;
  end;

  -- D. テストデータが残っていない(rollback の確認)
  res := pg_temp.t_add(res, '後始末: テスト用 stores / visit_plans の残り(件数)', '0',
    ((select count(*) from public.stores where place_id like '\_\_t%')
   + (select count(*) from public.visit_plans where place_id like '\_\_t%'))::text);

  select count(*) into ng from jsonb_array_elements(res) e where not (e->>'ok')::boolean;
  res := pg_temp.t_add(res, '総合(NGの件数)', '0', ng::text);

  return query
    select (e->>'n')::int, e->>'name', e->>'expected', e->>'actual',
           case when (e->>'ok')::boolean then '✅ OK' else '❌ NG' end
    from jsonb_array_elements(res) e
    order by 1;
end $$;

select * from pg_temp.t_run();
