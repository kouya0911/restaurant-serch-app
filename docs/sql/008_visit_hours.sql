-- 008_visit_hours: 「行く時間帯」の列と、来店認証ルールの変更 (feature/visit-hours ステップ1)
-- 実行場所: Supabase Dashboard > SQL Editor。何度実行しても同じ結果になる(列は if not exists、関数は create or replace)。
-- 前提: 001〜003 が実行済みであること。
-- 注意: このあとで 003_verify_visit.sql を再実行すると、verify_visit が古いルールに戻る。再実行しないこと。
--
-- 【変更点】
-- 1. visit_plans.visit_hour(日本時間の「〇時台」の〇。0〜23)を追加する。
--    既存の予定は null のまま = 「時間未定」。書き換えはしない。
--    insert の列の許可に visit_hour を足す(visited_at / created_at は今までどおり指定不可)。
--    「新規の宣言で時間未定を禁止する」締め直しは、アプリを反映した後の 011 で行う
--    (ここで締めると、反映前の古いアプリから宣言できなくなるため)。
-- 2. 時間帯の始まりを求める visit_slot_start() と、時刻のルールだけを判定する visit_time_check() を作る。
--    visit_time_check は now() を引数で受け取るので、テストで境界ちょうどの時刻を確かめられる。
-- 3. verify_visit を置き換える。引数の型は同じなので、003 で付けた実行権限はそのまま残る。
--
-- 【来店認証のルール】(時間帯がある予定)
--   start = 予定の時間帯の始まり(日本時間。23時台なら翌日 02:00 まで認証できる)
--   late_declaration  最初に宣言した時刻(created_at)が start の1時間前より後(ちょうど1時間前は OK)
--   too_early         今が start の15分前より前(ちょうど15分前は OK)
--   expired           今が start の3時間後より後(ちょうど3時間後は OK)
--   判定の順: already → late_declaration → too_early → expired → no_store → wrong_code
--   (late_declaration は後から変えられない理由なので、時刻の判定より先に返す)
--   時間未定の予定(visit_hour が null)は今までどおり: not_today → already → no_store → wrong_code
--
-- 【verify_visit の戻り値】(text) 003 のものに3つ追加
--   ok / not_authenticated / not_found / not_today / already / no_store / wrong_code
--   late_declaration  予定の時間の1時間前までに宣言していない
--   too_early         まだ認証できる時間ではない(時間帯の始まりの15分前から)
--   expired           認証できる時間を過ぎた(時間帯の始まりから3時間後まで)

begin;

-- ---------------------------------------------------------------------------
-- 1. visit_hour 列と insert の許可
-- ---------------------------------------------------------------------------
alter table public.visit_plans
  add column if not exists visit_hour smallint null
    constraint visit_plans_visit_hour_check check (visit_hour between 0 and 23);

grant insert (visit_hour) on public.visit_plans to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 時間帯の始まり / 時刻のルール
-- ---------------------------------------------------------------------------
-- (日付, 時) → その時間帯の始まり(日本時間として解釈した timestamptz)。時が null なら null
create or replace function public.visit_slot_start(p_date date, p_hour smallint)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_date + make_interval(hours => p_hour)) at time zone 'Asia/Tokyo'
$$;

-- 時刻のルールだけを判定する。通るなら null、通らないなら理由のコード
create or replace function public.visit_time_check(
  p_created_at timestamptz,  -- 最初に宣言した時刻
  p_slot_start timestamptz,  -- 予定の時間帯の始まり
  p_at         timestamptz   -- 今(verify_visit からは now())
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_created_at > p_slot_start - interval '1 hour'    then 'late_declaration'
    when p_at         < p_slot_start - interval '15 minutes' then 'too_early'
    when p_at         > p_slot_start + interval '3 hours'    then 'expired'
  end
$$;

revoke all on function public.visit_slot_start(date, smallint) from public, anon;
grant execute on function public.visit_slot_start(date, smallint) to authenticated;
revoke all on function public.visit_time_check(timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.visit_time_check(timestamptz, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. verify_visit(003 の置き換え)
-- ---------------------------------------------------------------------------
create or replace function public.verify_visit(p_plan_id bigint, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_plan  record;
  v_code  text;
  v_check text;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  -- 同じ予定を同時に2回押されても二重に通らないよう、行をロックして読む
  select id, place_id, visit_date, visit_hour, visited_at, created_at
    into v_plan
    from public.visit_plans
   where id = p_plan_id and user_id = v_uid
     for update;
  if not found then
    return 'not_found';
  end if;

  if v_plan.visit_hour is null then
    -- 時間未定(008 より前に登録された予定): 今までどおり、予定の当日(日本時間)なら認証できる
    if v_plan.visit_date <> (now() at time zone 'Asia/Tokyo')::date then
      return 'not_today';
    end if;
    if v_plan.visited_at is not null then
      return 'already';
    end if;
  else
    if v_plan.visited_at is not null then
      return 'already';
    end if;
    v_check := public.visit_time_check(
      v_plan.created_at,
      public.visit_slot_start(v_plan.visit_date, v_plan.visit_hour),
      now());
    if v_check is not null then
      return v_check;
    end if;
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

-- create or replace では権限は変わらないが、単独で読んでも分かるように 003 と同じ指定を書いておく
revoke all on function public.verify_visit(bigint, text) from public, anon;
grant execute on function public.verify_visit(bigint, text) to authenticated;

commit;
