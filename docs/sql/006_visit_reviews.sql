-- 006_visit_reviews: 来店後のレビュー(星1〜5・ひとこと) (feature/visit-reviews ステップ1)
-- 実行場所: Supabase Dashboard > SQL Editor。1回だけ実行する(再実行は already exists で止まり、全体が取り消される)。
-- 前提: 001〜003 が実行済みであること。
--
-- 【設計】
-- ・レビューは visit_plans とは別テーブルにする。visit_plans は 002 で update を全面禁止・
--   insert を列単位に絞っているので、そこに星の列を足して書き込みを許すと締め直しが崩れる。
-- ・予定1件につきレビュー1件(plan_id が unique)。編集・削除は今回やらない。
-- ・書き込みは submit_review() 関数(SECURITY DEFINER)からだけ。利用者はテーブルに直接
--   insert / update / delete できない。関数の中で「自分の予定か」「来店認証済みか」を確かめる。
-- ・読み取りは自分のレビューだけ(サイドバーで「書いた/まだ」を出すため)。
--   店長ページ向けの集計は次の 007 で、書いた人のID・名前を返さない関数として作る。
-- ・予定が消えればレビューも消える(on delete cascade)。来店認証済みの予定は本人には消せない
--   (002)ので、実際に消えるのはユーザー削除時と、SQL Editor でのデモのリセット時。
--
-- 【submit_review の戻り値】(text)
--   ok                レビューを保存した
--   not_authenticated ログインしていない
--   invalid_rating    星が 1〜5 の整数でない(null を含む)
--   too_long          ひとことが 200 文字を超える(前後の空白を除いて数える)
--   not_found         その予定が無い、または自分の予定ではない
--   not_visited       まだ来店認証していない予定
--   already           その予定にはすでにレビューがある(2回目は不可)
--
-- ひとことは前後の空白・改行(全角スペースを含む)を除き、空になったら null(星だけのレビュー)。
-- 文字数は char_length(コードポイント単位)。途中の改行も1文字として数える。

begin;

-- ---------------------------------------------------------------------------
-- 1. visit_reviews
-- ---------------------------------------------------------------------------
create table public.visit_reviews (
  id         bigint generated always as identity primary key,
  plan_id    bigint      not null unique
                         references public.visit_plans (id) on delete cascade,
  user_id    uuid        not null
                         references auth.users (id) on delete cascade,
  rating     smallint    not null check (rating between 1 and 5),
  comment    text        null check (comment is null or char_length(comment) between 1 and 200),
  created_at timestamptz not null default now()
);

-- RLS の「自分のレビューだけ」用
create index visit_reviews_user_id_idx on public.visit_reviews (user_id);

alter table public.visit_reviews enable row level security;

-- 書き込みの権限は誰にも渡さない(submit_review だけが書く)。読み取りは authenticated の自分の行だけ
revoke all on public.visit_reviews from anon, authenticated;
grant select on public.visit_reviews to authenticated;

create policy "visit_reviews_select_own" on public.visit_reviews
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. submit_review
-- ---------------------------------------------------------------------------
create or replace function public.submit_review(p_plan_id bigint, p_rating integer, p_comment text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_plan    record;
  v_comment text;
  v_id      bigint;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  if p_rating is null or p_rating not between 1 and 5 then
    return 'invalid_rating';
  end if;

  -- 前後の空白・タブ・改行・全角スペースを除く。空なら null(星だけ)
  v_comment := nullif(btrim(p_comment, E' \t\r\n　'), '');
  if char_length(v_comment) > 200 then
    return 'too_long';
  end if;

  select id, visited_at
    into v_plan
    from public.visit_plans
   where id = p_plan_id and user_id = v_uid;
  if not found then
    return 'not_found';
  end if;

  if v_plan.visited_at is null then
    return 'not_visited';
  end if;

  -- 同時に2回送られても、plan_id の unique で1件しか入らない
  insert into public.visit_reviews (plan_id, user_id, rating, comment)
  values (v_plan.id, v_uid, p_rating, v_comment)
  on conflict (plan_id) do nothing
  returning id into v_id;

  if v_id is null then
    return 'already';
  end if;
  return 'ok';
end
$$;

revoke all on function public.submit_review(bigint, integer, text) from public, anon;
grant execute on function public.submit_review(bigint, integer, text) to authenticated;

commit;
