-- visit_plans: 「行く日」の登録 (feature/visit-plans ステップ1)
-- 実行場所: Supabase Dashboard > SQL Editor (リポジトリにマイグレーション基盤が無いため手動実行)

create table public.visit_plans (
  id              bigint generated always as identity primary key,
  user_id         uuid        not null default auth.uid()
                              references auth.users (id) on delete cascade,
  place_id        text        not null check (length(place_id) > 0),
  restaurant_name text        not null check (length(restaurant_name) > 0),
  visit_date      date        not null,   -- タイムゾーンを持たない日付 (UTCずれ対策)
  visited_at      timestamptz null,       -- 次フェーズの来店認証で使用。登録時は null
  created_at      timestamptz not null default now(),
  constraint visit_plans_user_place_date_key unique (user_id, place_id, visit_date)
);

-- 一覧 (自分の予定を日付順) 用。unique index は visit_date が先頭でないため別途作成
create index visit_plans_user_id_visit_date_idx
  on public.visit_plans (user_id, visit_date);

alter table public.visit_plans enable row level security;

create policy "visit_plans_select_own" on public.visit_plans
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "visit_plans_insert_own" on public.visit_plans
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "visit_plans_update_own" on public.visit_plans
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "visit_plans_delete_own" on public.visit_plans
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 未ログイン(anon)からは一切触れない
revoke all on public.visit_plans from anon;

-- ---------------------------------------------------------------------------
-- 【将来メモ】店側ページで「店ごと・日付ごとの件数だけ」を見せる場合
-- RLS は「自分の行だけ」のまま変えない。件数だけ返す SECURITY DEFINER 関数を作る:
--
--   create function public.visit_plan_counts(p_place_id text, p_from date, p_to date)
--   returns table (visit_date date, cnt bigint)
--   language sql security definer set search_path = ''
--   as $$
--     select visit_date, count(*) from public.visit_plans
--     where place_id = p_place_id and visit_date between p_from and p_to
--     group by visit_date
--   $$;
--   revoke all on function public.visit_plan_counts(text, date, date) from public, anon;
--   grant execute on function public.visit_plan_counts(text, date, date) to authenticated;
--
-- 店側が匿名(anon)で見る場合は grant 先を変える。user_id / 個別行は返さない。
-- 少人数の日が特定される懸念があれば、cnt < N は非表示にするなどを検討。
-- ---------------------------------------------------------------------------
