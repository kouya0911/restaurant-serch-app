-- 012_security_check: Supabase の権限まわりの点検(読み取り専用。何も変更しない)
-- 実行場所: Supabase Dashboard > SQL Editor。全文を貼って1回実行すると、1つの表で結果が出る。
--
-- 表の見方(status 列に "!!" が付いている行が要注意):
--   1_table    : public の全テーブル。RLS ON/OFF、ポリシー数、anon / authenticated が直接持つ権限
--                (S=select I=insert U=update D=delete。"-" は権限なし。列単位の grant はここには出ない)
--   2_policy   : すべての RLS ポリシー。using / check に auth.uid() と持ち主の列があるか
--   3_function : public の関数。SECURITY DEFINER なら search_path が設定されているか、anon が実行できるか
--   4_fk       : auth.users を参照する外部キー。アカウント削除のとき行が一緒に消えるか(CASCADE)
--   5_bucket   : Storage のバケット。public になっていないか
--   6_trigger  : auth.users に付いているトリガー(新規登録時に profiles を作る仕組みなど)

with tbl as (
  select c.oid, c.relname::text as relname, c.relkind, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
),
priv as (
  select t.oid,
         coalesce(nullif(concat(
           case when has_table_privilege('anon', t.oid, 'SELECT') then 'S' end,
           case when has_table_privilege('anon', t.oid, 'INSERT') then 'I' end,
           case when has_table_privilege('anon', t.oid, 'UPDATE') then 'U' end,
           case when has_table_privilege('anon', t.oid, 'DELETE') then 'D' end), ''), '-') as anon_priv,
         coalesce(nullif(concat(
           case when has_table_privilege('authenticated', t.oid, 'SELECT') then 'S' end,
           case when has_table_privilege('authenticated', t.oid, 'INSERT') then 'I' end,
           case when has_table_privilege('authenticated', t.oid, 'UPDATE') then 'U' end,
           case when has_table_privilege('authenticated', t.oid, 'DELETE') then 'D' end), ''), '-') as auth_priv
    from tbl t
)
select section, object, status, detail
from (
  -- 1. テーブル
  select '1_table' as section,
         t.relname as object,
         case
           when t.relkind in ('v', 'm') then '!! VIEW(RLSは効かない。security_invoker を確認)'
           when not t.relrowsecurity then '!! RLS OFF'
           when (select count(*) from pg_policies p
                  where p.schemaname = 'public' and p.tablename = t.relname) = 0
             then 'RLS ON(ポリシー0件=誰も直接触れない)'
           else 'RLS ON'
         end as status,
         'policies=' || (select count(*) from pg_policies p
                          where p.schemaname = 'public' and p.tablename = t.relname)::text
           || ' / anon=' || pv.anon_priv
           || ' / authenticated=' || pv.auth_priv as detail
    from tbl t
    join priv pv on pv.oid = t.oid

  union all

  -- 2. ポリシー
  select '2_policy',
         p.tablename::text || '.' || p.policyname::text,
         p.cmd || ' / ' || p.permissive
           || case when 'public' = any(p.roles) or 'anon' = any(p.roles)
                   then ' / !! anon にも効く' else '' end,
         'roles=' || array_to_string(p.roles, ',')
           || ' / using=' || coalesce(p.qual, '-')
           || ' / check=' || coalesce(p.with_check, '-')
    from pg_policies p
   where p.schemaname = 'public'

  union all

  -- 3. 関数
  select '3_function',
         f.proname::text || '(' || pg_get_function_identity_arguments(f.oid) || ')',
         case
           when f.prosecdef and f.proconfig is null then '!! SECURITY DEFINER で search_path 未設定'
           when f.prosecdef then 'SECURITY DEFINER'
           else 'invoker'
         end,
         'search_path=' || coalesce(array_to_string(f.proconfig, ','), '-')
           || ' / anon=' || has_function_privilege('anon', f.oid, 'EXECUTE')::text
           || ' / authenticated=' || has_function_privilege('authenticated', f.oid, 'EXECUTE')::text
    from pg_proc f
    join pg_namespace n on n.oid = f.pronamespace
   where n.nspname = 'public'

  union all

  -- 4. auth.users への外部キー
  select '4_fk',
         con.conrelid::regclass::text || '.' || con.conname::text,
         case con.confdeltype
           when 'c' then 'ON DELETE CASCADE'
           when 'n' then 'ON DELETE SET NULL'
           when 'd' then 'ON DELETE SET DEFAULT'
           when 'r' then '!! ON DELETE RESTRICT'
           else '!! ON DELETE NO ACTION'
         end,
         pg_get_constraintdef(con.oid)
    from pg_constraint con
   where con.contype = 'f'
     and con.confrelid = 'auth.users'::regclass

  union all

  -- 5. Storage バケット
  select '5_bucket',
         b.name::text,
         case when b.public then '!! public' else 'private' end,
         ''
    from storage.buckets b

  union all

  -- 6. auth.users のトリガー
  select '6_trigger',
         tg.tgname::text,
         tg.tgfoid::regproc::text,
         ''
    from pg_trigger tg
   where tg.tgrelid = 'auth.users'::regclass
     and not tg.tgisinternal
) x
order by section, object;
