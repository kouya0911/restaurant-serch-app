// 店長ページ用: DB関数 store_reviews(docs/sql/007_store_reviews.sql) を呼ぶサーバー側ヘルパー。
// stats.ts と同じく、cookie/セッションを使わない素の anon クライアントで呼ぶ。
// (トークンを知っている人だけが結果を得られる。書いた人の情報は DB 関数が返さない)

import { createClient } from "@supabase/supabase-js"
import { isPlausibleToken } from "@/lib/store/stats"

export interface StoreReview {
  rating: number // 1〜5
  comment: string | null // 星だけなら null
}

export interface StoreReviews {
  count: number
  average: number | null // 小数第1位。0件なら null
  recent: StoreReview[] // 新しい順に最大10件
}

export type StoreReviewsResult =
  | { ok: true; data: StoreReviews | null } // data が null = トークンが無効
  | { ok: false; message: string }

export async function getStoreReviews(token: string): Promise<StoreReviewsResult> {
  if (!isPlausibleToken(token)) return { ok: true, data: null }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return { ok: false, message: "Supabase の環境変数が設定されていません" }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc("store_reviews", { p_token: token })
  if (error) {
    console.error("[getStoreReviews] rpc error:", error.message)
    return { ok: false, message: "レビューを取得できませんでした" }
  }
  return { ok: true, data: (data ?? null) as StoreReviews | null }
}
