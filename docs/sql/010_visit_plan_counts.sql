-- 010_visit_plan_counts: 店・時間帯ごとの「行く予定の人数」(混雑表示用) (feature/visit-hours ステップ3)
-- 実行場所: Supabase Dashboard > SQL Editor。何度実行しても同じ結果になる(index は if not exists、関数は create or replace)。
-- 前提: 008_visit_hours.sql が実行済みであること。
--
-- 【設計】
-- ・visit_plans は RLS で本人しか見えないため、SECURITY DEFINER で数える(001 の「将来メモ」の形)。
-- ・返すのは「店・時・人数」だけ。利用者ID・予定ID・時刻(created_at / visited_at)は返さない。
-- ・数えるのは来店宣言だけ。来店認証(visited_at)は見ない(認証済みの予定もそのまま1人)。
--   時間未定(visit_hour = null)の予定は数えない。0人の時間帯は行を返さない。
--   取り消し(delete)した予定は行ごと消えるので、そのまま人数から外れる。
-- ・表示中の店をまとめて1回で取れるよう、店は配列で受け取る。日付は1日分。
-- ・まとめて抜き出されないよう、範囲外の呼び出しは「空の結果」を返す(エラーにはしない):
--     店の数が 100 を超える / 日付が日本時間の「昨日」〜「30日後」の外 / 引数が null
-- ・人数が少なくても伏せない(仕様: 1〜2人も薄い色で表示する)。
--
-- 【誰が呼べるか】 今はログインした人(authenticated)だけ。
--   ログインなしでも見られるようにするときは、次の1行を実行するだけでよい(アプリ側の変更は不要にしてある):
--     grant execute on function public.visit_plan_counts(text[], date) to anon;
--   戻すとき: revoke execute on function public.visit_plan_counts(text[], date) from anon;
--
-- 【戻り値】 表(0行以上)
--   place_id text, visit_hour smallint, planned int     -- 店・時の順に並ぶ

-- 店・日付で数えるための索引(既存の索引は user_id が先頭のため使えない)。store_stats の集計にも効く
create index if not exists visit_plans_place_id_visit_date_idx
  on public.visit_plans (place_id, visit_date);

create or replace function public.visit_plan_counts(p_place_ids text[], p_date date)
returns table (place_id text, visit_hour smallint, planned int)
language sql
stable
security definer
set search_path = ''
as $$
  select vp.place_id, vp.visit_hour, count(*)::int
    from public.visit_plans vp
   where cardinality(p_place_ids) <= 100
     and p_date between (now() at time zone 'Asia/Tokyo')::date - 1
                    and (now() at time zone 'Asia/Tokyo')::date + 30
     and vp.place_id = any (p_place_ids)
     and vp.visit_date = p_date
     and vp.visit_hour is not null
   group by vp.place_id, vp.visit_hour
   order by vp.place_id, vp.visit_hour
$$;

revoke all on function public.visit_plan_counts(text[], date) from public, anon;
grant execute on function public.visit_plan_counts(text[], date) to authenticated;
