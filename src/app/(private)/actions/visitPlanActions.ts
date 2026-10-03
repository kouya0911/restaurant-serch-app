"use server"

import { isValidVisitDate } from "@/lib/calendar/google-calendar-url"
import { todayInJst } from "@/lib/calendar/visit-date"
import { isValidVisitHour, visitSlotStartMs } from "@/lib/calendar/visit-hours"
import { VisitCrowdCount, VisitPlan } from "@/types"
import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

// visit_plans は database.types.ts に未反映(手書き VisitPlan 型で扱う)ため、
// 既存の favorites と同じく .from("visit_plans" as any) でアクセスする。
const TABLE = "visit_plans" as any
// review: 自分のレビュー(visit_reviews, docs/sql/006_visit_reviews.sql)を埋め込む。RLS で自分の分しか見えない
const COLUMNS =
  "id, user_id, place_id, restaurant_name, visit_date, visit_hour, visited_at, created_at, review:visit_reviews(rating, comment)"
const MAX_NAME_LENGTH = 200
const UNIQUE_VIOLATION = "23505"
const PERMISSION_DENIED = "42501"

// plan_id は unique なので PostgREST は1件(オブジェクト)か null で返すが、
// 配列で返ってきた場合(1対多と判定された場合)も同じ形にそろえる
function toVisitPlan(row: any): VisitPlan {
  const review = Array.isArray(row.review) ? row.review[0] ?? null : row.review ?? null
  return { ...row, review } as VisitPlan
}

type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? {} : { data: T }))
  | { success: false; message: string }

async function getAuthedUser() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return { supabase, user: null }
  return { supabase, user: data.user }
}

export async function listVisitPlansAction(): Promise<ActionResult<VisitPlan[]>> {
  try {
    const { supabase, user } = await getAuthedUser()
    if (!user) return { success: false, message: "AUTH_REQUIRED" }

    const { data, error } = await supabase
      .from(TABLE)
      .select(COLUMNS)
      .eq("user_id", user.id)
      // 日付の早い順 → 時間帯の早い順(時間未定は最後) → 新しく登録した順(登録直後の予定がサイドバーの先頭5件に入るように)
      .order("visit_date", { ascending: true })
      .order("visit_hour", { ascending: true, nullsFirst: false })
      .order("id", { ascending: false })

    if (error) {
      console.error("[listVisitPlansAction] select error:", error.message)
      return { success: false, message: `予定の取得に失敗しました: ${error.message}` }
    }
    return { success: true, data: (data ?? []).map(toVisitPlan) }
  } catch (err: any) {
    console.error("[listVisitPlansAction] UNEXPECTED CRASH:", err)
    return { success: false, message: `予期せぬエラー: ${err.message || "Unknown"}` }
  }
}

// 登録・変更で共通の、日付と時間帯の入力チェック。問題なければ null
function validateVisitSlot(visitDate: string, visitHour: number): string | null {
  if (!isValidVisitDate(visitDate)) return "日付の形式が正しくありません"
  if (visitDate < todayInJst()) return "過去の日付は登録できません"
  if (!isValidVisitHour(visitHour)) return "行く時間帯を選んでください"
  if (visitSlotStartMs(visitDate, visitHour) < Date.now()) return "すでに始まった時間帯は選べません"
  return null
}

export async function addVisitPlanAction(input: {
  placeId: string
  restaurantName: string
  visitDate: string // "YYYY-MM-DD"
  visitHour: number // 10〜23(日本時間の「〇時台」)
}): Promise<ActionResult<VisitPlan>> {
  try {
    const placeId = input.placeId?.trim()
    const restaurantName = input.restaurantName?.trim()

    if (!placeId) return { success: false, message: "店舗IDがありません" }
    if (!restaurantName || restaurantName.length > MAX_NAME_LENGTH) {
      return { success: false, message: "店名が正しくありません" }
    }
    const slotError = validateVisitSlot(input.visitDate, input.visitHour)
    if (slotError) return { success: false, message: slotError }

    const { supabase, user } = await getAuthedUser()
    if (!user) return { success: false, message: "AUTH_REQUIRED" }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        user_id: user.id,
        place_id: placeId,
        restaurant_name: restaurantName,
        visit_date: input.visitDate,
        visit_hour: input.visitHour,
      })
      .select(COLUMNS)
      .single()

    if (error || !data) {
      if (error?.code === UNIQUE_VIOLATION) {
        return { success: false, message: "この店はその日にすでに登録されています" }
      }
      console.error("[addVisitPlanAction] insert error:", error?.message)
      return { success: false, message: `予定の登録に失敗しました: ${error?.message || "unknown"}` }
    }

    revalidatePath("/calendar")
    return { success: true, data: toVisitPlan(data) }
  } catch (err: any) {
    console.error("[addVisitPlanAction] UNEXPECTED CRASH:", err)
    return { success: false, message: `予期せぬエラー: ${err.message || "Unknown"}` }
  }
}

export async function deleteVisitPlanAction(id: number): Promise<ActionResult> {
  try {
    if (!Number.isInteger(id)) return { success: false, message: "IDが正しくありません" }

    const { supabase, user } = await getAuthedUser()
    if (!user) return { success: false, message: "AUTH_REQUIRED" }

    // RLSに加えて user_id も条件に入れる(deleteAddressAction と同じ二重防御)
    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")

    if (error) {
      console.error("[deleteVisitPlanAction] delete error:", error.message)
      return { success: false, message: `予定の削除に失敗しました: ${error.message}` }
    }
    if (!data || data.length === 0) {
      // 0行の理由は「存在しない」か「来店認証済み(RLSで削除不可)」。後者なら専用メッセージにする
      const { data: existing } = await supabase
        .from(TABLE)
        .select("visited_at")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle()
      if (existing && (existing as any).visited_at) {
        return { success: false, message: "来店済みの予定は削除できません" }
      }
      return { success: false, message: "予定が見つかりませんでした" }
    }

    revalidatePath("/calendar")
    return { success: true }
  } catch (err: any) {
    console.error("[deleteVisitPlanAction] UNEXPECTED CRASH:", err)
    return { success: false, message: `予期せぬエラー: ${err.message || "Unknown"}` }
  }
}

// update_visit_plan() (DB関数, docs/sql/009_update_visit_plan.sql) の戻り値 → 利用者向けメッセージ
const UPDATE_ERROR_MESSAGES: Record<string, string> = {
  invalid_date: "日付の形式が正しくありません",
  invalid_hour: "行く時間帯を選んでください",
  not_found: "予定が見つかりませんでした",
  already_visited: "来店済みの予定は変更できません",
  past_slot: "すでに始まった時間帯は選べません",
  duplicate: "この店はその日にすでに登録されています",
}

/**
 * 予定の日付・時間帯の変更。visit_plans は直接 update できないため DB 関数経由で行う。
 * created_at(最初に宣言した時刻)は変わらないので、来店認証の「1時間前まで」はその時刻で判定される。
 */
export async function updateVisitPlanAction(input: {
  id: number
  visitDate: string // "YYYY-MM-DD"
  visitHour: number // 10〜23
}): Promise<ActionResult<VisitPlan>> {
  try {
    if (!Number.isInteger(input.id)) return { success: false, message: "IDが正しくありません" }
    const slotError = validateVisitSlot(input.visitDate, input.visitHour)
    if (slotError) return { success: false, message: slotError }

    const { supabase, user } = await getAuthedUser()
    if (!user) return { success: false, message: "AUTH_REQUIRED" }

    // update_visit_plan は database.types.ts に未反映のため、verify_visit と同様に型を回避して呼ぶ
    const { data, error } = await (supabase as any).rpc("update_visit_plan", {
      p_plan_id: input.id,
      p_visit_date: input.visitDate,
      p_visit_hour: input.visitHour,
    })

    if (error) {
      console.error("[updateVisitPlanAction] rpc error:", error.message)
      return { success: false, message: `予定の変更に失敗しました: ${error.message}` }
    }
    if (data === "not_authenticated") return { success: false, message: "AUTH_REQUIRED" }
    if (data !== "ok") {
      const message = typeof data === "string" ? UPDATE_ERROR_MESSAGES[data] : undefined
      if (!message) {
        console.error("[updateVisitPlanAction] unexpected result:", data)
        return { success: false, message: "予定の変更に失敗しました" }
      }
      return { success: false, message }
    }

    // 変更後の予定を返す(画面の「変更しました（日付 時間帯）」に使う)
    const { data: row, error: selectError } = await supabase
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", input.id)
      .eq("user_id", user.id)
      .single()
    if (selectError || !row) {
      console.error("[updateVisitPlanAction] select error:", selectError?.message)
      return { success: false, message: "予定は変更しましたが、表示の更新に失敗しました" }
    }

    revalidatePath("/calendar")
    return { success: true, data: toVisitPlan(row) }
  } catch (err: any) {
    console.error("[updateVisitPlanAction] UNEXPECTED CRASH:", err)
    return { success: false, message: `予期せぬエラー: ${err.message || "Unknown"}` }
  }
}

// verify_visit() (DB関数, docs/sql/008_visit_hours.sql。003 を置き換え) の戻り値 → 利用者向けメッセージ
const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  wrong_code: "認証コードが違います",
  not_today: "来店の認証ができるのは、予定の日当日だけです",
  already: "この予定はすでに来店を認証済みです",
  no_store: "この店はまだ来店認証に対応していません",
  not_found: "予定が見つかりませんでした",
  too_early: "来店の認証は、予定の時間帯が始まる15分前からできます",
  late_declaration: "予定の時間帯が始まる1時間前までに宣言した予定だけ、来店を認証できます",
  expired: "来店の認証は、予定の時間帯が始まってから3時間後までです",
}
const MAX_CODE_LENGTH = 32

/**
 * 「行ったよ」の来店認証。コードの照合はDB関数の中だけで行い、正しいコードはブラウザにも
 * このサーバーにも渡らない(入力されたコードをDBへ送るだけ)。visited_at の書き込みも関数のみが行う。
 */
export async function verifyVisitAction(planId: number, code: string): Promise<ActionResult> {
  try {
    if (!Number.isInteger(planId)) return { success: false, message: "IDが正しくありません" }

    // 全角数字や前後の空白を吸収する(スマホで全角入力になっていても通す)
    const normalized = (code ?? "").normalize("NFKC").trim()
    if (!normalized) return { success: false, message: "認証コードを入力してください" }
    if (normalized.length > MAX_CODE_LENGTH) return { success: false, message: "認証コードが長すぎます" }

    const { supabase, user } = await getAuthedUser()
    if (!user) return { success: false, message: "AUTH_REQUIRED" }

    // verify_visit は database.types.ts に未反映のため、テーブルと同様に型を回避して呼ぶ
    const { data, error } = await (supabase as any).rpc("verify_visit", {
      p_plan_id: planId,
      p_code: normalized,
    })

    if (error) {
      console.error("[verifyVisitAction] rpc error:", error.message)
      return { success: false, message: `来店の認証に失敗しました: ${error.message}` }
    }

    if (data === "ok") {
      revalidatePath("/calendar")
      return { success: true }
    }
    if (data === "not_authenticated") return { success: false, message: "AUTH_REQUIRED" }

    const message = typeof data === "string" ? VERIFY_ERROR_MESSAGES[data] : undefined
    if (!message) {
      console.error("[verifyVisitAction] unexpected result:", data)
      return { success: false, message: "来店の認証に失敗しました" }
    }
    return { success: false, message }
  } catch (err: any) {
    console.error("[verifyVisitAction] UNEXPECTED CRASH:", err)
    return { success: false, message: `予期せぬエラー: ${err.message || "Unknown"}` }
  }
}

// submit_review() (DB関数, docs/sql/006_visit_reviews.sql) の戻り値 → 利用者向けメッセージ
const REVIEW_ERROR_MESSAGES: Record<string, string> = {
  invalid_rating: "星を1〜5で選んでください",
  too_long: "ひとことは200文字以内で入力してください",
  not_found: "予定が見つかりませんでした",
  not_visited: "レビューを書けるのは、来店を認証した予定だけです",
  already: "この予定にはすでにレビューを書いています",
}
const MAX_COMMENT_LENGTH = 200

/**
 * 来店後のレビュー(星1〜5・ひとこと任意)。「自分の予定か」「来店認証済みか」「1件目か」は
 * DB関数の中で確かめる(テーブルへの直接の書き込みは DB 側で禁止している)。
 */
export async function submitReviewAction(
  planId: number,
  rating: number,
  comment: string | null
): Promise<ActionResult> {
  try {
    if (!Number.isInteger(planId)) return { success: false, message: "IDが正しくありません" }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { success: false, message: REVIEW_ERROR_MESSAGES.invalid_rating }
    }

    // 前後の空白・改行を除く。空なら星だけのレビュー。文字数は DB の char_length と同じコードポイント単位
    const trimmed = (comment ?? "").trim()
    if ([...trimmed].length > MAX_COMMENT_LENGTH) {
      return { success: false, message: REVIEW_ERROR_MESSAGES.too_long }
    }

    const { supabase, user } = await getAuthedUser()
    if (!user) return { success: false, message: "AUTH_REQUIRED" }

    // submit_review は database.types.ts に未反映のため、verify_visit と同様に型を回避して呼ぶ
    const { data, error } = await (supabase as any).rpc("submit_review", {
      p_plan_id: planId,
      p_rating: rating,
      p_comment: trimmed || null,
    })

    if (error) {
      console.error("[submitReviewAction] rpc error:", error.message)
      return { success: false, message: `レビューの送信に失敗しました: ${error.message}` }
    }

    if (data === "ok") {
      revalidatePath("/calendar")
      return { success: true }
    }
    if (data === "not_authenticated") return { success: false, message: "AUTH_REQUIRED" }

    const message = typeof data === "string" ? REVIEW_ERROR_MESSAGES[data] : undefined
    if (!message) {
      console.error("[submitReviewAction] unexpected result:", data)
      return { success: false, message: "レビューの送信に失敗しました" }
    }
    return { success: false, message }
  } catch (err: any) {
    console.error("[submitReviewAction] UNEXPECTED CRASH:", err)
    return { success: false, message: `予期せぬエラー: ${err.message || "Unknown"}` }
  }
}

// visit_plan_counts() が受け付ける店の数の上限(docs/sql/010_visit_plan_counts.sql と同じ)
const MAX_CROWD_PLACES = 100

/**
 * 混雑表示: 表示中の店の、指定日の時間帯ごとの「行く予定の人数」を1回でまとめて取る。
 * 人数しか返らない(誰が宣言したかは DB 関数が返さない)。
 * ここではログインを確かめない。呼べるかどうかは DB の実行権限だけで決まるので、
 * ログインなしに解禁するときは DB で grant を1行実行するだけでよい。
 * 権限がない(未ログインで未解禁)ときは、エラーにせず「0件」として返す(画面には何も出ない)。
 */
export async function getVisitCrowdAction(
  placeIds: string[],
  visitDate: string // "YYYY-MM-DD"(日本時間)
): Promise<ActionResult<VisitCrowdCount[]>> {
  try {
    if (!isValidVisitDate(visitDate)) return { success: false, message: "日付の形式が正しくありません" }
    const ids = Array.from(
      new Set((Array.isArray(placeIds) ? placeIds : []).filter((id) => typeof id === "string" && id.length > 0))
    ).slice(0, MAX_CROWD_PLACES)
    if (ids.length === 0) return { success: true, data: [] }

    const supabase = await createClient()
    // visit_plan_counts は database.types.ts に未反映のため、verify_visit と同様に型を回避して呼ぶ
    const { data, error } = await (supabase as any).rpc("visit_plan_counts", {
      p_place_ids: ids,
      p_date: visitDate,
    })

    if (error) {
      if (error.code === PERMISSION_DENIED) return { success: true, data: [] }
      console.error("[getVisitCrowdAction] rpc error:", error.message)
      return { success: false, message: `混雑の取得に失敗しました: ${error.message}` }
    }
    return { success: true, data: (data ?? []) as VisitCrowdCount[] }
  } catch (err: any) {
    console.error("[getVisitCrowdAction] UNEXPECTED CRASH:", err)
    return { success: false, message: `予期せぬエラー: ${err.message || "Unknown"}` }
  }
}
