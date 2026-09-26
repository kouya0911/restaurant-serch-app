"use server"

import { isValidVisitDate } from "@/lib/calendar/google-calendar-url"
import { todayInJst } from "@/lib/calendar/visit-date"
import { VisitPlan } from "@/types"
import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

// visit_plans は database.types.ts に未反映(手書き VisitPlan 型で扱う)ため、
// 既存の favorites と同じく .from("visit_plans" as any) でアクセスする。
const TABLE = "visit_plans" as any
const COLUMNS = "id, user_id, place_id, restaurant_name, visit_date, visited_at, created_at"
const MAX_NAME_LENGTH = 200
const UNIQUE_VIOLATION = "23505"

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
      .order("visit_date", { ascending: true })
      .order("id", { ascending: true })

    if (error) {
      console.error("[listVisitPlansAction] select error:", error.message)
      return { success: false, message: `予定の取得に失敗しました: ${error.message}` }
    }
    return { success: true, data: (data ?? []) as unknown as VisitPlan[] }
  } catch (err: any) {
    console.error("[listVisitPlansAction] UNEXPECTED CRASH:", err)
    return { success: false, message: `予期せぬエラー: ${err.message || "Unknown"}` }
  }
}

export async function addVisitPlanAction(input: {
  placeId: string
  restaurantName: string
  visitDate: string // "YYYY-MM-DD"
}): Promise<ActionResult<VisitPlan>> {
  try {
    const placeId = input.placeId?.trim()
    const restaurantName = input.restaurantName?.trim()

    if (!placeId) return { success: false, message: "店舗IDがありません" }
    if (!restaurantName || restaurantName.length > MAX_NAME_LENGTH) {
      return { success: false, message: "店名が正しくありません" }
    }
    if (!isValidVisitDate(input.visitDate)) {
      return { success: false, message: "日付の形式が正しくありません" }
    }
    if (input.visitDate < todayInJst()) {
      return { success: false, message: "過去の日付は登録できません" }
    }

    const { supabase, user } = await getAuthedUser()
    if (!user) return { success: false, message: "AUTH_REQUIRED" }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        user_id: user.id,
        place_id: placeId,
        restaurant_name: restaurantName,
        visit_date: input.visitDate,
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
    return { success: true, data: data as unknown as VisitPlan }
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

// verify_visit() (DB関数, docs/sql/003_verify_visit.sql) の戻り値 → 利用者向けメッセージ
const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  wrong_code: "認証コードが違います",
  not_today: "来店の認証ができるのは、予定の日当日だけです",
  already: "この予定はすでに来店を認証済みです",
  no_store: "この店はまだ来店認証に対応していません",
  not_found: "予定が見つかりませんでした",
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
