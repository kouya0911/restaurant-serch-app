// 店長ページ用: DB関数 store_stats(docs/sql/004_store_stats.sql) を呼ぶサーバー側ヘルパー。
// 店長ページはログインなしで開くため、cookie/セッションを使わない素の anon クライアントで呼ぶ。
// (トークンを知っている人だけが結果を得られる。マスク処理も DB 関数の中で済んでいる)

import { createClient } from "@supabase/supabase-js"

export interface StoreStatsDay {
  date: string // "YYYY-MM-DD"
  planned: number | null // 人数が少なく伏せられたら null
  planned_masked: boolean
  visited: number | null
  visited_masked: boolean
  rate: number | null // 来店率(%)。伏せる場合・予定0人の場合は null
}

export interface StoreStats {
  store: { name: string; verify_code: string }
  min_display_count: number
  today: string // 日本時間の今日
  upcoming: StoreStatsDay[] // 今日〜13日後(昇順)
  past: StoreStatsDay[] // 昨日〜14日前で予定があった日(降順)
}

// owner_token は英数字64文字。明らかに違う形の入力は DB に問い合わせず弾く
export function isPlausibleToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token)
}

export type StoreStatsResult =
  | { ok: true; data: StoreStats | null } // data が null = トークンが無効
  | { ok: false; message: string }

export async function getStoreStats(token: string): Promise<StoreStatsResult> {
  if (!isPlausibleToken(token)) return { ok: true, data: null }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return { ok: false, message: "Supabase の環境変数が設定されていません" }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc("store_stats", { p_token: token })
  if (error) {
    console.error("[getStoreStats] rpc error:", error.message)
    return { ok: false, message: "集計を取得できませんでした" }
  }
  return { ok: true, data: (data ?? null) as StoreStats | null }
}
