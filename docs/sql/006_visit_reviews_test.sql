-- 006_visit_reviews_test: visit_reviews / submit_review() の動作テスト。SQL Editor に貼って1回実行するだけ。
--
-- 【使い方】
--   全文を貼って Run。最後の表に、チェックごとの ✅ OK / ❌ NG が出る。
--   最終行「総合(NGの件数)」が 0 ならすべて期待どおり。書き換える箇所はない。
--
-- 【データが残らない仕組み】 002〜004 のテストと同じ
--   テスト用の auth.users(2人) / visit_plans / visit_reviews は関数内の副トランザクションで作り、
--   最後に必ず例外を投げて全部 rollback する。関数は pg_temp(このセッション限り)に作る。
--   本物の visit_plans / visit_reviews は読みも書きもしない(テスト用 place_id は '__r1__')。
--   もし auth.users への insert が権限や trigger で失敗した場合は、最終表の
--   「テスト実行中に想定外のエラー」の行にその内容が出る。
--
-- 表の見方: 期待 = 関数の戻り値 (ok / already / ...) / denied (権限エラー) / true・false・件数・値

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

-- ログイン済みユーザー p_uid として submit_review を呼ぶ
create function pg_temp.t_submit(p_uid uuid, p_plan bigint, p_rating int, p_comment text)
returns text language sql as $$
  select pg_temp.t_call('authenticated', p_uid,
    format('select public.submit_review(%s, %s, %L)', p_plan, coalesce(p_rating::text, 'null'), p_comment))
$$;

-- テスト用の予定を1件作る(来店済みなら visited_at を入れる)
create function pg_temp.t_plan(p_uid uuid, p_day date, p_visited boolean)
returns bigint language sql as $$
  insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visited_at)
  values (p_uid, '__r1__', 'テスト店R', p_day, case when p_visited then now() end)
  returning id
$$;

create function pg_temp.t_run()
returns table (n int, check_name text, expected text, actual text, result text)
language plpgsql as $$
declare
  t          date := (now() at time zone 'Asia/Tokyo')::date;
  uids       uuid[];
  u1         uuid;
  u2         uuid;
  res        jsonb := '[]'::jsonb;
  p_main     bigint;  -- u1・今日・来店済み(基本のレビュー)
  p_past     bigint;  -- u1・昨日・来店済み(あとで書く)
  p_unvis    bigint;  -- u1・今日・未来店
  p_len200   bigint;  -- u1・来店済み(200文字ちょうど)
  p_blank    bigint;  -- u1・来店済み(空白だけのひとこと)
  p_null     bigint;  -- u1・来店済み(ひとことなし)
  p_trim     bigint;  -- u1・来店済み(前後に空白)
  p_other    bigint;  -- u2・来店済み
  ng         int;
begin
  begin  -- ここから rollback される範囲
    with x as (insert into auth.users (id) select gen_random_uuid() from generate_series(1, 2) returning id)
      select array_agg(id) into uids from x;
    u1 := uids[1];
    u2 := uids[2];

    p_main   := pg_temp.t_plan(u1, t,     true);
    p_past   := pg_temp.t_plan(u1, t - 1, true);
    p_unvis  := pg_temp.t_plan(u1, t + 1, false);
    p_len200 := pg_temp.t_plan(u1, t - 2, true);
    p_blank  := pg_temp.t_plan(u1, t - 3, true);
    p_null   := pg_temp.t_plan(u1, t - 4, true);
    p_trim   := pg_temp.t_plan(u1, t - 5, true);
    p_other  := pg_temp.t_plan(u2, t,     true);

    -- A. 書けないケース(どれもレビューは増えない) -----------------------------------
    res := pg_temp.t_add(res, 'ログインなし(auth.uid()が空) → not_authenticated', 'not_authenticated',
      pg_temp.t_submit(null, p_main, 5, 'x'));
    res := pg_temp.t_add(res, '未ログイン(anon)は関数を実行できない', 'denied',
      pg_temp.t_call('anon', null, format('select public.submit_review(%s, 5, null)', p_main)));
    res := pg_temp.t_add(res, '星0 → invalid_rating', 'invalid_rating', pg_temp.t_submit(u1, p_main, 0, null));
    res := pg_temp.t_add(res, '星6 → invalid_rating', 'invalid_rating', pg_temp.t_submit(u1, p_main, 6, null));
    res := pg_temp.t_add(res, '星なし(null) → invalid_rating', 'invalid_rating', pg_temp.t_submit(u1, p_main, null, 'x'));
    res := pg_temp.t_add(res, 'ひとこと201文字 → too_long', 'too_long',
      pg_temp.t_submit(u1, p_main, 5, repeat('あ', 201)));
    res := pg_temp.t_add(res, '未来店の予定 → not_visited', 'not_visited', pg_temp.t_submit(u1, p_unvis, 5, null));
    res := pg_temp.t_add(res, '別人の予定 → not_found', 'not_found', pg_temp.t_submit(u1, p_other, 5, null));
    res := pg_temp.t_add(res, '存在しない予定ID → not_found', 'not_found', pg_temp.t_submit(u1, -1, 5, null));
    res := pg_temp.t_add(res, 'ここまででレビューは0件', '0',
      (select count(*)::text from public.visit_reviews where user_id = any(uids)));

    -- B. 書けるケース ---------------------------------------------------------------
    res := pg_temp.t_add(res, '来店済み・星5・ひとことあり → ok', 'ok',
      pg_temp.t_submit(u1, p_main, 5, 'おいしかった！'));
    res := pg_temp.t_add(res, '保存内容: 星・ひとこと・書いた人', '5/おいしかった！/true',
      (select rating || '/' || comment || '/' || (user_id = u1) from public.visit_reviews where plan_id = p_main));
    res := pg_temp.t_add(res, '同じ予定で2回目 → already', 'already', pg_temp.t_submit(u1, p_main, 1, '上書き'));
    res := pg_temp.t_add(res, '2回目で上書きされていない(星5のまま・1件のまま)', '5/1',
      (select max(rating) || '/' || count(*) from public.visit_reviews where plan_id = p_main));
    res := pg_temp.t_add(res, '昨日の来店の予定にもあとで書ける → ok', 'ok', pg_temp.t_submit(u1, p_past, 3, null));
    res := pg_temp.t_add(res, 'ひとこと200文字ちょうど → ok', 'ok', pg_temp.t_submit(u1, p_len200, 4, repeat('あ', 200)));
    res := pg_temp.t_add(res, '200文字ちょうどがそのまま保存される', '200',
      (select char_length(comment)::text from public.visit_reviews where plan_id = p_len200));
    res := pg_temp.t_add(res, 'ひとことが空白・改行・全角スペースだけ → ok', 'ok',
      pg_temp.t_submit(u1, p_blank, 2, E'  　\n\t '));
    res := pg_temp.t_add(res, '空白だけのひとことは null(星だけ)で保存', '(null)',
      (select comment from public.visit_reviews where plan_id = p_blank));
    res := pg_temp.t_add(res, 'ひとことなし(null) → ok', 'ok', pg_temp.t_submit(u1, p_null, 1, null));
    res := pg_temp.t_add(res, 'ひとことの前後に空白・改行 → ok', 'ok',
      pg_temp.t_submit(u1, p_trim, 4, E'　 前後\n空白 \n'));
    res := pg_temp.t_add(res, '前後の空白は除いて保存(途中の改行は残す)', E'前後\n空白',
      (select comment from public.visit_reviews where plan_id = p_trim));
    res := pg_temp.t_add(res, '別の人(u2)が自分の予定に書ける → ok', 'ok', pg_temp.t_submit(u2, p_other, 5, 'また行きたい'));

    -- C. 直接の読み書き(RLS・権限) ------------------------------------------------------
    res := pg_temp.t_add(res, 'u1 は自分のレビューだけ見える(6件)', '6',
      pg_temp.t_call('authenticated', u1, 'select count(*)::text from public.visit_reviews'));
    res := pg_temp.t_add(res, 'u2 は自分のレビューだけ見える(1件)', '1',
      pg_temp.t_call('authenticated', u2, 'select count(*)::text from public.visit_reviews'));
    res := pg_temp.t_add(res, 'u1 から u2 のレビューは見えない', '0',
      pg_temp.t_call('authenticated', u1,
        format('select count(*)::text from public.visit_reviews where plan_id = %s', p_other)));
    res := pg_temp.t_add(res, 'u1 は自分の予定とレビューを結合して読める(6件)', '6',
      pg_temp.t_call('authenticated', u1,
        'select count(*)::text from public.visit_plans vp join public.visit_reviews r on r.plan_id = vp.id'));
    res := pg_temp.t_add(res, '直接 insert は不可(未来店の予定に書こうとする)', 'denied',
      pg_temp.t_call('authenticated', u1, format(
        'insert into public.visit_reviews (plan_id, user_id, rating) values (%s, %L, 5) returning id::text',
        p_unvis, u1)));
    res := pg_temp.t_add(res, '直接 update は不可(星を書き換えようとする)', 'denied',
      pg_temp.t_call('authenticated', u1, 'update public.visit_reviews set rating = 1 returning id::text'));
    res := pg_temp.t_add(res, '直接 delete は不可', 'denied',
      pg_temp.t_call('authenticated', u1, 'delete from public.visit_reviews returning id::text'));
    res := pg_temp.t_add(res, 'anon はレビューを読めない', 'denied',
      pg_temp.t_call('anon', null, 'select count(*)::text from public.visit_reviews'));
    res := pg_temp.t_add(res, '直接の書き換えを試したあとも星5のまま・件数も7件のまま', '5/7',
      (select rating from public.visit_reviews where plan_id = p_main) || '/' ||
      (select count(*) from public.visit_reviews where user_id = any(uids)));

    -- D. 設定の確認 -------------------------------------------------------------------
    res := pg_temp.t_add(res, '設定: SECURITY DEFINER である', 'true',
      (select prosecdef::text from pg_proc where oid = 'public.submit_review(bigint,integer,text)'::regprocedure));
    res := pg_temp.t_add(res, '設定: search_path が空に固定されている', 'true',
      (select exists (select 1 from unnest(proconfig) c where replace(c, '"', '') = 'search_path=')::text
         from pg_proc where oid = 'public.submit_review(bigint,integer,text)'::regprocedure));
    res := pg_temp.t_add(res, '設定: authenticated は実行できる', 'true',
      has_function_privilege('authenticated', 'public.submit_review(bigint,integer,text)', 'execute')::text);
    res := pg_temp.t_add(res, '設定: anon は実行できない', 'false',
      has_function_privilege('anon', 'public.submit_review(bigint,integer,text)', 'execute')::text);
    res := pg_temp.t_add(res, '設定: authenticated に insert/update/delete 権限が無い', 'false',
      (has_table_privilege('authenticated', 'public.visit_reviews', 'insert')
       or has_table_privilege('authenticated', 'public.visit_reviews', 'update')
       or has_table_privilege('authenticated', 'public.visit_reviews', 'delete'))::text);
    res := pg_temp.t_add(res, '設定: RLS が有効', 'true',
      (select relrowsecurity::text from pg_class where oid = 'public.visit_reviews'::regclass));

    -- E. 予定が消えるとレビューも消える(デモのリセット用) -----------------------------------
    delete from public.visit_plans where id = p_main;
    res := pg_temp.t_add(res, '予定を消すとそのレビューも消える(cascade)', '0',
      (select count(*)::text from public.visit_reviews where plan_id = p_main));

    raise exception 'test rollback' using errcode = 'RB000';  -- 必ず rollback
  exception when others then
    if sqlstate <> 'RB000' then
      res := pg_temp.t_add(res, 'テスト実行中に想定外のエラー', '(なし)', sqlerrm);
    end if;
  end;

  -- F. テストデータが残っていない(rollback の確認)
  res := pg_temp.t_add(res, '後始末: テスト用 visit_plans / visit_reviews / auth.users の残り(件数)', '0',
    ((select count(*) from public.visit_plans where place_id = '__r1__')
   + (select count(*) from public.visit_reviews where uids is not null and user_id = any(uids))
   + (select count(*) from auth.users where uids is not null and id = any(uids)))::text);

  select count(*) into ng from jsonb_array_elements(res) e where not (e->>'ok')::boolean;
  res := pg_temp.t_add(res, '総合(NGの件数)', '0', ng::text);

  return query
    select (e->>'n')::int, e->>'name', e->>'expected', e->>'actual',
           case when (e->>'ok')::boolean then '✅ OK' else '❌ NG' end
    from jsonb_array_elements(res) e
    order by 1;
end $$;

select * from pg_temp.t_run();
