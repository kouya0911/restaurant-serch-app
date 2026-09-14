"use server"

import { getPlaceDetails } from "@/lib/restaurants/api"

export async function getRestaurantDetailsAction(placeId: string) {
  return getPlaceDetails(placeId, ["priceLevel", "regularOpeningHours"])
}
