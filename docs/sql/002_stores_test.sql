-- 002_stores_test: 002_stores.sql の権限テスト。SQL Editor に貼って1回実行するだけ。
--
-- 【使い方】
--   1. 下の「★ここだけ書き換える★」の1か所に、自分の auth.users の id を入れる。
--      (id は別途 `select id, email from auth.users;` で確認できる。
--       ログイン済みのアカウントなら何でも良い。データは残らない)
--   2. 全文を貼って Run。最後の表に、チェックごとの ✅ OK / ❌ NG が出る。
--      最終行「総合(NGの件数)」が 0 ならすべて期待どおり。
--
-- 【データが残らない仕組み】
--   テストデータ(stores・visit_plans)の作成と検証は、関数内の副トランザクションで行い、
--   最後に必ず例外を投げて全部 rollback する。関数は pg_temp(このセッション限り)に作るので
--   スキーマにも残らない。
--   ※ begin ... rollback で囲む方式にしないのは、SQL Editor が「最後の文の結果」だけを
--     表示するため。rollback を最後に置くと結果の表が見えなくなる。
--   ※ 実行者(postgres)でテストデータを作り、set local role で authenticated / anon に
--     なりすまして各操作を試す。auth.uid() は JWT の claim を設定して再現している。
--
-- 表の見方: 期待 = denied (権限エラー) / ok(N行) (通る。N行に効いた)
--   RLS で行が見えない・消せない場合はエラーにならず ok(0行) になる。

-- ★ここだけ書き換える★ ----------------------------------------------------
create function pg_temp.t_my_uid() returns uuid language sql as
$$ select '00000000-0000-0000-0000-000000000000'::uuid $$;   -- ← 自分の user id に置換
-- -------------------------------------------------------------------------

-- 結果1行を配列に足す
create function pg_temp.t_add(res jsonb, p_name text, p_expected text, p_actual text)
returns jsonb language sql as $$
  select res || jsonb_build_array(jsonb_build_object(
    'n', jsonb_array_length(res) + 1,
    'name', p_name, 'expected', p_expected, 'actual', p_actual,
    'ok', (p_actual = p_expected) or (p_expected = 'denied' and p_actual like 'denied%')
  ))
$$;

-- 指定ロール・指定ユーザーとして SQL を1本実行し、結果を文字列で返す
create function pg_temp.t_try(p_role text, p_uid uuid, p_sql text)
returns text language plpgsql as $$
declare
  n bigint;
  out text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    out := 'ok(' || n || '行)';
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
  other_uid uuid := gen_random_uuid();   -- auth.users に存在しない「別人」
  res       jsonb := '[]'::jsonb;
  v_plan    bigint;
  v_visited bigint;
  ng        int;
begin
  if not exists (select 1 from auth.users where id = my_uid) then
    raise exception 'auth.users に id=% が見つかりません。冒頭の user id を確認してください', my_uid;
  end if;

  begin  -- ここから rollback される範囲
    insert into public.stores (place_id, name) values ('__test_place__', 'テスト店');
    insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date)
      values (my_uid, '__test_place__', 'テスト店', current_date + 1) returning id into v_plan;
    insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visited_at)
      values (my_uid, '__test_place__', 'テスト店(認証済み)', current_date + 3, now())
      returning id into v_visited;

    -- A. stores は誰からも読み書きできない -------------------------------------
    res := pg_temp.t_add(res, 'stores: 利用者が select', 'denied',
      pg_temp.t_try('authenticated', my_uid, 'select * from public.stores'));
    res := pg_temp.t_add(res, 'stores: 未ログイン(anon)が select', 'denied',
      pg_temp.t_try('anon', null, 'select * from public.stores'));
    res := pg_temp.t_add(res, 'stores: 利用者が insert', 'denied',
      pg_temp.t_try('authenticated', my_uid,
        $q$ insert into public.stores (place_id, name) values ('__x__', 'x') $q$));
    res := pg_temp.t_add(res, 'stores: 利用者が認証コードを update', 'denied',
      pg_temp.t_try('authenticated', my_uid, $q$ update public.stores set verify_code = '0000' $q$));

    -- B. visit_plans: 閲覧・削除は本人のみ --------------------------------------
    res := pg_temp.t_add(res, 'visit_plans: 未ログイン(anon)が select', 'denied',
      pg_temp.t_try('anon', null, 'select * from public.visit_plans'));
    res := pg_temp.t_add(res, 'visit_plans: 本人が自分の予定を select(2件)', 'ok(2行)',
      pg_temp.t_try('authenticated', my_uid,
        format('select * from public.visit_plans where id in (%s, %s)', v_plan, v_visited)));
    res := pg_temp.t_add(res, 'visit_plans: 別人には見えない', 'ok(0行)',
      pg_temp.t_try('authenticated', other_uid,
        format('select * from public.visit_plans where id in (%s, %s)', v_plan, v_visited)));
    res := pg_temp.t_add(res, 'visit_plans: 別人は削除できない', 'ok(0行)',
      pg_temp.t_try('authenticated', other_uid,
        format('delete from public.visit_plans where id = %s', v_plan)));

    -- C. visit_plans: 今のアプリが使う操作は通る(壊れていないこと) ----------------
    res := pg_temp.t_add(res, 'visit_plans: 4列だけ指定して insert(アプリの登録)', 'ok(1行)',
      pg_temp.t_try('authenticated', my_uid, format(
        $q$ insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date)
            values (%L, '__test_place__', 'テスト店', current_date + 2) $q$, my_uid)));
    res := pg_temp.t_add(res, 'visit_plans: 未認証の自分の予定を delete(アプリの削除)', 'ok(1行)',
      pg_temp.t_try('authenticated', my_uid,
        format('delete from public.visit_plans where id = %s', v_plan)));

    -- D. visit_plans: 抜け道が塞がっている ---------------------------------------
    res := pg_temp.t_add(res, 'visit_plans: insert で visited_at を指定', 'denied',
      pg_temp.t_try('authenticated', my_uid, format(
        $q$ insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date, visited_at)
            values (%L, '__test_place__', 'テスト店', current_date + 5, now()) $q$, my_uid)));
    res := pg_temp.t_add(res, 'visit_plans: 他人名義で insert', 'denied',
      pg_temp.t_try('authenticated', my_uid, format(
        $q$ insert into public.visit_plans (user_id, place_id, restaurant_name, visit_date)
            values (%L, '__test_place__', 'テスト店', current_date + 6) $q$, other_uid)));
    res := pg_temp.t_add(res, 'visit_plans: visited_at を update(自己申告)', 'denied',
      pg_temp.t_try('authenticated', my_uid,
        format('update public.visit_plans set visited_at = now() where id = %s', v_visited)));
    res := pg_temp.t_add(res, 'visit_plans: 店名など他の列も update 不可', 'denied',
      pg_temp.t_try('authenticated', my_uid,
        format($q$ update public.visit_plans set restaurant_name = 'x' where id = %s $q$, v_visited)));
    res := pg_temp.t_add(res, 'visit_plans: 認証済みの予定は本人でも delete 不可', 'ok(0行)',
      pg_temp.t_try('authenticated', my_uid,
        format('delete from public.visit_plans where id = %s', v_visited)));
    res := pg_temp.t_add(res, 'visit_plans: 認証済みの予定も select はできる', 'ok(1行)',
      pg_temp.t_try('authenticated', my_uid,
        format('select * from public.visit_plans where id = %s', v_visited)));

    -- E. 設定そのものの確認 ------------------------------------------------------
    res := pg_temp.t_add(res, '設定: update ポリシーが存在しない(件数)', '0',
      (select count(*)::text from pg_policies
        where schemaname = 'public' and tablename = 'visit_plans'
          and policyname = 'visit_plans_update_own'));
    res := pg_temp.t_add(res, '設定: stores の RLS が有効', 'true',
      (select relrowsecurity::text from pg_class where oid = 'public.stores'::regclass));
    res := pg_temp.t_add(res, '設定: visited_at への insert 権限が authenticated に無い', 'false',
      has_column_privilege('authenticated', 'public.visit_plans', 'visited_at', 'INSERT')::text);
    res := pg_temp.t_add(res, '設定: 登録に使う4列の insert 権限は有る', 'true',
      (select bool_and(has_column_privilege('authenticated', 'public.visit_plans', c, 'INSERT'))::text
         from unnest(array['user_id','place_id','restaurant_name','visit_date']) as c));

    raise exception 'test rollback' using errcode = 'RB000';  -- 必ず rollback
  exception when others then
    if sqlstate <> 'RB000' then
      res := pg_temp.t_add(res, 'テスト実行中に想定外のエラー', '(なし)', sqlerrm);
    end if;
  end;

  -- F. テストデータが残っていない(rollback の確認)
  res := pg_temp.t_add(res, '後始末: テスト用 stores / visit_plans の残り(件数)', '0',
    ((select count(*) from public.stores where place_id like '\_\_%')
   + (select count(*) from public.visit_plans where place_id = '__test_place__'))::text);

  select count(*) into ng from jsonb_array_elements(res) e where not (e->>'ok')::boolean;
  res := pg_temp.t_add(res, '総合(NGの件数)', '0', ng::text);

  return query
    select (e->>'n')::int, e->>'name', e->>'expected', e->>'actual',
           case when (e->>'ok')::boolean then '✅ OK' else '❌ NG' end
    from jsonb_array_elements(res) e
    order by 1;
end $$;

select * from pg_temp.t_run();
