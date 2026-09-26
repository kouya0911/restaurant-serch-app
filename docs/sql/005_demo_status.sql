-- 005_demo_status: デモ店の現在の状況を確認する(読み取りのみ・安全)。実行場所: Supabase SQL Editor
-- デモ前のチェック、リハーサルの前後の確認に使う。何も変更しない。
--
-- 見るポイント
--   min_display_count : デモでは 1 になっていること(3 だと少人数の日は「少数」と伏せられる)
--   verify_code       : 台本どおりの認証コード(既定 1234)になっていること
--   today_planned / today_visited : リハ後は 0 / 0 に戻っていること(戻すなら 005_demo_reset.sql)
--   store_page_path   : 店長ページの URL の後半。ドメインの後ろにつなげて開く(他人に見せない)

select
  s.name,
  s.verify_code,
  s.min_display_count,
  count(vp.id) filter (where vp.visit_date = t.d)                as today_planned,
  count(vp.visited_at) filter (where vp.visit_date = t.d)        as today_visited,
  count(vp.id) filter (where vp.visit_date > t.d)                as future_planned,
  count(vp.id) filter (where vp.visit_date < t.d)                as past_planned,
  '/store/' || s.owner_token                                     as store_page_path
from public.stores s
cross join (select (now() at time zone 'Asia/Tokyo')::date as d) t
left join public.visit_plans vp on vp.place_id = s.place_id
group by s.id, s.name, s.verify_code, s.min_display_count, s.owner_token
order by s.id;
