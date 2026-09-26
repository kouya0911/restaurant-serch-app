-- 004_store_stats: 店長ページ用の集計関数 (feature/visit-plans 来店認証フェーズ ステップ4)
-- 実行場所: Supabase Dashboard > SQL Editor。create or replace なので再実行しても良い。
-- 前提: 002_stores.sql が実行済みであること。
--
-- 【設計】
-- ・店長ページはログインなし。stores.owner_token(推測不能な64文字)を知っている人だけが
--   その店の集計を取れる。トークンが違えば null を返す(店の存在も分からない)。
-- ・visit_plans は RLS で本人しか見えないため、SECURITY DEFINER で集計する。
--   返すのは「日付ごとの件数」と、その店の名前・認証コードだけ。
--   利用者ID・予定ID・時刻(visited_at / created_at)・店以外の情報は一切返さない。
-- ・少人数の日が個人の特定につながらないよう、マスクは DB 内で行う
--   (画面側や API の直叩きで小さい数字が漏れない)。閾値は stores.min_display_count。
-- ・呼べるのは anon / authenticated(店長ページはログインなしで開くため)。
--
-- 【マスクの規則】 min = stores.min_display_count(既定3。デモでは1)
--   予定人数 p が 1 〜 min-1  → planned = null, planned_masked = true(画面では「min人未満」)
--                                 来店人数・来店率も出さない(visited_masked = true)
--   来店人数 v が 1 〜 min-1  → visited = null, visited_masked = true, rate = null
--                                 (来店率から人数が逆算できてしまうため率も出さない)
--   0人は伏せない(誰もいないことは個人を特定しない)
--
-- 【戻り値】 jsonb(トークンが不正なら null)
--   {
--     "store": { "name": ..., "verify_code": ... },
--     "min_display_count": 3,
--     "today": "2026-10-03",                       -- 日本時間
--     "upcoming": [ 今日〜13日後の14日分(0人の日も含む, 日付昇順) ],
--     "past":     [ 直近14日(昨日〜14日前)のうち予定が1人以上いた日(日付降順) ]
--   }
--   各日: { "date", "planned", "planned_masked", "visited", "visited_masked", "rate" }
--   ※ upcoming の visited は「今日」だけ意味を持つ(認証は当日のみのため、未来日は常に 0)。
--   ※ rate は 来店人数/予定人数 の百分率(整数)。伏せる場合・予定 0 人の場合は null。

create or replace function public.store_stats(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store record;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_up    jsonb;
  v_past  jsonb;
begin
  -- 明らかに短い/空のトークンは検索するまでもなく拒否
  if p_token is null or length(p_token) < 16 then
    return null;
  end if;

  select s.place_id, s.name, s.verify_code, s.min_display_count
    into v_store
    from public.stores s
   where s.owner_token = p_token;
  if not found then
    return null;
  end if;

  with days as (
    -- 昨日より14日前 〜 13日後の28日分(date の足し算なのでタイムゾーンに依存しない)
    select v_today + k as day from generate_series(-14, 13) as k
  ),
  counts as (
    select d.day,
           coalesce(x.planned, 0) as planned,
           coalesce(x.visited, 0) as visited
      from days d
      left join (
        select vp.visit_date,
               count(*)::int            as planned,
               count(vp.visited_at)::int as visited
          from public.visit_plans vp
         where vp.place_id = v_store.place_id
           and vp.visit_date between v_today - 14 and v_today + 13
         group by vp.visit_date
      ) x on x.visit_date = d.day
  ),
  masked as (
    select c.*,
           (c.planned between 1 and v_store.min_display_count - 1) as pm,
           (c.planned between 1 and v_store.min_display_count - 1)
             or (c.visited between 1 and v_store.min_display_count - 1) as vm
      from counts c
  ),
  daily as (
    select m.day, m.planned,
           jsonb_build_object(
             'date',           to_char(m.day, 'YYYY-MM-DD'),
             'planned',        case when m.pm then null else m.planned end,
             'planned_masked', m.pm,
             'visited',        case when m.vm then null else m.visited end,
             'visited_masked', m.vm,
             'rate',           case when not m.vm and m.planned > 0
                                    then round(100.0 * m.visited / m.planned)::int end
           ) as j
      from masked m
  )
  select
    coalesce(jsonb_agg(r.j order by r.day)      filter (where r.day >= v_today), '[]'::jsonb),
    coalesce(jsonb_agg(r.j order by r.day desc) filter (where r.day <  v_today and r.planned > 0), '[]'::jsonb)
    into v_up, v_past
    from daily r;

  return jsonb_build_object(
    'store',             jsonb_build_object('name', v_store.name, 'verify_code', v_store.verify_code),
    'min_display_count', v_store.min_display_count,
    'today',             to_char(v_today, 'YYYY-MM-DD'),
    'upcoming',          v_up,
    'past',              v_past
  );
end
$$;

revoke all on function public.store_stats(text) from public;
grant execute on function public.store_stats(text) to anon, authenticated;
