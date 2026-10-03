-- 009_update_visit_plan: 予定の日付・時間帯の変更 (feature/visit-hours ステップ2)
-- 実行場所: Supabase Dashboard > SQL Editor。create or replace なので再実行しても良い。
-- 前提: 008_visit_hours.sql が実行済みであること。
--
-- 【設計】
-- ・visit_plans は 002 で利用者の update を全面禁止している。変更はこの関数(SECURITY DEFINER)からだけ。
-- ・変えられるのは visit_date と visit_hour だけ。店(place_id)・created_at・visited_at には触れない。
--   → 来店認証の「1時間前までに宣言」は、変更しても最初に宣言した時刻(created_at)で判定される。
-- ・来店認証済みの予定は変更できない。認証と同時に変更されないよう、行をロックして読む。
-- ・時間未定(visit_hour = null)には戻せない(戻すと、当日ならいつでも認証できる旧ルールになるため)。
--   時間未定の既存の予定も、日付と時間帯を指定すれば変更できる(以後は時間帯ありの予定になる)。
-- ・「この時間だと来店認証ができません」の注意は、保存を止めないのでここでは判定しない(画面側で出す)。
-- ・時の範囲は列の制約と同じ 0〜23。画面のボタン(10〜23時台)より広いが、DB は列の範囲だけを守る。
--
-- 【戻り値】(text) 判定の順
--   not_authenticated ログインしていない
--   invalid_date      日付が null
--   invalid_hour      時が null、または 0〜23 でない
--   not_found         その予定が無い、または自分の予定ではない
--   already_visited   来店認証済みの予定(変更不可)
--   past_slot         変更後の時間帯の始まりが、もう過ぎている(日本時間)
--   duplicate         同じ店・同じ日の予定がすでにある(visit_plans_user_place_date_key)
--   ok                変更した(同じ日付・時間帯への「変更」も ok)

create or replace function public.update_visit_plan(p_plan_id bigint, p_visit_date date, p_visit_hour smallint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan record;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  if p_visit_date is null then
    return 'invalid_date';
  end if;
  if p_visit_hour is null or p_visit_hour not between 0 and 23 then
    return 'invalid_hour';
  end if;

  select id, visited_at
    into v_plan
    from public.visit_plans
   where id = p_plan_id and user_id = v_uid
     for update;
  if not found then
    return 'not_found';
  end if;

  if v_plan.visited_at is not null then
    return 'already_visited';
  end if;

  if public.visit_slot_start(p_visit_date, p_visit_hour) < now() then
    return 'past_slot';
  end if;

  begin
    update public.visit_plans
       set visit_date = p_visit_date,
           visit_hour = p_visit_hour
     where id = v_plan.id;
  exception when unique_violation then
    return 'duplicate';
  end;

  return 'ok';
end
$$;

revoke all on function public.update_visit_plan(bigint, date, smallint) from public, anon;
grant execute on function public.update_visit_plan(bigint, date, smallint) to authenticated;
