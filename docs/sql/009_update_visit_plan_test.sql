-- 009_update_visit_plan_test: update_visit_plan() の動作テスト。SQL Editor に貼って1回実行するだけ。
--
-- 【使い方】
--   全文を貼って Run。最後の表に、チェックごとの ✅ OK / ❌ NG が出る。
--   最終行「総合(NGの件数)」が 0 ならすべて期待どおり。書き換える箇所はない。
--   テストに使うユーザーは auth.users の先頭の1人(データは残らないので誰でも良い)。
--
-- 【データが残らない仕組み】 003/008 のテストと同じ
--   テスト用の visit_plans は関数内の副トランザクションで作り、最後に必ず例外を投げて全部 rollback する。
--   関数は pg_temp(このセッション限り)に作る。本物のデータは読みも書きもしない(テスト用 place_id は '__u_...')。
--
-- 【時刻の作り方】 008 のテストと同じ。H = 今の「〇時ちょうど」を基準に相対で作るので、いつ実行しても結果は同じ。
--
-- 表の見方: 期待 = 関数の戻り値 (ok / past_slot / ...) / denied(SQLSTATE) (権限エラー) / true・false・値

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

-- timestamptz(〇時ちょうど) → 日本時間の日付 / 時
create function pg_temp.t_d(p_ts timestamptz) returns date language sql as
$$ select (p_ts at time zone 'Asia/Tokyo')::date $$;
create function pg_temp.t_h(p_ts timestamptz) returns int language sql as
$$ select extract(hour from p_ts at time zone 'Asia/Tokyo')::int $$;

-- 予定を作る(p_hour が null なら時間未定)
create function pg_temp.t_plan(p_uid uuid, p_place text, p_date date, p_hour int, p_created timestamptz, p_visited boolean)
returns bigint language sql as $$
  insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visit_hour, created_at, visited_at)
  values (p_uid, p_place, 'テスト', p_date, p_hour, p_created, case when p_visited then now() end)
  returning id
$$;

-- update_visit_plan を指定ユーザー(authenticated)として呼ぶ
create function pg_temp.t_upd(p_uid uuid, p_plan bigint, p_date date, p_hour int)
returns text language sql as $$
  select pg_temp.t_call('authenticated', p_uid,
    format('select public.update_visit_plan(%s, %L, %L)', p_plan, p_date, p_hour))
$$;

-- 予定の「日付 時」(時間未定なら「日付 未定」)
create function pg_temp.t_slot(p_plan bigint) returns text language sql as
$$ select visit_date::text || ' ' || coalesce(visit_hour::text, '未定') from public.visit_plans where id = p_plan $$;

create function pg_temp.t_run()
returns table (n int, check_name text, expected text, actual text, result text)
language plpgsql as $$
declare
  my_uid    uuid := pg_temp.t_my_uid();
  other_uid uuid := gen_random_uuid();             -- auth.users に存在しない「別人」
  t         date := (now() at time zone 'Asia/Tokyo')::date;
  h         timestamptz := date_trunc('hour', now());
  res       jsonb := '[]'::jsonb;
  p_a       bigint;  -- 3日後の12時台・5時間前に宣言(主に使う予定)
  p_same    bigint;  -- 3日後の12時台(同じ値への変更)
  p_leg     bigint;  -- 2日後・時間未定(既存の予定)
  p_vis     bigint;  -- 今日の12時台・認証済み
  p_dup1    bigint;  -- 店 __u_dup__ の3日後
  p_dup2    bigint;  -- 店 __u_dup__ の4日後
  p_late    bigint;  -- 変更先(H+1時間)の始まりの30分前に宣言・最初は5時間後の時間帯
  p_rule    bigint;  -- 5時間前に宣言・5時間後の時間帯
  c_a       timestamptz := h - interval '5 hours';
  -- 変更先の時間帯の始まり(H+1時間)の30分前 = H+30分。実行時刻の「分」に関係なく、1時間前ルールを満たさない
  -- (テスト用のデータなので、宣言時刻が今より後になる場合もあるが問題ない)
  c_late    timestamptz := (h + interval '1 hour') - interval '30 minutes';
  ng        int;
begin
  if my_uid is null then
    raise exception 'auth.users にユーザーがいません(先に一度ログインしてください)';
  end if;

  begin  -- ここから rollback される範囲
    p_a    := pg_temp.t_plan(my_uid, '__u_a__',    t + 3, 12,   c_a, false);
    p_same := pg_temp.t_plan(my_uid, '__u_same__', t + 3, 12,   c_a, false);
    p_leg  := pg_temp.t_plan(my_uid, '__u_leg__',  t + 2, null, c_a, false);
    p_vis  := pg_temp.t_plan(my_uid, '__u_vis__',  t,     12,   c_a, true);
    p_dup1 := pg_temp.t_plan(my_uid, '__u_dup__',  t + 3, 12,   c_a, false);
    p_dup2 := pg_temp.t_plan(my_uid, '__u_dup__',  t + 4, 12,   c_a, false);
    p_late := pg_temp.t_plan(my_uid, '__u_late__', pg_temp.t_d(h + interval '5 hours'), pg_temp.t_h(h + interval '5 hours'), c_late, false);
    p_rule := pg_temp.t_plan(my_uid, '__u_rule__', pg_temp.t_d(h + interval '5 hours'), pg_temp.t_h(h + interval '5 hours'), c_a, false);

    -- A. 変更できないケース(どれも予定は変わらない) -------------------------------
    res := pg_temp.t_add(res, 'ログインなし(auth.uid()が空) → not_authenticated', 'not_authenticated',
      pg_temp.t_call('authenticated', null, format('select public.update_visit_plan(%s, %L, %L)', p_a, t + 5, 18)));
    res := pg_temp.t_add(res, '未ログイン(anon)は関数を実行できない', 'denied',
      pg_temp.t_call('anon', null, format('select public.update_visit_plan(%s, %L, %L)', p_a, t + 5, 18)));
    res := pg_temp.t_add(res, '日付が null → invalid_date', 'invalid_date',
      pg_temp.t_upd(my_uid, p_a, null, 18));
    res := pg_temp.t_add(res, '時が null(時間未定には戻せない) → invalid_hour', 'invalid_hour',
      pg_temp.t_upd(my_uid, p_a, t + 5, null));
    res := pg_temp.t_add(res, '時が 24 → invalid_hour', 'invalid_hour',
      pg_temp.t_upd(my_uid, p_a, t + 5, 24));
    res := pg_temp.t_add(res, '時が -1 → invalid_hour', 'invalid_hour',
      pg_temp.t_upd(my_uid, p_a, t + 5, -1));
    res := pg_temp.t_add(res, '別人が自分の予定を指定 → not_found', 'not_found',
      pg_temp.t_upd(other_uid, p_a, t + 5, 18));
    res := pg_temp.t_add(res, '存在しない予定ID → not_found', 'not_found',
      pg_temp.t_upd(my_uid, -1, t + 5, 18));
    res := pg_temp.t_add(res, '来店認証済みの予定 → already_visited', 'already_visited',
      pg_temp.t_upd(my_uid, p_vis, t + 5, 18));
    res := pg_temp.t_add(res, 'すでに始まった時間帯(今の1時間前の時台) → past_slot', 'past_slot',
      pg_temp.t_upd(my_uid, p_a, pg_temp.t_d(h - interval '1 hour'), pg_temp.t_h(h - interval '1 hour')));
    res := pg_temp.t_add(res, '昨日の時間帯 → past_slot', 'past_slot',
      pg_temp.t_upd(my_uid, p_a, t - 1, 20));
    res := pg_temp.t_add(res, '同じ店・同じ日の予定がある日へ → duplicate', 'duplicate',
      pg_temp.t_upd(my_uid, p_dup2, t + 3, 18));
    res := pg_temp.t_add(res, 'ここまでで予定は変わっていない(p_a / p_dup2 / p_vis)',
      (t + 3)::text || ' 12 / ' || (t + 4)::text || ' 12 / ' || t::text || ' 12',
      pg_temp.t_slot(p_a) || ' / ' || pg_temp.t_slot(p_dup2) || ' / ' || pg_temp.t_slot(p_vis));
    res := pg_temp.t_add(res, '直接 update は今までどおり拒否', 'denied(42501)',
      pg_temp.t_call('authenticated', my_uid, format(
        'update public.visit_plans set visit_date = %L, visit_hour = 18 where id = %s returning id', t + 5, p_a)));

    -- B. 変更できるケース ---------------------------------------------------------
    res := pg_temp.t_add(res, '日付と時間帯を変更 → ok', 'ok',
      pg_temp.t_upd(my_uid, p_a, t + 5, 18));
    res := pg_temp.t_add(res, 'ok のあと日付と時間帯が変わっている', (t + 5)::text || ' 18',
      pg_temp.t_slot(p_a));
    res := pg_temp.t_add(res, 'ok のあとも created_at は最初の宣言のまま', 'true',
      (select (created_at = c_a)::text from public.visit_plans where id = p_a));
    res := pg_temp.t_add(res, 'ok のあとも visited_at は null のまま', 'true',
      (select (visited_at is null)::text from public.visit_plans where id = p_a));
    res := pg_temp.t_add(res, '同じ日付・時間帯への変更 → ok', 'ok',
      pg_temp.t_upd(my_uid, p_same, t + 3, 12));
    res := pg_temp.t_add(res, '同じ店の別の日へ(重ならない) → ok', 'ok',
      pg_temp.t_upd(my_uid, p_dup2, t + 6, 12));
    res := pg_temp.t_add(res, '時間未定の既存の予定に時間帯を付ける → ok', 'ok',
      pg_temp.t_upd(my_uid, p_leg, t + 2, 20));
    res := pg_temp.t_add(res, '時間未定だった予定が時間帯ありになっている', (t + 2)::text || ' 20',
      pg_temp.t_slot(p_leg));

    -- C. 1時間前ルールは最初の宣言(created_at)で判定される --------------------------
    res := pg_temp.t_add(res, '変更先の時間帯の始まりの30分前に宣言した予定を、その時台(H+1時間)へ変更 → ok(保存はできる)', 'ok',
      pg_temp.t_upd(my_uid, p_late, pg_temp.t_d(h + interval '1 hour'), pg_temp.t_h(h + interval '1 hour')));
    res := pg_temp.t_add(res, '↑ その予定の来店認証 → late_declaration', 'late_declaration',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_late, '0000')));
    res := pg_temp.t_add(res, '5時間前に宣言した予定を、2時間後の時台へ変更 → ok', 'ok',
      pg_temp.t_upd(my_uid, p_rule, pg_temp.t_d(h + interval '2 hours'), pg_temp.t_h(h + interval '2 hours')));
    res := pg_temp.t_add(res, '↑ その予定の来店認証 → too_early(宣言は間に合っている)', 'too_early',
      pg_temp.t_call('authenticated', my_uid, format('select public.verify_visit(%s, %L)', p_rule, '0000')));
    res := pg_temp.t_add(res, '変更しても created_at は変わらない(2件)', 'true',
      (select (bool_and(created_at = case id when p_late then c_late else c_a end))::text
         from public.visit_plans where id in (p_late, p_rule)));

    raise exception 'test rollback' using errcode = 'RB000';  -- 必ず rollback
  exception when others then
    if sqlstate <> 'RB000' then
      res := pg_temp.t_add(res, 'テスト実行中に想定外のエラー', '(なし)', sqlerrm);
    end if;
  end;

  -- D. 設定の確認 ---------------------------------------------------------------
  res := pg_temp.t_add(res, '設定: SECURITY DEFINER である', 'true',
    (select prosecdef::text from pg_proc where oid = 'public.update_visit_plan(bigint,date,smallint)'::regprocedure));
  res := pg_temp.t_add(res, '設定: search_path が空に固定されている', 'true',
    (select exists (select 1 from unnest(proconfig) c where replace(c, '"', '') = 'search_path=')::text
       from pg_proc where oid = 'public.update_visit_plan(bigint,date,smallint)'::regprocedure));
  res := pg_temp.t_add(res, '設定: authenticated は実行できる', 'true',
    has_function_privilege('authenticated', 'public.update_visit_plan(bigint,date,smallint)', 'execute')::text);
  res := pg_temp.t_add(res, '設定: anon は実行できない', 'false',
    has_function_privilege('anon', 'public.update_visit_plan(bigint,date,smallint)', 'execute')::text);
  res := pg_temp.t_add(res, '設定: authenticated は visit_plans を直接 update できない', 'false',
    has_table_privilege('authenticated', 'public.visit_plans', 'update')::text);

  -- E. テストデータが残っていない(rollback の確認)
  res := pg_temp.t_add(res, '後始末: テスト用 visit_plans の残り(件数)', '0',
    (select count(*) from public.visit_plans where place_id like '\_\_u\_%')::text);

  select count(*) into ng from jsonb_array_elements(res) e where not (e->>'ok')::boolean;
  res := pg_temp.t_add(res, '総合(NGの件数)', '0', ng::text);

  return query
    select (e->>'n')::int, e->>'name', e->>'expected', e->>'actual',
           case when (e->>'ok')::boolean then '✅ OK' else '❌ NG' end
    from jsonb_array_elements(res) e
    order by 1;
end $$;

select * from pg_temp.t_run();
