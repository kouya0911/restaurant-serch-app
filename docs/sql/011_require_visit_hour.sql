-- 011_require_visit_hour: 新しい宣言では「時間未定」を禁止する (feature/visit-hours ステップ7)
-- 実行場所: Supabase Dashboard > SQL Editor。何度実行しても同じ結果になる。
-- 前提: 008_visit_hours.sql が実行済みであること。
--
-- ★ 本番(Vercel)に時間帯ボタンのあるアプリが反映されたことを確認してから実行すること。
--   反映前の古いアプリは visit_hour を送らないので、これを先に実行すると予定の登録ができなくなる。
--   確認のしかた: 本番の URL で「行く日をカレンダーに追加」を開き、「行く時間帯」のボタンが出ていること。
--
-- 【なぜ締めるのか】
--   時間未定(visit_hour = null)の予定は、旧ルール(当日ならいつでも認証できる)で来店認証される。
--   アプリを通さずに API から時間未定で宣言されると、「1時間前までに宣言」のルールをすり抜けられる。
--   そこで、利用者(authenticated)からの insert では visit_hour を必須にする。
--
-- 【変えないもの】
--   ・既存の時間未定の予定はそのまま(今までどおり当日なら認証できる)。
--   ・check 制約にはしない。制約だと、既存の時間未定の行を update するたびに違反になり、
--     verify_visit の visited_at の記録や 005 のリセット(ブロック B・H)が止まってしまう。
--     ポリシーは利用者の insert にだけ効き、SECURITY DEFINER の関数や SQL Editor には効かない。
--
-- 【元に戻すとき】 001 の定義に戻す:
--   drop policy if exists "visit_plans_insert_own" on public.visit_plans;
--   create policy "visit_plans_insert_own" on public.visit_plans
--     for insert to authenticated with check ((select auth.uid()) = user_id);

begin;

drop policy if exists "visit_plans_insert_own" on public.visit_plans;
create policy "visit_plans_insert_own" on public.visit_plans
  for insert to authenticated
  with check ((select auth.uid()) = user_id and visit_hour is not null);

commit;
