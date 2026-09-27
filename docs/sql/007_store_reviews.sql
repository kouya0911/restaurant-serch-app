-- 007_store_reviews: 店長ページ用のレビュー集計関数 (feature/visit-reviews ステップ4)
-- 実行場所: Supabase Dashboard > SQL Editor。create or replace なので再実行しても良い。
-- 前提: 002_stores.sql / 006_visit_reviews.sql が実行済みであること。stores は変更しない。
--
-- 【設計】 004 の store_stats と同じ作り
-- ・店長ページはログインなし。stores.owner_token を知っている人だけがその店のレビューを取れる。
--   トークンが違えば null を返す(店の存在も分からない)。
-- ・visit_reviews / visit_plans は RLS で本人しか見えないため、SECURITY DEFINER で集計する。
-- ・返すのは「件数・平均の星・最近のレビュー(星とひとこと)」だけ。
--   書いた人の ID・名前、予定 ID、レビュー ID は返さない。
-- ・デモ用のため、少人数の店で書いた人を推測されにくくする工夫(件数の閾値・表示の遅延など)はしない。
--   レビューは届いたらすぐ集計に入り、新しい順に並ぶ(並べるのに使うだけで、日時そのものは返さない)。
-- ・呼べるのは anon / authenticated(店長ページはログインなしで開くため)。
--
-- 【戻り値】 jsonb(トークンが不正なら null)
--   {
--     "count":   12,          -- その店のレビューの件数(0 もあり)
--     "average": 4.3,         -- 星の平均(小数第1位で四捨五入)。0件なら null
--     "recent":  [ { "rating": 5, "comment": "..." }, ... ]   -- 新しい順に最大10件。comment は null(星だけ)もあり
--   }

create or replace function public.store_reviews(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_place_id text;
  v_count    int;
  v_average  numeric;
  v_recent   jsonb;
begin
  -- 明らかに短い/空のトークンは検索するまでもなく拒否
  if p_token is null or length(p_token) < 16 then
    return null;
  end if;

  select s.place_id into v_place_id
    from public.stores s
   where s.owner_token = p_token;
  if not found then
    return null;
  end if;

  select count(*)::int, round(avg(r.rating), 1)
    into v_count, v_average
    from public.visit_reviews r
    join public.visit_plans vp on vp.id = r.plan_id
   where vp.place_id = v_place_id;

  select coalesce(
           jsonb_agg(jsonb_build_object('rating', x.rating, 'comment', x.comment)
                     order by x.created_at desc, x.id desc),
           '[]'::jsonb)
    into v_recent
    from (
      select r.id, r.rating, r.comment, r.created_at
        from public.visit_reviews r
        join public.visit_plans vp on vp.id = r.plan_id
       where vp.place_id = v_place_id
       order by r.created_at desc, r.id desc
       limit 10
    ) x;

  return jsonb_build_object(
    'count',   v_count,
    'average', v_average,
    'recent',  v_recent
  );
end
$$;

revoke all on function public.store_reviews(text) from public;
grant execute on function public.store_reviews(text) to anon, authenticated;
