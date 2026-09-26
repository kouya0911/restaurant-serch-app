-- 004_store_stats_test: store_stats() の動作テスト。SQL Editor に貼って1回実行するだけ。
--
-- 【使い方】
--   全文を貼って Run。最後の表に、チェックごとの ✅ OK / ❌ NG が出る。
--   最終行「総合(NGの件数)」が 0 ならすべて期待どおり。書き換える箇所はない。
--
-- 【データが残らない仕組み】 002/003 のテストと同じ
--   テスト用の stores / visit_plans / auth.users は関数内の副トランザクションで作り、
--   最後に必ず例外を投げて全部 rollback する。関数は pg_temp(このセッション限り)に作る。
--   本物の stores / visit_plans は読みも書きもしない(テスト用 place_id は '__s3__' など)。
--   ※ 件数が3人以上の日を作るには複数ユーザーが必要なため、テスト用の auth.users を
--     5人ぶん一時的に作る(id だけの最小の行。rollback で消える)。
--     もし auth.users への insert が権限や trigger で失敗した場合は、最終表の
--     「テスト実行中に想定外のエラー」の行にその内容が出る。
--
-- 【テストの店】(日付は日本時間の今日 = T)
--   S3 (閾値3):  T: 予定4/来店3   T+1: 予定2   T+2: 予定3   T+3: 0
--                T-1: 予定5/来店2   T-2: 予定1/来店1   T-3: 予定3/来店0
--                窓の外(T-20, T+20)に予定1
--   S1 (閾値1):  T: 予定2/来店1   T+1: 予定1   T-1: 予定1/来店0
--   SD (既定のトークンを持つだけの店。トークン長の確認用)

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

-- 予定を一括作成: 先頭 n 人ぶんの予定を作り、そのうち先頭 v 人は来店済みにする
create function pg_temp.t_seed(uids uuid[], n int, v int, place text, day date)
returns void language sql as $$
  insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visited_at)
  select u, place, 'テスト', day, case when i <= v then now() end
    from unnest(uids) with ordinality as t(u, i)
   where i <= n
$$;

-- 結果 jsonb の配列 arr から、日付 d の行の field を取り出す
create function pg_temp.t_day(r jsonb, arr text, d date, field text)
returns text language sql as $$
  select e->>field from jsonb_array_elements(r->arr) e where e->>'date' = to_char(d, 'YYYY-MM-DD')
$$;

-- jsonb オブジェクトのキーをカンマ区切りで(ソート済み)
create function pg_temp.t_keys(o jsonb)
returns text language sql as $$
  select string_agg(k, ',' order by k) from jsonb_object_keys(o) k
$$;

create function pg_temp.t_run()
returns table (n int, check_name text, expected text, actual text, result text)
language plpgsql as $$
declare
  jst_t   date := (now() at time zone 'Asia/Tokyo')::date;
  tok3    text := 'test_token_s3_aaaaaaaaaaaaaaaaaaaaaaaa';
  tok1    text := 'test_token_s1_bbbbbbbbbbbbbbbbbbbbbbbb';
  uids    uuid[];
  res     jsonb := '[]'::jsonb;
  r3      jsonb;
  r1      jsonb;
  t3      text;
  t1      text;
  ng      int;
begin
  begin  -- ここから rollback される範囲
    -- テスト用ユーザー5人(rollback で消える)
    with x as (insert into auth.users (id) select gen_random_uuid() from generate_series(1, 5) returning id)
      select array_agg(id) into uids from x;

    insert into public.stores (place_id, name, verify_code, owner_token, min_display_count) values
      ('__s3__', 'テストS3', '9876', tok3, 3),
      ('__s1__', 'テストS1', '5432', tok1, 1);
    insert into public.stores (place_id, name) values ('__sd__', 'テストSD');   -- トークンは既定値

    -- S3
    perform pg_temp.t_seed(uids, 4, 3, '__s3__', jst_t);
    perform pg_temp.t_seed(uids, 2, 0, '__s3__', jst_t + 1);
    perform pg_temp.t_seed(uids, 3, 0, '__s3__', jst_t + 2);
    perform pg_temp.t_seed(uids, 5, 2, '__s3__', jst_t - 1);
    perform pg_temp.t_seed(uids, 1, 1, '__s3__', jst_t - 2);
    perform pg_temp.t_seed(uids, 3, 0, '__s3__', jst_t - 3);
    perform pg_temp.t_seed(uids, 1, 0, '__s3__', jst_t - 20);
    perform pg_temp.t_seed(uids, 1, 0, '__s3__', jst_t + 20);
    -- S1
    perform pg_temp.t_seed(uids, 2, 1, '__s1__', jst_t);
    perform pg_temp.t_seed(uids, 1, 0, '__s1__', jst_t + 1);
    perform pg_temp.t_seed(uids, 1, 0, '__s1__', jst_t - 1);

    t3 := pg_temp.t_call('anon', format('select public.store_stats(%L)::text', tok3));
    t1 := pg_temp.t_call('anon', format('select public.store_stats(%L)::text', tok1));
    res := pg_temp.t_add(res, '未ログイン(anon)が呼べる', 'true', (left(t3, 6) <> 'denied')::text);
    r3 := t3::jsonb;
    r1 := t1::jsonb;

    -- A. 閾値3の店(S3) ------------------------------------------------------------
    res := pg_temp.t_add(res, 'S3: 店名', 'テストS3', r3->'store'->>'name');
    res := pg_temp.t_add(res, 'S3: 認証コード(店長に見せる)', '9876', r3->'store'->>'verify_code');
    res := pg_temp.t_add(res, 'S3: 閾値', '3', r3->>'min_display_count');
    res := pg_temp.t_add(res, 'S3: today が日本時間の今日', to_char(jst_t, 'YYYY-MM-DD'), r3->>'today');
    res := pg_temp.t_add(res, 'S3: upcoming は14日分', '14', jsonb_array_length(r3->'upcoming')::text);
    res := pg_temp.t_add(res, 'S3: upcoming の先頭は今日', to_char(jst_t, 'YYYY-MM-DD'), r3->'upcoming'->0->>'date');
    res := pg_temp.t_add(res, 'S3: upcoming の末尾は13日後(窓の外は含まない)', to_char(jst_t + 13, 'YYYY-MM-DD'), r3->'upcoming'->13->>'date');
    res := pg_temp.t_add(res, 'S3 今日: 予定4(伏せない)', '4', pg_temp.t_day(r3, 'upcoming', jst_t, 'planned'));
    res := pg_temp.t_add(res, 'S3 今日: 来店3(伏せない)', '3', pg_temp.t_day(r3, 'upcoming', jst_t, 'visited'));
    res := pg_temp.t_add(res, 'S3 今日: 来店率75%', '75', pg_temp.t_day(r3, 'upcoming', jst_t, 'rate'));
    res := pg_temp.t_add(res, 'S3 明日: 予定2 → 伏せる(planned=null)', '(null)', pg_temp.t_day(r3, 'upcoming', jst_t + 1, 'planned'));
    res := pg_temp.t_add(res, 'S3 明日: planned_masked = true', 'true', pg_temp.t_day(r3, 'upcoming', jst_t + 1, 'planned_masked'));
    res := pg_temp.t_add(res, 'S3 明日: 来店も伏せる(visited_masked = true)', 'true', pg_temp.t_day(r3, 'upcoming', jst_t + 1, 'visited_masked'));
    res := pg_temp.t_add(res, 'S3 明後日: 予定3(閾値ちょうどは伏せない)', '3', pg_temp.t_day(r3, 'upcoming', jst_t + 2, 'planned'));
    res := pg_temp.t_add(res, 'S3 3日後: 予定0(0は伏せず0と出す)', '0', pg_temp.t_day(r3, 'upcoming', jst_t + 3, 'planned'));
    res := pg_temp.t_add(res, 'S3 3日後: 0人の日は planned_masked = false', 'false', pg_temp.t_day(r3, 'upcoming', jst_t + 3, 'planned_masked'));
    res := pg_temp.t_add(res, 'S3 3日後: 予定0なら rate = null', '(null)', pg_temp.t_day(r3, 'upcoming', jst_t + 3, 'rate'));
    res := pg_temp.t_add(res, 'S3 過去: 予定のあった日だけ3日分(窓の外は含まない)', '3', jsonb_array_length(r3->'past')::text);
    res := pg_temp.t_add(res, 'S3 過去: 日付の降順(先頭は昨日)', to_char(jst_t - 1, 'YYYY-MM-DD'), r3->'past'->0->>'date');
    res := pg_temp.t_add(res, 'S3 昨日: 予定5(伏せない)', '5', pg_temp.t_day(r3, 'past', jst_t - 1, 'planned'));
    res := pg_temp.t_add(res, 'S3 昨日: 来店2 → 伏せる(visited=null)', '(null)', pg_temp.t_day(r3, 'past', jst_t - 1, 'visited'));
    res := pg_temp.t_add(res, 'S3 昨日: visited_masked = true', 'true', pg_temp.t_day(r3, 'past', jst_t - 1, 'visited_masked'));
    res := pg_temp.t_add(res, 'S3 昨日: 来店率も出さない(逆算防止)', '(null)', pg_temp.t_day(r3, 'past', jst_t - 1, 'rate'));
    res := pg_temp.t_add(res, 'S3 2日前: 予定1 → 伏せる', '(null)', pg_temp.t_day(r3, 'past', jst_t - 2, 'planned'));
    res := pg_temp.t_add(res, 'S3 2日前: 来店1も伏せる(予定が伏字なら来店も伏せる)', '(null)', pg_temp.t_day(r3, 'past', jst_t - 2, 'visited'));
    res := pg_temp.t_add(res, 'S3 3日前: 予定3', '3', pg_temp.t_day(r3, 'past', jst_t - 3, 'planned'));
    res := pg_temp.t_add(res, 'S3 3日前: 来店0(0は出す)', '0', pg_temp.t_day(r3, 'past', jst_t - 3, 'visited'));
    res := pg_temp.t_add(res, 'S3 3日前: 来店率0%', '0', pg_temp.t_day(r3, 'past', jst_t - 3, 'rate'));
    res := pg_temp.t_add(res, 'S3: 出てくる人数は 0 か 3以上だけ(1〜2が生で出ない)', 'true',
      (select bool_and(v is null or v = 0 or v >= 3) from (
         select (e->>fld)::int as v
           from jsonb_array_elements((r3->'upcoming') || (r3->'past')) e,
                unnest(array['planned','visited']) as f(fld)
       ) t)::text);

    -- B. 閾値1の店(S1): 1人でも出す ------------------------------------------------
    res := pg_temp.t_add(res, 'S1: 閾値', '1', r1->>'min_display_count');
    res := pg_temp.t_add(res, 'S1: 認証コードは店ごとに別', '5432', r1->'store'->>'verify_code');
    res := pg_temp.t_add(res, 'S1 今日: 予定2(S3の4が混ざらない)', '2', pg_temp.t_day(r1, 'upcoming', jst_t, 'planned'));
    res := pg_temp.t_add(res, 'S1 今日: 来店1(伏せない)', '1', pg_temp.t_day(r1, 'upcoming', jst_t, 'visited'));
    res := pg_temp.t_add(res, 'S1 今日: 来店率50%', '50', pg_temp.t_day(r1, 'upcoming', jst_t, 'rate'));
    res := pg_temp.t_add(res, 'S1 明日: 予定1(1人でも出る)', '1', pg_temp.t_day(r1, 'upcoming', jst_t + 1, 'planned'));
    res := pg_temp.t_add(res, 'S1 明日: planned_masked = false', 'false', pg_temp.t_day(r1, 'upcoming', jst_t + 1, 'planned_masked'));
    res := pg_temp.t_add(res, 'S1 過去: 1日分', '1', jsonb_array_length(r1->'past')::text);
    res := pg_temp.t_add(res, 'S1 昨日: 予定1・来店0・率0%', '1/0/0',
      pg_temp.t_day(r1, 'past', jst_t - 1, 'planned') || '/' || pg_temp.t_day(r1, 'past', jst_t - 1, 'visited')
      || '/' || pg_temp.t_day(r1, 'past', jst_t - 1, 'rate'));

    -- C. トークン ---------------------------------------------------------------
    res := pg_temp.t_add(res, '誤ったトークン → null', '(null)',
      pg_temp.t_call('anon', $q$ select public.store_stats('wrong_token_0000000000000000000000')::text $q$));
    res := pg_temp.t_add(res, 'NULLのトークン → null', '(null)',
      pg_temp.t_call('anon', 'select public.store_stats(null)::text'));
    res := pg_temp.t_add(res, '空のトークン → null', '(null)',
      pg_temp.t_call('anon', $q$ select public.store_stats('')::text $q$));
    res := pg_temp.t_add(res, 'S3のトークンの前半だけ → null', '(null)',
      pg_temp.t_call('anon', format('select public.store_stats(%L)::text', left(tok3, 20))));
    res := pg_temp.t_add(res, 'place_id をトークン代わりに使っても → null', '(null)',
      pg_temp.t_call('anon', $q$ select public.store_stats('__s3__')::text $q$));
    res := pg_temp.t_add(res, '既定の owner_token は64文字', '64',
      (select length(owner_token)::text from public.stores where place_id = '__sd__'));

    -- D. 個人を特定できる情報が含まれない -------------------------------------------
    res := pg_temp.t_add(res, '個人情報: テストユーザー5人のIDが結果(S3/S1)の文字列に一切現れない', 'false',
      (select coalesce(bool_or(t3 like '%' || u::text || '%' or t1 like '%' || u::text || '%'), false)::text
         from unnest(uids) u));
    res := pg_temp.t_add(res, '個人情報: user_id / visited_at / created_at / id の語が現れない', 'false',
      (t3 ~ '"(user_id|visited_at|created_at|id|restaurant_name)"'
       or t1 ~ '"(user_id|visited_at|created_at|id|restaurant_name)"')::text);
    res := pg_temp.t_add(res, '個人情報: 最上位のキーは決まった5つだけ', 'min_display_count,past,store,today,upcoming',
      pg_temp.t_keys(r3));
    res := pg_temp.t_add(res, '個人情報: store のキーは name と verify_code だけ', 'name,verify_code',
      pg_temp.t_keys(r3->'store'));
    res := pg_temp.t_add(res, '個人情報: 日ごとの行のキー(upcoming)は決まった6つだけ',
      'date,planned,planned_masked,rate,visited,visited_masked', pg_temp.t_keys(r3->'upcoming'->0));
    res := pg_temp.t_add(res, '個人情報: 日ごとの行のキー(past)は決まった6つだけ',
      'date,planned,planned_masked,rate,visited,visited_masked', pg_temp.t_keys(r3->'past'->0));
    res := pg_temp.t_add(res, '個人情報: 日ごとの行のキー(S1)も同じ6つだけ',
      'date,planned,planned_masked,rate,visited,visited_masked', pg_temp.t_keys(r1->'past'->0));

    -- E. 権限・設定 ---------------------------------------------------------------
    res := pg_temp.t_add(res, '権限: anon は stores を直接読めない', 'denied',
      pg_temp.t_call('anon', 'select * from public.stores'));
    res := pg_temp.t_add(res, '権限: anon は visit_plans を直接読めない', 'denied',
      pg_temp.t_call('anon', 'select * from public.visit_plans'));
    res := pg_temp.t_add(res, '設定: SECURITY DEFINER である', 'true',
      (select prosecdef::text from pg_proc where oid = 'public.store_stats(text)'::regprocedure));
    res := pg_temp.t_add(res, '設定: search_path が空に固定されている', 'true',
      (select exists (select 1 from unnest(proconfig) c where replace(c, '"', '') = 'search_path=')::text
         from pg_proc where oid = 'public.store_stats(text)'::regprocedure));
    res := pg_temp.t_add(res, '設定: authenticated も実行できる', 'true',
      has_function_privilege('authenticated', 'public.store_stats(text)', 'execute')::text);

    raise exception 'test rollback' using errcode = 'RB000';  -- 必ず rollback
  exception when others then
    if sqlstate <> 'RB000' then
      res := pg_temp.t_add(res, 'テスト実行中に想定外のエラー', '(なし)', sqlerrm);
    end if;
  end;

  -- F. テストデータが残っていない(rollback の確認)
  res := pg_temp.t_add(res, '後始末: テスト用 stores / visit_plans / auth.users の残り(件数)', '0',
    ((select count(*) from public.stores where place_id like '\_\_s%')
   + (select count(*) from public.visit_plans where place_id like '\_\_s%')
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
