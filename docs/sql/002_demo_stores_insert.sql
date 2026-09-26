-- デモ店を stores に登録する。実行場所: Supabase SQL Editor
-- 先に 002_stores.sql を実行し、002_demo_stores_pick.sql で place_id を選んでおくこと。
--
-- ★ 下の values の place_id と店名を、実在のものに書き換えてから実行する。
--   (書き換えずに実行すると、ダミーの店が登録されてしまう。その場合は最下部の delete で消せる)
-- 認証コード(verify_code)は既定の '1234'、閾値(min_display_count)は既定の 3、
-- 店長ページ用の owner_token は自動で発行される。

insert into public.stores (place_id, name) values
  ('ここに place_id その1', '店名その1'),      -- ★書き換える
  ('ここに place_id その2', '店名その2'),      -- ★書き換える
  ('ここに place_id その3', '店名その3')       -- ★書き換える
returning id, place_id, name, verify_code, min_display_count, owner_token;

-- ---------------------------------------------------------------------------
-- 以下は必要なときに、1本ずつ選択して実行する
-- ---------------------------------------------------------------------------

-- 登録した店と、店長ページの URL パスを一覧する(本番/ローカルのドメインを前に付けて開く)
--   select name, verify_code, min_display_count, '/store/' || owner_token as store_page_path
--   from public.stores order by id;

-- 店ごとに認証コードを変える
--   update public.stores set verify_code = '5678' where place_id = 'ここに place_id';

-- デモで「3人未満」の伏せ字を弱める(全店 1 に)/ 本番設定に戻す(3 に)
--   update public.stores set min_display_count = 1;
--   update public.stores set min_display_count = 3;

-- 未書き換えで実行してしまったダミー店の削除
--   delete from public.stores where place_id like 'ここに place_id%';
