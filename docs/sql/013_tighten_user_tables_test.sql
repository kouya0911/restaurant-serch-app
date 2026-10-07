-- 013_tighten_user_tables_test: 013 の動作テスト。SQL Editor に貼って1回実行するだけ。
-- ★ 013_tighten_user_tables.sql を実行したあとで実行する。
--
-- 【使い方】
--   全文を貼って Run。最後の表に、チェックごとの ✅ OK / ❌ NG が出る。
--   最終行「総合(NGの件数)」が 0 ならすべて期待どおり。書き換える箇所はない。
--
-- 【テストに使うユーザー】
--   本物のユーザーは使わない。テスト用のユーザーを2人(A・B)、auth.users に一時的に作る
--   (メールアドレスは __r_013_...@example.invalid)。作ったときに handle_new_users() が動くので、
--   「新規ログイン時のプロフィール作成」もこれで確かめる。
--
-- 【データが残らない仕組み】 011 までのテストと同じ
--   テスト用のデータは関数内の副トランザクションで作り、最後に必ず例外を投げて全部 rollback する。
--   関数は pg_temp(このセッション限り)に作る。本物の行は読みも書きもしない。
--
-- 表の見方: 期待 = 結果の値 / denied(SQLSTATE) (権限・ポリシーのエラー) / (null) = 0行(RLS で見えない・触れない) / 件数

create function pg_temp.t_add(res jsonb, p_name text, p_expected text, p_actual text)
returns jsonb language sql as $$
  select res || jsonb_build_array(jsonb_build_object(
    'n', jsonb_array_length(res) + 1,
    'name', p_name, 'expected', p_expected, 'actual', coalesce(p_actual, '(null)'),
    'ok', (coalesce(p_actual, '(null)') = p_expected)
          or (p_expected = 'denied' and p_actual like 'denied%')
  ))
$$;

-- 指定ロール・指定ユーザーとして SQL を1本実行し、1行1列目のテキストを返す(0行なら null)
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

-- テスト用ユーザーを auth.users に作る(handle_new_users() のトリガーが動く)
create function pg_temp.t_new_user(p_uid uuid) returns void language sql as $$
  insert into auth.users (id, instance_id, aud, role, email,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '__r_013_' || p_uid || '@example.invalid',
          '{"provider": "google", "providers": ["google"]}'::jsonb,
          '{"full_name": "テスト 013"}'::jsonb, now(), now())
$$;

create function pg_temp.t_run()
returns table (n int, check_name text, expected text, actual text, result text)
language plpgsql as $$
declare
  a_uid    uuid := gen_random_uuid();  -- テスト用ユーザー A
  b_uid    uuid := gen_random_uuid();  -- テスト用ユーザー B(他人役)
  res      jsonb := '[]'::jsonb;
  v        text;
  fav_a    bigint;  -- A のお気に入り
  addr_a1  bigint;  -- A の住所(選択する方)
  addr_a2  bigint;  -- A の住所(削除する方)
  ng       int;
begin
  begin  -- ここから rollback される範囲
    perform pg_temp.t_new_user(a_uid);
    perform pg_temp.t_new_user(b_uid);

    -- A. 新規ログイン時のプロフィール作成 ------------------------------------------
    res := pg_temp.t_add(res, '新規ユーザー作成で profiles が1行作られる(handle_new_users)', '1',
      (select count(*)::text from public.profiles where id = a_uid));

    -- B. お気に入り(アプリと同じ操作) ----------------------------------------------
    v := pg_temp.t_call('authenticated', a_uid, format(
      'insert into public.favorites (user_id, restaurant_name, place_id) values (%L, %L, %L) returning id',
      a_uid, 'テスト店', '__r_013_place'));
    fav_a := case when v ~ '^\d+$' then v::bigint end;
    res := pg_temp.t_add(res, 'お気に入り: 本人が追加できる', 'true', (fav_a is not null)::text);
    res := pg_temp.t_add(res, 'お気に入り: 本人の一覧に出る(件数)', '1',
      pg_temp.t_call('authenticated', a_uid, format(
        'select count(*)::text from public.favorites where user_id = %L', a_uid)));
    res := pg_temp.t_add(res, 'お気に入り: 他人(B)からは見えない(件数)', '0',
      pg_temp.t_call('authenticated', b_uid, format(
        'select count(*)::text from public.favorites where id = %s', coalesce(fav_a, -1))));
    res := pg_temp.t_add(res, 'お気に入り: 他人(B)は id 指定でも消せない(0行)', '(null)',
      pg_temp.t_call('authenticated', b_uid, format(
        'delete from public.favorites where id = %s returning id', coalesce(fav_a, -1))));
    res := pg_temp.t_add(res, 'お気に入り: 他人(B)が A の名前で追加 → 拒否', 'denied(42501)',
      pg_temp.t_call('authenticated', b_uid, format(
        'insert into public.favorites (user_id, restaurant_name, place_id) values (%L, %L, %L) returning id',
        a_uid, 'テスト店', '__r_013_place_b')));
    res := pg_temp.t_add(res, 'お気に入り: 本人は id 指定で削除できる(メニューと同じ操作)', coalesce(fav_a::text, '(追加失敗)'),
      pg_temp.t_call('authenticated', a_uid, format(
        'delete from public.favorites where id = %s returning id', coalesce(fav_a, -1))));

    -- C. 住所の保存・選択・削除(アプリと同じ操作) --------------------------------
    v := pg_temp.t_call('authenticated', a_uid, format(
      'insert into public.addresses (name, address_text, latitude, longitude, user_id) '
      'values (%L, %L, 35.0, 139.0, %L) returning id', 'テスト住所1', 'テスト市1', a_uid));
    addr_a1 := case when v ~ '^\d+$' then v::bigint end;
    v := pg_temp.t_call('authenticated', a_uid, format(
      'insert into public.addresses (name, address_text, latitude, longitude, user_id) '
      'values (%L, %L, 35.1, 139.1, %L) returning id', 'テスト住所2', 'テスト市2', a_uid));
    addr_a2 := case when v ~ '^\d+$' then v::bigint end;
    res := pg_temp.t_add(res, '住所: 本人が保存できる(2件)', 'true',
      (addr_a1 is not null and addr_a2 is not null)::text);
    res := pg_temp.t_add(res, '住所: 選択できる(profiles の upsert)', coalesce(addr_a1::text, '(保存失敗)'),
      pg_temp.t_call('authenticated', a_uid, format(
        'insert into public.profiles (id, selected_address_id) values (%L, %s) '
        'on conflict (id) do update set selected_address_id = excluded.selected_address_id '
        'returning selected_address_id', a_uid, coalesce(addr_a1, -1))));
    res := pg_temp.t_add(res, '住所: 本人の一覧に出る(件数)', '2',
      pg_temp.t_call('authenticated', a_uid, format(
        'select count(*)::text from public.addresses where user_id = %L', a_uid)));
    res := pg_temp.t_add(res, '住所: 選択中の住所を読める(/api/address と同じ)', coalesce(addr_a1::text, '(保存失敗)'),
      pg_temp.t_call('authenticated', a_uid, format(
        'select selected_address_id::text from public.profiles where id = %L', a_uid)));
    res := pg_temp.t_add(res, '住所: 他人(B)からは見えない(件数)', '0',
      pg_temp.t_call('authenticated', b_uid, format(
        'select count(*)::text from public.addresses where user_id = %L', a_uid)));
    res := pg_temp.t_add(res, '住所: 他人(B)は消せない(0行)', '(null)',
      pg_temp.t_call('authenticated', b_uid, format(
        'delete from public.addresses where id = %s returning id', coalesce(addr_a2, -1))));
    res := pg_temp.t_add(res, 'プロフィール: 他人(B)からは見えない(件数)', '0',
      pg_temp.t_call('authenticated', b_uid, format(
        'select count(*)::text from public.profiles where id = %L', a_uid)));
    res := pg_temp.t_add(res, 'プロフィール: 他人(B)は書き換えられない(0行)', '(null)',
      pg_temp.t_call('authenticated', b_uid, format(
        'update public.profiles set selected_address_id = null where id = %L returning id', a_uid)));
    res := pg_temp.t_add(res, '住所: 本人は削除できる(住所モーダルと同じ操作)', coalesce(addr_a2::text, '(保存失敗)'),
      pg_temp.t_call('authenticated', a_uid, format(
        'delete from public.addresses where id = %s and user_id = %L returning id', coalesce(addr_a2, -1), a_uid)));

    -- D. ログインしていない人(anon) ------------------------------------------------
    res := pg_temp.t_add(res, 'anon: addresses を読めない', 'denied(42501)',
      pg_temp.t_call('anon', null, 'select count(*)::text from public.addresses'));
    res := pg_temp.t_add(res, 'anon: favorites を読めない', 'denied(42501)',
      pg_temp.t_call('anon', null, 'select count(*)::text from public.favorites'));
    res := pg_temp.t_add(res, 'anon: profiles を読めない', 'denied(42501)',
      pg_temp.t_call('anon', null, 'select count(*)::text from public.profiles'));
    res := pg_temp.t_add(res, 'anon: favorites に追加できない', 'denied(42501)',
      pg_temp.t_call('anon', null, format(
        'insert into public.favorites (user_id, restaurant_name, place_id) values (%L, %L, %L) returning id',
        a_uid, 'テスト店', '__r_013_place_anon')));
    res := pg_temp.t_add(res, 'anon: addresses を消せない', 'denied(42501)',
      pg_temp.t_call('anon', null, format('delete from public.addresses where id = %s returning id', coalesce(addr_a1, -1))));

    -- E. 退会(auth.users の削除)で一緒に消える ------------------------------------
    --    auth.users → profiles(013 で追加) → favorites(今までの外部キー)の順に消える。addresses は auth.users から直接消える。
    perform pg_temp.t_call('authenticated', a_uid, format(
      'insert into public.favorites (user_id, restaurant_name, place_id) values (%L, %L, %L) returning id',
      a_uid, 'テスト店', '__r_013_place2'));
    res := pg_temp.t_add(res, '退会前: A の favorites / profiles / addresses がある(件数 1/1/1)', '1/1/1',
      (select count(*) from public.favorites where user_id = a_uid)::text || '/'
      || (select count(*) from public.profiles where id = a_uid)::text || '/'
      || (select count(*) from public.addresses where user_id = a_uid)::text);
    begin
      delete from auth.users where id = a_uid;
      res := pg_temp.t_add(res, '退会: auth.users を削除できる', 'ok', 'ok');
    exception when others then
      res := pg_temp.t_add(res, '退会: auth.users を削除できる', 'ok', sqlstate || ' ' || sqlerrm);
    end;
    res := pg_temp.t_add(res, '退会: A の profiles が消えた(auth.users → profiles)(件数)', '0',
      (select count(*)::text from public.profiles where id = a_uid));
    res := pg_temp.t_add(res, '退会: A の favorites も消えた(profiles → favorites)(件数)', '0',
      (select count(*)::text from public.favorites where user_id = a_uid));
    res := pg_temp.t_add(res, '退会: A の addresses が消えた(auth.users → addresses)(件数)', '0',
      (select count(*)::text from public.addresses where user_id = a_uid));
    res := pg_temp.t_add(res, '退会: 他人(B)のプロフィールは消えていない(件数)', '1',
      (select count(*)::text from public.profiles where id = b_uid));

    raise exception 'test rollback' using errcode = 'RB000';  -- 必ず rollback
  exception when others then
    if sqlstate <> 'RB000' then
      res := pg_temp.t_add(res, 'テスト実行中に想定外のエラー', '(なし)', sqlstate || ' ' || sqlerrm);
    end if;
  end;

  -- F. 設定の確認 ---------------------------------------------------------------
  res := pg_temp.t_add(res, '設定: 3つのテーブルで anon の権限がない', 'true',
    (not exists (
      select 1 from (values ('public.addresses'), ('public.favorites'), ('public.profiles')) as t(tbl)
       where has_table_privilege('anon', t.tbl::regclass, 'SELECT')
          or has_table_privilege('anon', t.tbl::regclass, 'INSERT')
          or has_table_privilege('anon', t.tbl::regclass, 'UPDATE')
          or has_table_privilege('anon', t.tbl::regclass, 'DELETE')))::text);
  res := pg_temp.t_add(res, '設定: roles が public のポリシーが残っていない(件数)', '0',
    (select count(*)::text from pg_policies
      where schemaname = 'public' and tablename in ('addresses', 'favorites', 'profiles')
        and 'public' = any(roles)));
  res := pg_temp.t_add(res, '設定: 3つのテーブルのポリシーはすべて authenticated 向け', 'true',
    (select bool_and(roles = array['authenticated']::name[])::text from pg_policies
      where schemaname = 'public' and tablename in ('addresses', 'favorites', 'profiles')));
  res := pg_temp.t_add(res, '設定: handle_new_users に search_path が設定されている', 'true',
    (select (array_to_string(f.proconfig, ',') like '%search_path=%')::text
       from pg_proc f join pg_namespace n on n.oid = f.pronamespace
      where n.nspname = 'public' and f.proname = 'handle_new_users'));
  res := pg_temp.t_add(res, '設定: profiles.id → auth.users が ON DELETE CASCADE(013 で追加)', 'true',
    (exists (select 1 from pg_constraint
              where contype = 'f' and conrelid = 'public.profiles'::regclass
                and confrelid = 'auth.users'::regclass and confdeltype = 'c'))::text);
  res := pg_temp.t_add(res, '設定: favorites.user_id → profiles が ON DELETE CASCADE(変更していない)', 'true',
    (exists (select 1 from pg_constraint
              where contype = 'f' and conrelid = 'public.favorites'::regclass
                and confrelid = 'public.profiles'::regclass and confdeltype = 'c'))::text);
  res := pg_temp.t_add(res, '設定: favorites から auth.users への外部キーは作っていない(件数)', '0',
    (select count(*)::text from pg_constraint
      where contype = 'f' and conrelid = 'public.favorites'::regclass
        and confrelid = 'auth.users'::regclass));

  -- G. テストデータが残っていない(rollback の確認)
  res := pg_temp.t_add(res, '後始末: テスト用ユーザー・お気に入りの残り(件数)', '0',
    ((select count(*) from auth.users where email like '\_\_r\_013\_%')
   + (select count(*) from public.favorites where place_id like '\_\_r\_013\_%'))::text);

  select count(*) into ng from jsonb_array_elements(res) e where not (e->>'ok')::boolean;
  res := pg_temp.t_add(res, '総合(NGの件数)', '0', ng::text);

  return query
    select (e->>'n')::int, e->>'name', e->>'expected', e->>'actual',
           case when (e->>'ok')::boolean then '✅ OK' else '❌ NG' end
    from jsonb_array_elements(res) e
    order by 1;
end $$;

select * from pg_temp.t_run();
