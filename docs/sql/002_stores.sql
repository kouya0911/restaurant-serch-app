-- 002_stores: 店舗テーブル(来店認証コード・店長ページ用トークン)と visit_plans の権限締め直し
-- (feature/visit-plans 来店認証フェーズ ステップ1)
-- 実行場所: Supabase Dashboard > SQL Editor。1回だけ実行する(再実行は already exists で止まる)。
-- 前提: 001_visit_plans.sql が実行済みであること。
--
-- 【なぜ visit_plans を締め直すのか】
-- 001 の RLS は「自分の行なら insert / update し放題」なので、ログイン済みの利用者が
-- ブラウザから直接 visited_at を書き込めてしまい、認証コードが意味を持たなくなる。
-- visited_at は、次のステップで作る verify_visit() 関数(SECURITY DEFINER)からしか
-- 書けないようにする。

begin;

-- ---------------------------------------------------------------------------
-- 1. stores
-- ---------------------------------------------------------------------------
create table public.stores (
  id                bigint generated always as identity primary key,
  place_id          text        not null unique check (length(place_id) > 0),  -- Google place_id
  name              text        not null check (length(name) > 0),
  verify_code       text        not null default '1234' check (length(verify_code) > 0),
  -- 店長ページの秘密URL用トークン(uuid2個ぶん=約244bit)。拡張機能なしで生成できる
  owner_token       text        not null unique
                                default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  -- 店長ページで「N人未満」と伏せる閾値。デモでは 1 に下げて使う
  min_display_count integer     not null default 3 check (min_display_count >= 1),
  created_at        timestamptz not null default now()
);

-- RLS を有効にし、ポリシーは1つも作らない + 権限も全部剥奪する。
-- → anon / authenticated(ブラウザ・Server Action)からは stores の中身を一切読めない。
--   照合・集計は次ステップ以降の SECURITY DEFINER 関数だけが行う。
alter table public.stores enable row level security;
revoke all on public.stores from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. visit_plans の権限を締め直す
-- ---------------------------------------------------------------------------
-- (a) update は誰にもさせない(アプリは update を使っていない)
drop policy "visit_plans_update_own" on public.visit_plans;
revoke update on public.visit_plans from authenticated;

-- (b) insert は列単位で許可する。visited_at / id / created_at は指定不可(デフォルト値のみ)
revoke insert on public.visit_plans from authenticated;
grant insert (user_id, place_id, restaurant_name, visit_date) on public.visit_plans to authenticated;

-- (c) 来店認証済み(visited_at が入った)予定は本人でも削除できない
drop policy "visit_plans_delete_own" on public.visit_plans;
create policy "visit_plans_delete_own" on public.visit_plans
  for delete to authenticated
  using ((select auth.uid()) = user_id and visited_at is null);

-- select は従来どおり(自分の行のみ)。insert の with check も 001 のまま。

commit;
