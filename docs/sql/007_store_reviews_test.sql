-- 007_store_reviews_test: store_reviews() の動作テスト。SQL Editor に貼って1回実行するだけ。
--
-- 【使い方】
--   全文を貼って Run。最後の表に、チェックごとの ✅ OK / ❌ NG が出る。
--   最終行「総合(NGの件数)」が 0 ならすべて期待どおり。書き換える箇所はない。
--
-- 【データが残らない仕組み】 002〜006 のテストと同じ
--   テスト用の auth.users(3人) / stores / visit_plans / visit_reviews は関数内の副トランザクションで作り、
--   最後に必ず例外を投げて全部 rollback する。関数は pg_temp(このセッション限り)に作る。
--   本物の stores / visit_plans / visit_reviews は読みも書きもしない(テスト用 place_id は '__v1__' など)。
--   レビューは submit_review を通さず直接作る(006 のテストで確認済み。ここでは作成日時を指定したいため)。
--
-- 【テストの店】
--   V1: レビュー3件。3時間前 ★5「とてもおいしい」/ 2時間前 ★4(ひとことなし)/ 1時間前 ★4「また行きたい」
--       → 件数3・平均4.3・新しい順に「また行きたい」→(なし)→「とてもおいしい」
--   V2: レビュー12件(★2,3,4,5,1,2,3,4,5,1,2,3。ひとこと r1〜r12。r12 が一番新しい)
--       → 件数12・平均2.9・最近は10件だけ(r12〜r3)
--   V0: レビュー0件(予定はあるが未来店)

create function pg_temp.t_add(res jsonb, p_name text, p_expected text, p_actual text)
returns jsonb language sql as $$
  select res || jsonb_build_array(jsonb_build_object(
    'n', jsonb_array_length(res) + 1,
    'name', p_name, 'expected', p_expected, 'actual', coalesce(p_actual, '(null)'),
    'ok', (coalesce(p_actual, '(null)') = p_expected)
          or (p_expected = 'denied' and p_actual like 'denied%')
  ))
$$;

-- 指定ロールとして SELECT を1本実行し、1行1列目のテキストを返す(SQL の NULL は NULL のまま)
create function pg_temp.t_call(p_role text, p_sql text)
returns text language plpgsql as $$
declare
  out text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into out;
  exception when others then
    out := 'denied(' || sqlstate || ')';
  end;
  reset role;
  return out;
end $$;

-- 来店済みの予定とそのレビューを1件作る(作成日時は now() - p_ago)
create function pg_temp.t_review(p_uid uuid, p_place text, p_day date, p_rating int, p_comment text, p_ago interval)
returns void language plpgsql as $$
declare
  v_plan bigint;
begin
  insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visited_at)
  values (p_uid, p_place, 'テスト', p_day, now() - p_ago)
  returning id into v_plan;
  insert into public.visit_reviews (plan_id, user_id, rating, comment, created_at)
  values (v_plan, p_uid, p_rating, p_comment, now() - p_ago);
end $$;

-- jsonb オブジェクトのキーをカンマ区切りで(ソート済み)
create function pg_temp.t_keys(o jsonb)
returns text language sql as $$
  select string_agg(k, ',' order by k) from jsonb_object_keys(o) k
$$;

create function pg_temp.t_run()
returns table (n int, check_name text, expected text, actual text, result text)
language plpgsql as $$
declare
  t      date := (now() at time zone 'Asia/Tokyo')::date;
  tok1   text := 'test_token_v1_aaaaaaaaaaaaaaaaaaaaaaaa';
  tok2   text := 'test_token_v2_bbbbbbbbbbbbbbbbbbbbbbbb';
  tok0   text := 'test_token_v0_cccccccccccccccccccccccc';
  uids   uuid[];
  res    jsonb := '[]'::jsonb;
  s1     text;
  s2     text;
  r1     jsonb;
  r2     jsonb;
  r0     jsonb;
  ng     int;
begin
  begin  -- ここから rollback される範囲
    with x as (insert into auth.users (id) select gen_random_uuid() from generate_series(1, 3) returning id)
      select array_agg(id) into uids from x;

    insert into public.stores (place_id, name, owner_token) values
      ('__v1__', 'テストV1', tok1),
      ('__v2__', 'テストV2', tok2),
      ('__v0__', 'テストV0', tok0);

    -- V1
    perform pg_temp.t_review(uids[1], '__v1__', t, 5, 'とてもおいしい', interval '3 hours');
    perform pg_temp.t_review(uids[2], '__v1__', t, 4, null,            interval '2 hours');
    perform pg_temp.t_review(uids[3], '__v1__', t, 4, 'また行きたい',   interval '1 hour');
    -- V2: 12件。i が大きいほど新しい
    perform pg_temp.t_review(uids[((i - 1) % 3) + 1], '__v2__', t - ((i - 1) / 3),
                             (i % 5) + 1, 'r' || i, make_interval(mins => 13 - i))
      from generate_series(1, 12) as i;
    -- V0: 予定はあるがレビューなし
    insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date)
      values (uids[1], '__v0__', 'テスト', t);

    s1 := pg_temp.t_call('anon', format('select public.store_reviews(%L)::text', tok1));
    s2 := pg_temp.t_call('anon', format('select public.store_reviews(%L)::text', tok2));
    res := pg_temp.t_add(res, '未ログイン(anon)が呼べる', 'true', (left(s1, 6) <> 'denied')::text);
    r1 := s1::jsonb;
    r2 := s2::jsonb;
    r0 := pg_temp.t_call('anon', format('select public.store_reviews(%L)::text', tok0))::jsonb;

    -- A. V1(3件) ------------------------------------------------------------------
    res := pg_temp.t_add(res, 'V1: 件数3', '3', r1->>'count');
    res := pg_temp.t_add(res, 'V1: 平均4.3(13/3 を小数第1位で四捨五入)', '4.3', r1->>'average');
    res := pg_temp.t_add(res, 'V1: 最近のレビューは3件', '3', jsonb_array_length(r1->'recent')::text);
    res := pg_temp.t_add(res, 'V1: 新しい順(星)', '4,4,5',
      (select string_agg(e->>'rating', ',' order by i) from jsonb_array_elements(r1->'recent') with ordinality as a(e, i)));
    res := pg_temp.t_add(res, 'V1: 新しい順(ひとこと。星だけは (なし))', 'また行きたい,(なし),とてもおいしい',
      (select string_agg(coalesce(e->>'comment', '(なし)'), ',' order by i)
         from jsonb_array_elements(r1->'recent') with ordinality as a(e, i)));
    res := pg_temp.t_add(res, 'V1: 星だけのレビューの comment は JSON の null', 'null',
      jsonb_typeof(r1->'recent'->1->'comment'));

    -- B. V2(12件): 最大10件 ------------------------------------------------------------
    res := pg_temp.t_add(res, 'V2: 件数12(一覧は10件でも件数は全件)', '12', r2->>'count');
    res := pg_temp.t_add(res, 'V2: 平均2.9(35/12)', '2.9', r2->>'average');
    res := pg_temp.t_add(res, 'V2: 最近のレビューは最大10件', '10', jsonb_array_length(r2->'recent')::text);
    res := pg_temp.t_add(res, 'V2: 先頭は一番新しい r12', 'r12', r2->'recent'->0->>'comment');
    res := pg_temp.t_add(res, 'V2: 末尾は r3(古い r1・r2 は入らない)', 'r3', r2->'recent'->9->>'comment');
    res := pg_temp.t_add(res, 'V2: V1 のレビューが混ざらない', 'false',
      (s2 like '%また行きたい%' or s2 like '%とてもおいしい%')::text);

    -- C. V0(0件) --------------------------------------------------------------------
    res := pg_temp.t_add(res, 'V0: 件数0', '0', r0->>'count');
    res := pg_temp.t_add(res, 'V0: 平均は null', 'null', jsonb_typeof(r0->'average'));
    res := pg_temp.t_add(res, 'V0: 最近のレビューは空配列', '[]', (r0->'recent')::text);

    -- D. 届いたらすぐ反映される(遅延なし) -----------------------------------------------
    perform pg_temp.t_review(uids[1], '__v1__', t - 1, 1, 'たった今', interval '0');
    res := pg_temp.t_add(res, '追加直後: V1 の件数が4になる', '4',
      pg_temp.t_call('anon', format('select public.store_reviews(%L)->>''count''', tok1)));
    res := pg_temp.t_add(res, '追加直後: 先頭が今のレビュー', 'たった今',
      pg_temp.t_call('anon', format('select public.store_reviews(%L)->''recent''->0->>''comment''', tok1)));

    -- E. トークン ---------------------------------------------------------------------
    res := pg_temp.t_add(res, '誤ったトークン → null', '(null)',
      pg_temp.t_call('anon', $q$ select public.store_reviews('wrong_token_0000000000000000000000')::text $q$));
    res := pg_temp.t_add(res, 'NULLのトークン → null', '(null)',
      pg_temp.t_call('anon', 'select public.store_reviews(null)::text'));
    res := pg_temp.t_add(res, '空のトークン → null', '(null)',
      pg_temp.t_call('anon', $q$ select public.store_reviews('')::text $q$));
    res := pg_temp.t_add(res, 'V1のトークンの前半だけ → null', '(null)',
      pg_temp.t_call('anon', format('select public.store_reviews(%L)::text', left(tok1, 20))));
    res := pg_temp.t_add(res, 'place_id をトークン代わりに使っても → null', '(null)',
      pg_temp.t_call('anon', $q$ select public.store_reviews('__v1__')::text $q$));

    -- F. 書いた人・予定を特定できる情報が含まれない ------------------------------------------
    res := pg_temp.t_add(res, '個人情報: テストユーザー3人のIDが結果(V1/V2)に一切現れない', 'false',
      (select coalesce(bool_or(s1 like '%' || u::text || '%' or s2 like '%' || u::text || '%'), false)::text
         from unnest(uids) u));
    res := pg_temp.t_add(res, '個人情報: user_id / plan_id / id / created_at / visited_at の語が現れない', 'false',
      (s1 ~ '"(user_id|plan_id|id|created_at|visited_at|restaurant_name|place_id)"'
       or s2 ~ '"(user_id|plan_id|id|created_at|visited_at|restaurant_name|place_id)"')::text);
    res := pg_temp.t_add(res, '個人情報: 最上位のキーは average,count,recent だけ', 'average,count,recent',
      pg_temp.t_keys(r1));
    res := pg_temp.t_add(res, '個人情報: レビュー1件のキーは comment,rating だけ(V1)', 'comment,rating',
      (select string_agg(distinct pg_temp.t_keys(e), '|') from jsonb_array_elements(r1->'recent') e));
    res := pg_temp.t_add(res, '個人情報: レビュー1件のキーは comment,rating だけ(V2)', 'comment,rating',
      (select string_agg(distinct pg_temp.t_keys(e), '|') from jsonb_array_elements(r2->'recent') e));

    -- G. 権限・設定 --------------------------------------------------------------------
    res := pg_temp.t_add(res, '権限: anon は visit_reviews を直接読めない', 'denied',
      pg_temp.t_call('anon', 'select count(*)::text from public.visit_reviews'));
    res := pg_temp.t_add(res, '設定: SECURITY DEFINER である', 'true',
      (select prosecdef::text from pg_proc where oid = 'public.store_reviews(text)'::regprocedure));
    res := pg_temp.t_add(res, '設定: search_path が空に固定されている', 'true',
      (select exists (select 1 from unnest(proconfig) c where replace(c, '"', '') = 'search_path=')::text
         from pg_proc where oid = 'public.store_reviews(text)'::regprocedure));
    res := pg_temp.t_add(res, '設定: anon は実行できる', 'true',
      has_function_privilege('anon', 'public.store_reviews(text)', 'execute')::text);
    res := pg_temp.t_add(res, '設定: authenticated も実行できる', 'true',
      has_function_privilege('authenticated', 'public.store_reviews(text)', 'execute')::text);
    res := pg_temp.t_add(res, '設定: stores の列は 002 のまま(7列)',
      'created_at,id,min_display_count,name,owner_token,place_id,verify_code',
      (select string_agg(column_name, ',' order by column_name) from information_schema.columns
        where table_schema = 'public' and table_name = 'stores'));

    raise exception 'test rollback' using errcode = 'RB000';  -- 必ず rollback
  exception when others then
    if sqlstate <> 'RB000' then
      res := pg_temp.t_add(res, 'テスト実行中に想定外のエラー', '(なし)', sqlerrm);
    end if;
  end;

  -- H. テストデータが残っていない(rollback の確認)
  res := pg_temp.t_add(res, '後始末: テスト用 stores / visit_plans / visit_reviews / auth.users の残り(件数)', '0',
    ((select count(*) from public.stores where place_id like '\_\_v%')
   + (select count(*) from public.visit_plans where place_id like '\_\_v%')
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
