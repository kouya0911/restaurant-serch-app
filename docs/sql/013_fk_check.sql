-- 013_fk_check: 013 の前の確認(読み取り専用。何も変更しない)。全文を貼って1回実行する。
-- 013_tighten_user_tables.sql が「constraint "favorites_user_id_fkey" ... already exists」で止まった原因を調べる。
--
-- 表の見方:
--   1_constraint    : favorites / profiles / addresses が持つ制約(外部キー以外も含む)。
--                     ref_tbl / ref_cols / on_delete で、外部キーが「どの表のどの列を、どの ON DELETE で」参照しているか分かる
--   2_referenced_by : ほかのテーブルから、この3つのテーブルを参照している外部キー
--   3_same_name     : 013 が付けようとした名前(favorites_user_id_fkey / profiles_id_fkey)の制約・索引がどこにあるか
--   4_column        : favorites / profiles の列の型(参照先と型が合っているか)

select section, tbl, name, kind, cols, ref_tbl, ref_cols, on_delete, detail
from (
  -- 1. 3つのテーブルが持つ制約(外部キー以外も含む)
  select '1_constraint' as section,
         con.conrelid::regclass::text as tbl,
         con.conname::text as name,
         case con.contype when 'f' then 'FOREIGN KEY' when 'p' then 'PRIMARY KEY'
              when 'u' then 'UNIQUE' when 'c' then 'CHECK' else con.contype::text end as kind,
         (select string_agg(a.attname::text, ',' order by k.ord)
            from unnest(con.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols,
         coalesce(con.confrelid::regclass::text, '') as ref_tbl,
         coalesce((select string_agg(a.attname::text, ',' order by k.ord)
            from unnest(con.confkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum), '') as ref_cols,
         case when con.contype <> 'f' then ''
              else case con.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL'
                   when 'd' then 'SET DEFAULT' when 'r' then 'RESTRICT' else 'NO ACTION' end end as on_delete,
         pg_get_constraintdef(con.oid)
           || case when con.convalidated then '' else ' / NOT VALID' end as detail
    from pg_constraint con
   where con.conrelid in ('public.favorites'::regclass, 'public.profiles'::regclass, 'public.addresses'::regclass)

  union all

  -- 2. ほかのテーブルから3つのテーブルを参照している外部キー
  select '2_referenced_by',
         con.conrelid::regclass::text, con.conname::text, 'FOREIGN KEY', '',
         con.confrelid::regclass::text, '',
         case con.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL'
              when 'd' then 'SET DEFAULT' when 'r' then 'RESTRICT' else 'NO ACTION' end,
         pg_get_constraintdef(con.oid)
    from pg_constraint con
   where con.contype = 'f'
     and con.confrelid in ('public.favorites'::regclass, 'public.profiles'::regclass, 'public.addresses'::regclass)
     and con.conrelid not in ('public.favorites'::regclass, 'public.profiles'::regclass, 'public.addresses'::regclass)

  union all

  -- 3. 013 が付けようとした名前と同じ名前の制約・索引が、データベースのどこかにないか
  select '3_same_name',
         coalesce(con.conrelid::regclass::text, ''), con.conname::text, 'constraint(' || con.contype::text || ')',
         '', '', '', '', n.nspname::text
    from pg_constraint con
    join pg_namespace n on n.oid = con.connamespace
   where con.conname in ('favorites_user_id_fkey', 'profiles_id_fkey')
  union all
  select '3_same_name', '', c.relname::text, 'relation(' || c.relkind::text || ')', '', '', '', '', n.nspname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where c.relname in ('favorites_user_id_fkey', 'profiles_id_fkey')

  union all

  -- 4. 列の型(参照先と型が合っているか)
  select '4_column', a.attrelid::regclass::text, a.attname::text, format_type(a.atttypid, a.atttypmod),
         case when a.attnotnull then 'NOT NULL' else 'NULL可' end, '', '', '', ''
    from pg_attribute a
   where a.attrelid in ('public.favorites'::regclass, 'public.profiles'::regclass)
     and a.attnum > 0 and not a.attisdropped
) x
order by section, tbl, name;
