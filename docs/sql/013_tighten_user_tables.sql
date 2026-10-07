-- 013_tighten_user_tables: addresses / favorites / profiles の権限の締め直しと、退会時に行が残らないようにする外部キー
-- 実行場所: Supabase Dashboard > SQL Editor。全文を貼って1回実行する。何度実行しても同じ結果になる。
-- 前提: 012_security_check.sql で、3つのテーブルの RLS が有効で「自分の行だけ」の条件になっていることを確認済み。
--       013_fk_check.sql で、今の外部キーが次のとおりであることを確認済み:
--         favorites.user_id → public.profiles(id)  ON DELETE CASCADE
--         addresses.user_id → auth.users(id)       ON DELETE CASCADE
--         profiles.id       → (auth.users への外部キーなし)
--
-- 【やること】
--   1. addresses / favorites / profiles から、anon(ログインしていない人)の権限をすべて外す。
--      RLS で行は見えないが、権限そのものを持たせない(二重の守り)。アプリはこの3つをログイン後にしか使わない。
--   2. この3つのテーブルで roles が public(= anon も含む全員)のポリシーを authenticated に変える
--      (addresses の delete、profiles の insert / update)。条件(using / with check)は変えない。
--      ポリシー名は実行時に pg_policies から読み取って変える。
--   3. handle_new_users() に search_path を設定する。関数の中身は変えない。
--      中身はテーブル名を "public." なしで書いている可能性があるため、'' ではなく「public, pg_temp」にする
--      (今と同じく public のテーブルが見つかり、pg_temp を最後に置くことで一時テーブルによるなりすましを防ぐ)。
--   4. profiles.id に、auth.users(id) を参照する ON DELETE CASCADE の外部キー(profiles_id_fkey)を付ける。
--      auth.users への外部キーがすでにあれば何もしない。
--      これで退会(auth.users の削除)のとき、profiles → favorites の順に一緒に消える(addresses は今までどおり直接消える)。
--
-- 【変えないもの】
--   favorites の外部キー(profiles を参照する形のまま)。
--
-- 【止まったとき】
--   「013 中止」で始まるエラーが出たら、どの変更も行われていない(全体が1つのトランザクション)。
--   エラー文をそのまま貼って報告する。
--
-- 【元に戻すとき】
--   1. grant select, insert, update, delete on public.addresses, public.favorites, public.profiles to anon;
--   2. alter policy "<ポリシー名>" on public.<テーブル> to public;   (addresses の delete、profiles の insert / update)
--   3. alter function public.handle_new_users() reset search_path;
--   4. alter table public.profiles drop constraint profiles_id_fkey;

begin;

-- ---------------------------------------------------------------------------
-- 0. 事前確認(ここで止まれば何も変わらない)
-- ---------------------------------------------------------------------------
do $$
declare
  v_prof_type    text;
  v_prof_orphans bigint;
  v_fn_count     int;
  v_has_fk       boolean;
begin
  select format_type(a.atttypid, a.atttypmod) into v_prof_type
    from pg_attribute a
   where a.attrelid = 'public.profiles'::regclass and a.attname = 'id' and not a.attisdropped;
  if v_prof_type is distinct from 'uuid' then
    raise exception '013 中止(何も変更していません): profiles.id の型が uuid ではありません(%)',
      coalesce(v_prof_type, '(列なし)');
  end if;

  select count(*) into v_fn_count
    from pg_proc f
    join pg_namespace n on n.oid = f.pronamespace
   where n.nspname = 'public' and f.proname = 'handle_new_users';
  if v_fn_count <> 1 then
    raise exception '013 中止(何も変更していません): public.handle_new_users が % 個見つかりました(1個のはず)', v_fn_count;
  end if;

  -- profiles.id → auth.users の外部キーがまだないときだけ、追加の前提を確かめる
  select exists (
    select 1
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.conrelid = 'public.profiles'::regclass
       and con.confrelid = 'auth.users'::regclass
       and array_length(con.conkey, 1) = 1
       and a.attname = 'id'
  ) into v_has_fk;

  if not v_has_fk then
    select count(*) into v_prof_orphans
      from public.profiles p
     where not exists (select 1 from auth.users u where u.id = p.id);
    if v_prof_orphans > 0 then
      raise exception '013 中止(何も変更していません): auth.users に存在しない profiles の行が % 件あります', v_prof_orphans;
    end if;

    if exists (select 1 from pg_constraint
                where conrelid = 'public.profiles'::regclass and conname = 'profiles_id_fkey') then
      raise exception '013 中止(何も変更していません): profiles に profiles_id_fkey という名前の制約がすでにあります(auth.users 以外を参照)';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. anon の権限をすべて外す
-- ---------------------------------------------------------------------------
revoke all on public.addresses, public.favorites, public.profiles from anon;

-- ---------------------------------------------------------------------------
-- 2. roles が public のポリシーを authenticated に変える(条件はそのまま)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.tablename, p.policyname
      from pg_policies p
     where p.schemaname = 'public'
       and p.tablename in ('addresses', 'favorites', 'profiles')
       and 'public' = any(p.roles)
  loop
    execute format('alter policy %I on public.%I to authenticated', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. handle_new_users() に search_path を設定する(中身は変えない)
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn regprocedure;
begin
  select f.oid::regprocedure into v_fn
    from pg_proc f
    join pg_namespace n on n.oid = f.pronamespace
   where n.nspname = 'public' and f.proname = 'handle_new_users';
  execute format('alter function %s set search_path = public, pg_temp', v_fn);
end $$;

-- ---------------------------------------------------------------------------
-- 4. profiles.id → auth.users(id) ON DELETE CASCADE(すでに auth.users への外部キーがあれば何もしない)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.conrelid = 'public.profiles'::regclass
       and con.confrelid = 'auth.users'::regclass
       and array_length(con.conkey, 1) = 1
       and a.attname = 'id'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade;
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- 実行後の状態(この表が出れば完了。続けて 013_tighten_user_tables_test.sql を実行する)
-- ---------------------------------------------------------------------------
select section, object, status
from (
  select '1_anon権限' as section,
         c.relname::text as object,
         coalesce(nullif(concat(
           case when has_table_privilege('anon', c.oid, 'SELECT') then 'S' end,
           case when has_table_privilege('anon', c.oid, 'INSERT') then 'I' end,
           case when has_table_privilege('anon', c.oid, 'UPDATE') then 'U' end,
           case when has_table_privilege('anon', c.oid, 'DELETE') then 'D' end), ''), '- (なし)') as status
    from pg_class c
   where c.oid in ('public.addresses'::regclass, 'public.favorites'::regclass, 'public.profiles'::regclass)

  union all

  select '2_policy',
         p.tablename::text || '.' || p.policyname::text,
         p.cmd || ' / roles=' || array_to_string(p.roles, ',')
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename in ('addresses', 'favorites', 'profiles')

  union all

  select '3_function',
         f.oid::regprocedure::text,
         coalesce(array_to_string(f.proconfig, ','), '!! search_path 未設定')
    from pg_proc f
    join pg_namespace n on n.oid = f.pronamespace
   where n.nspname = 'public' and f.proname = 'handle_new_users'

  union all

  select '4_fk',
         con.conrelid::regclass::text || '.' || con.conname::text,
         '→ ' || con.confrelid::regclass::text || ' / '
           || case con.confdeltype when 'c' then 'ON DELETE CASCADE' else '!! CASCADE ではない' end
    from pg_constraint con
   where con.contype = 'f'
     and con.conrelid in ('public.addresses'::regclass, 'public.favorites'::regclass, 'public.profiles'::regclass)
     and con.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
) x
order by section, object;
