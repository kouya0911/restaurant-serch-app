-- 010_visit_plan_counts_test: visit_plan_counts() の動作テスト。SQL Editor に貼って1回実行するだけ。
--
-- 【使い方】
--   全文を貼って Run。最後の表に、チェックごとの ✅ OK / ❌ NG が出る。
--   最終行「総合(NGの件数)」が 0 ならすべて期待どおり。書き換える箇所はない。
--
-- 【データが残らない仕組み】 004 のテストと同じ
--   テスト用の visit_plans / auth.users は関数内の副トランザクションで作り、最後に必ず例外を投げて全部 rollback する。
--   関数は pg_temp(このセッション限り)に作る。本物のデータは読みも書きもしない(テスト用 place_id は '__c_...')。
--   ※ 同じ店・同じ日に複数人の予定を作るため、テスト用の auth.users を8人ぶん一時的に作る(rollback で消える)。
--   ※ 「ログインなしで解禁する1行」(grant ... to anon)も rollback の中で試す。権限も rollback で元に戻る。
--
-- 【テストの店】(日付は日本時間の今日 = T。結果は「店:時=人数」をカンマでつないで比べる。A = __c_a__ など)
--   A  T:   12時台 3人(うち1人は来店認証済み)  13時台 1人  時間未定 2人
--      T-1: 12時台 1人   T-2: 12時台 1人(範囲外)   T+30: 18時台 1人   T+31: 18時台 1人(範囲外)
--   B  T:   12時台 2人   T+1: 12時台 1人
--   C  T:   12時台 1人(問い合わせに含めない店)
--
-- 表の見方: 期待 = 結果の文字列 / denied(SQLSTATE) (権限エラー) / true・false・件数

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

-- 予定を一括作成: us の各ユーザーに1件ずつ。先頭 v 人は来店済みにする。p_hour が null なら時間未定
create function pg_temp.t_seed(us uuid[], place text, day date, p_hour int, v int)
returns void language sql as $$
  insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visit_hour, visited_at)
  select u, place, 'テスト', day, p_hour, case when i <= v then now() end
    from unnest(us) with ordinality as t(u, i)
$$;

-- visit_plan_counts を指定ロールで呼び、「店:時=人数」をカンマでつないだ文字列にする(0行なら '(なし)')
-- 店名は '__c_a__' → 'A' のように短くする
create function pg_temp.t_counts(p_role text, p_ids text[], p_date date)
returns text language sql as $$
  select pg_temp.t_call(p_role, null, format(
    'select coalesce(string_agg(upper(replace(replace(place_id, ''__c_'', ''''), ''__'', '''')) '
    '|| '':'' || visit_hour || ''='' || planned, '','' order by place_id, visit_hour), ''(なし)'') '
    'from public.visit_plan_counts(%L::text[], %L::date)', p_ids, p_date))
$$;

create function pg_temp.t_run()
returns table (n int, check_name text, expected text, actual text, result text)
language plpgsql as $$
declare
  t      date := (now() at time zone 'Asia/Tokyo')::date;
  ab     text[] := array['__c_a__', '__c_b__'];
  ids100 text[];
  ids101 text[];
  uids   uuid[];
  res    jsonb := '[]'::jsonb;
  ng     int;
begin
  -- 店 A を含む、ちょうど100件 / 101件の配列
  select array['__c_a__'] || array_agg('__c_dummy' || g || '__') into ids100 from generate_series(1, 99) g;
  ids101 := ids100 || array['__c_dummy100__'];

  begin  -- ここから rollback される範囲
    with x as (insert into auth.users (id) select gen_random_uuid() from generate_series(1, 8) returning id)
      select array_agg(id) into uids from x;

    perform pg_temp.t_seed(uids[1:3], '__c_a__', t,      12,   1);
    perform pg_temp.t_seed(uids[4:4], '__c_a__', t,      13,   0);
    perform pg_temp.t_seed(uids[5:6], '__c_a__', t,      null, 0);
    perform pg_temp.t_seed(uids[1:1], '__c_a__', t - 1,  12,   0);
    perform pg_temp.t_seed(uids[1:1], '__c_a__', t - 2,  12,   0);
    perform pg_temp.t_seed(uids[1:1], '__c_a__', t + 30, 18,   0);
    perform pg_temp.t_seed(uids[1:1], '__c_a__', t + 31, 18,   0);
    perform pg_temp.t_seed(uids[1:2], '__c_b__', t,      12,   0);
    perform pg_temp.t_seed(uids[1:1], '__c_b__', t + 1,  12,   0);
    perform pg_temp.t_seed(uids[1:1], '__c_c__', t,      12,   0);

    -- A. 人数 ---------------------------------------------------------------------
    res := pg_temp.t_add(res, '今日: A・B をまとめて1回で(認証済みも数える・時間未定と C は数えない・0人の時台は出ない)',
      'A:12=3,A:13=1,B:12=2', pg_temp.t_counts('authenticated', ab, t));
    res := pg_temp.t_add(res, '明日: B の12時台だけ', 'B:12=1', pg_temp.t_counts('authenticated', ab, t + 1));
    res := pg_temp.t_add(res, '店1つだけ(詳細モーダルの使い方)', 'A:12=3,A:13=1',
      pg_temp.t_counts('authenticated', array['__c_a__'], t));
    res := pg_temp.t_add(res, '予定の無い店だけ → 0行', '(なし)',
      pg_temp.t_counts('authenticated', array['__c_none__'], t));

    -- B. 範囲 ---------------------------------------------------------------------
    res := pg_temp.t_add(res, '日付: 昨日は取れる', 'A:12=1', pg_temp.t_counts('authenticated', ab, t - 1));
    res := pg_temp.t_add(res, '日付: 2日前は範囲外 → 0行', '(なし)', pg_temp.t_counts('authenticated', ab, t - 2));
    res := pg_temp.t_add(res, '日付: 30日後は取れる', 'A:18=1', pg_temp.t_counts('authenticated', ab, t + 30));
    res := pg_temp.t_add(res, '日付: 31日後は範囲外 → 0行', '(なし)', pg_temp.t_counts('authenticated', ab, t + 31));
    res := pg_temp.t_add(res, '日付: null → 0行', '(なし)', pg_temp.t_counts('authenticated', ab, null));
    res := pg_temp.t_add(res, '店: ちょうど100件は取れる', 'A:12=3,A:13=1', pg_temp.t_counts('authenticated', ids100, t));
    res := pg_temp.t_add(res, '店: 101件は範囲外 → 0行', '(なし)', pg_temp.t_counts('authenticated', ids101, t));
    res := pg_temp.t_add(res, '店: 空の配列 → 0行', '(なし)', pg_temp.t_counts('authenticated', array[]::text[], t));
    res := pg_temp.t_add(res, '店: null → 0行', '(なし)', pg_temp.t_counts('authenticated', null, t));

    -- C. 取り消すと人数から消える -------------------------------------------------
    res := pg_temp.t_add(res, '本人が A の今日の予定を取り消す(削除できる)', 'true',
      (pg_temp.t_call('authenticated', uids[3], format(
        'delete from public.visit_plans where place_id = %L and visit_date = %L returning id', '__c_a__', t)) is not null)::text);
    res := pg_temp.t_add(res, '取り消したあと: A の12時台が 3 → 2', 'A:12=2,A:13=1,B:12=2',
      pg_temp.t_counts('authenticated', ab, t));

    -- D. 誰が呼べるか -------------------------------------------------------------
    res := pg_temp.t_add(res, '未ログイン(anon)は呼べない', 'denied',
      pg_temp.t_counts('anon', ab, t));
    -- 解禁の1行(rollback で元に戻る)
    grant execute on function public.visit_plan_counts(text[], date) to anon;
    res := pg_temp.t_add(res, '解禁の1行(grant ... to anon)のあと、anon でも取れる', 'A:12=2,A:13=1,B:12=2',
      pg_temp.t_counts('anon', ab, t));

    raise exception 'test rollback' using errcode = 'RB000';  -- 必ず rollback
  exception when others then
    if sqlstate <> 'RB000' then
      res := pg_temp.t_add(res, 'テスト実行中に想定外のエラー', '(なし)', sqlerrm);
    end if;
  end;

  -- E. 設定の確認(rollback のあと) ---------------------------------------------
  res := pg_temp.t_add(res, '設定: 返す列は place_id / visit_hour / planned だけ(誰が宣言したかは返さない)',
    'place_id,visit_hour,planned',
    (select string_agg(a.name, ',' order by a.ord)
       from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as a(name, mode, ord)
      where p.oid = 'public.visit_plan_counts(text[],date)'::regprocedure and a.mode = 't'));
  res := pg_temp.t_add(res, '設定: SECURITY DEFINER である', 'true',
    (select prosecdef::text from pg_proc where oid = 'public.visit_plan_counts(text[],date)'::regprocedure));
  res := pg_temp.t_add(res, '設定: search_path が空に固定されている', 'true',
    (select exists (select 1 from unnest(proconfig) c where replace(c, '"', '') = 'search_path=')::text
       from pg_proc where oid = 'public.visit_plan_counts(text[],date)'::regprocedure));
  res := pg_temp.t_add(res, '設定: authenticated は実行できる', 'true',
    has_function_privilege('authenticated', 'public.visit_plan_counts(text[],date)', 'execute')::text);
  res := pg_temp.t_add(res, '設定: anon は実行できない(テスト中の解禁は元に戻っている)', 'false',
    has_function_privilege('anon', 'public.visit_plan_counts(text[],date)', 'execute')::text);
  res := pg_temp.t_add(res, '設定: 店・日付の索引がある', 'true',
    (to_regclass('public.visit_plans_place_id_visit_date_idx') is not null)::text);

  -- F. テストデータが残っていない(rollback の確認)
  res := pg_temp.t_add(res, '後始末: テスト用 visit_plans / auth.users の残り(件数)', '0',
    ((select count(*) from public.visit_plans where place_id like '\_\_c\_%')
   + (select count(*) from auth.users where id = any (coalesce(uids, '{}'))))::text);

  select count(*) into ng from jsonb_array_elements(res) e where not (e->>'ok')::boolean;
  res := pg_temp.t_add(res, '総合(NGの件数)', '0', ng::text);

  return query
    select (e->>'n')::int, e->>'name', e->>'expected', e->>'actual',
           case when (e->>'ok')::boolean then '✅ OK' else '❌ NG' end
    from jsonb_array_elements(res) e
    order by 1;
end $$;

select * from pg_temp.t_run();
