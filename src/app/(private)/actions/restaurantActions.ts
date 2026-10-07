"use server"

import { getPlaceDetails } from "@/lib/restaurants/api"
import { createClient } from "@/utils/supabase/server"

export async function getRestaurantDetailsAction(placeId: string) {
  // Google(有料)を呼ぶ前にログインを確かめる
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return { error: "AUTH_REQUIRED" }

  return getPlaceDetails(placeId, ["priceLevel", "regularOpeningHours"])
}
