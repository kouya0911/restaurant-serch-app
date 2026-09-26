-- デモ店を選ぶための調査SQL(読み取りのみ)。実行場所: Supabase SQL Editor
-- 既存の「予定」と「お気に入り」に入っている店の place_id を一覧する。
-- ここから stores に登録したい店を選び、002_demo_stores_insert.sql に place_id と店名を書き写す。
-- (SQL Editor は RLS を素通りするので、全ユーザー分が見える)

select
  place_id,
  max(restaurant_name)          as restaurant_name,
  sum(plans)                    as visit_plans_count,
  sum(favs)                     as favorites_count,
  exists (select 1 from public.stores s where s.place_id = t.place_id) as already_in_stores
from (
  select place_id, restaurant_name, 1 as plans, 0 as favs from public.visit_plans
  union all
  select place_id, restaurant_name, 0 as plans, 1 as favs from public.favorites
) t
group by place_id
order by visit_plans_count desc, favorites_count desc, restaurant_name;
