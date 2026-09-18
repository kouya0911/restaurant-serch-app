"use server"

import { getPlaceDetails } from "@/lib/restaurants/api"

// ドコいく道案内の出発地選択専用。既存の selectSuggestionAction と違い、
// 座標を取得するだけでSupabaseの addresses テーブルへの保存は行わない
// （道案内の出発地検索のたびに保存済み住所が増えてしまうのを避けるため）
export async function resolvePlaceLocationAction(placeId: string, sessionToken?: string) {
  return getPlaceDetails(placeId, ["location"], sessionToken)
}
