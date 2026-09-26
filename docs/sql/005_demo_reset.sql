-- 005_demo_reset: リハーサル/本番前のリセット。実行場所: Supabase SQL Editor
--
-- 【触れる範囲】 stores に登録されている店(= デモ店)の visit_plans だけ。
--   stores に無い店の予定、お気に入り、住所、プロフィール、stores 自体には一切触れない。
--   (SQL Editor は RLS を素通りするので、利用者本人の予定も消せる。だから対象を stores の店に絞っている)
--
-- 【使い方】 全文をそのまま Run すると、ブロックA(今日の予定を全部消す)だけが実行される。
--   ほかのブロックは `--` でコメントアウトしてある。使うときは、そのブロックのコメントを外して
--   「そのブロックだけを選択して」Run する(選択しないと、外したものが全部走る)。
--   実行前後の確認は 005_demo_status.sql。
--
--   A. 今日の予定を全部消す(基本のリセット)             ← 既定
--   B. 来店の記録だけ戻す(予定は残す。「行ったよ」からやり直したいとき)
--   C. 特定のユーザー(メールアドレス指定)の今日の予定だけ消す
--   D. デモ店の全期間の予定を全部消す(最終リセット。過去分も消える)
--   E. デモ用の設定に戻す(認証コード 1234 / 閾値 1)。本番設定(閾値3)に戻す行も
--   F. 店長ページの URL を作り直す(画面共有・録画に URL が写った後、古い URL を無効にする)

-- ---------------------------------------------------------------------------
-- A. デモ店の「今日」(日本時間)の予定を全部消す。結果は店ごとの削除件数
-- ---------------------------------------------------------------------------
with del as (
  delete from public.visit_plans vp
   where vp.place_id in (select place_id from public.stores)
     and vp.visit_date = (now() at time zone 'Asia/Tokyo')::date
  returning vp.place_id
)
select s.name, count(d.place_id) as deleted_today_plans
  from public.stores s
  left join del d on d.place_id = s.place_id
 group by s.id, s.name
 order by s.id;

-- ---------------------------------------------------------------------------
-- B. 来店の記録(visited_at)だけを null に戻す。予定は残る(今日分・デモ店のみ)
-- ---------------------------------------------------------------------------
-- with upd as (
--   update public.visit_plans vp
--      set visited_at = null
--    where vp.place_id in (select place_id from public.stores)
--      and vp.visit_date = (now() at time zone 'Asia/Tokyo')::date
--      and vp.visited_at is not null
--   returning vp.place_id
-- )
-- select s.name, count(u.place_id) as reset_visited
--   from public.stores s
--   left join upd u on u.place_id = s.place_id
--  group by s.id, s.name
--  order by s.id;

-- ---------------------------------------------------------------------------
-- C. 特定のユーザーの、デモ店・今日の予定だけ消す(メールアドレスを書き換える)
--    例: スマホAのアカウントだけリセットして、スマホBの予定は残したいとき
-- ---------------------------------------------------------------------------
-- with del as (
--   delete from public.visit_plans vp
--    where vp.place_id in (select place_id from public.stores)
--      and vp.visit_date = (now() at time zone 'Asia/Tokyo')::date
--      and vp.user_id = (select id from auth.users where email = 'ここにメールアドレス')
--   returning vp.place_id
-- )
-- select s.name, count(d.place_id) as deleted
--   from public.stores s
--   left join del d on d.place_id = s.place_id
--  group by s.id, s.name
--  order by s.id;

-- ---------------------------------------------------------------------------
-- D. デモ店の全期間の予定を消す(過去・未来を含む。取り消せない。最終リセット用)
-- ---------------------------------------------------------------------------
-- with del as (
--   delete from public.visit_plans vp
--    where vp.place_id in (select place_id from public.stores)
--   returning vp.place_id
-- )
-- select s.name, count(d.place_id) as deleted_all_plans
--   from public.stores s
--   left join del d on d.place_id = s.place_id
--  group by s.id, s.name
--  order by s.id;

-- ---------------------------------------------------------------------------
-- E. 設定を切り替える(全デモ店)
-- ---------------------------------------------------------------------------
-- デモ用: 認証コードを 1234 に、閾値を 1 に(少人数でも数字が出る)
-- update public.stores set verify_code = '1234', min_display_count = 1;
-- 本番設定に戻す: 閾値を 3 に(3人未満の日は「少数」と伏せる)
-- update public.stores set min_display_count = 3;

-- ---------------------------------------------------------------------------
-- F. 店長ページの URL(owner_token)を作り直す。古い URL は即座に開けなくなる
--    デモ・録画・画面共有のあとに実行する。新しい URL は 005_demo_status.sql の store_page_path で確認
-- ---------------------------------------------------------------------------
-- update public.stores
--    set owner_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
-- returning name, '/store/' || owner_token as new_store_page_path;
