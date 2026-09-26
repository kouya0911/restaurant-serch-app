-- 003_verify_visit: 「行ったよ」来店認証の関数 (feature/visit-plans 来店認証フェーズ ステップ2)
-- 実行場所: Supabase Dashboard > SQL Editor。create or replace なので再実行しても良い。
-- 前提: 002_stores.sql が実行済みであること。
--
-- 【設計】
-- ・認証コードは stores にあり、利用者(authenticated)は stores を読めない。
--   この関数は SECURITY DEFINER(作成者権限で動く)なので stores を読めて、
--   visit_plans.visited_at も書ける(利用者は直接書けない: 002 で塞いだ)。
-- ・コードは関数の中で照合するだけで、戻り値には含めない(ブラウザへ出ない)。
-- ・呼べるのはログイン済み(authenticated)のみ。本人の予定しか対象にならない。
-- ・search_path を空にして、関数内のオブジェクトはすべてスキーマ付きで参照する
--   (SECURITY DEFINER 関数の定石。なりすましのテーブルを差し込まれないため)。
--
-- 【戻り値】(text)
--   ok                認証できた(visited_at を記録した)
--   not_authenticated ログインしていない
--   not_found         その予定が無い、または自分の予定ではない
--   not_today         予定日が今日(日本時間)ではない(過去・未来とも)
--   already           すでに認証済み(2回目は不可)
--   no_store          その店が stores に登録されていない
--   wrong_code        認証コードが違う

create or replace function public.verify_visit(p_plan_id bigint, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan record;
  v_code text;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  -- 同じ予定を同時に2回押されても二重に通らないよう、行をロックして読む
  select id, place_id, visit_date, visited_at
    into v_plan
    from public.visit_plans
   where id = p_plan_id and user_id = v_uid
     for update;
  if not found then
    return 'not_found';
  end if;

  -- 認証できるのは予定の当日のみ(日本時間)
  if v_plan.visit_date <> (now() at time zone 'Asia/Tokyo')::date then
    return 'not_today';
  end if;

  if v_plan.visited_at is not null then
    return 'already';
  end if;

  select s.verify_code into v_code
    from public.stores s
   where s.place_id = v_plan.place_id;
  if not found then
    return 'no_store';
  end if;

  if p_code is null or p_code <> v_code then
    return 'wrong_code';
  end if;

  update public.visit_plans set visited_at = now() where id = v_plan.id;
  return 'ok';
end
$$;

-- 既定では誰でも実行できてしまうので、いったん全員から外して authenticated だけに付ける
revoke all on function public.verify_visit(bigint, text) from public, anon;
grant execute on function public.verify_visit(bigint, text) to authenticated;
