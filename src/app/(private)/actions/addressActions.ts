"use server"

import { getPlaceDetails } from "@/lib/restaurants/api";
import { AddressSuggestion } from "@/types";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function selectSuggestionAction(suggestion: AddressSuggestion, sessionToken: string) {
  const supabase = await createClient();
  console.log(`[selectSuggestionAction] Starting for placeId: ${suggestion.placeId}`);

  const { data: locationData, error } = await getPlaceDetails(
    suggestion.placeId,
    ["location"],
    sessionToken)

  if (error || !locationData || !locationData.location) {
    console.error("[selectSuggestionAction] getPlaceDetails error:", error, locationData);
    throw new Error("住所情報を取得できませんでした")
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("[selectSuggestionAction] Auth error:", userError?.message);
    redirect("/login");
  }

  const lat = locationData.location.latitude;
  const lng = locationData.location.longitude;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    console.error("[selectSuggestionAction] Lat/Lng not numbers:", lat, lng);
    throw new Error("緯度経度が取得できませんでした")
  }

  console.log(`[selectSuggestionAction] Inserting new address: ${suggestion.placeName} (${lat}, ${lng})`);

  const { data: newAddress, error: inserterror } = await supabase.from("addresses").insert({
    name: suggestion.placeName,
    address_text: suggestion.address_text,
    latitude: lat,
    longitude: lng,
    user_id: user.id,
  }).select("id").single();

  if (inserterror || !newAddress) {
    console.error("[selectSuggestionAction] Address insert error:", inserterror?.message);
    throw new Error("住所の保存に失敗しました")
  }

  console.log(`[selectSuggestionAction] Upserting profile selected_address_id to: ${newAddress.id}`);
  const { error: updateError } = await supabase.from("profiles").upsert({
    id: user.id,
    selected_address_id: newAddress.id,
  })

  if (updateError) {
    console.error("[selectSuggestionAction] Profile upsert error:", updateError.message);
    throw new Error("プロフィールの更新に失敗しました")
  }

  console.log("[selectSuggestionAction] Success. Revalidating path...");
  revalidatePath("/", "layout");
}

export async function selectAddressAction(addressId: number) {
  const supabase = await createClient();
  console.log(`[selectAddressAction] Starting for addressId: ${addressId}`);

  // get user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  // 所有者チェック
  const { data: addrData, error: addrError } = await supabase
    .from("addresses")
    .select("id, user_id")
    .eq("id", addressId)
    .single();

  if (addrError || !addrData) {
    console.error("[selectAddressAction] Address not found or error:", addrError?.message);
    throw new Error("指定された住所が見つかりませんでした");
  }

  if (addrData.user_id !== user.id) {
    console.error("[selectAddressAction] Ownership mismatch. User:", user.id, "Owner:", addrData.user_id);
    throw new Error("この住所を選択する権限がありません");
  }

  // プロフィールの selected_address_id を更新 (upsert)
  console.log(`[selectAddressAction] Upserting profile selected_address_id to: ${addressId}`);
  const { error: updateError } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      selected_address_id: addressId
    });

  if (updateError) {
    console.error("[selectAddressAction] Profile upsert error:", updateError.message);
    throw new Error("プロフィールの更新に失敗しました");
  }

  console.log("[selectAddressAction] Success. Revalidating path...");
  revalidatePath("/", "layout");
  return true;
}

export async function deleteAddressAction(addressId: number) {
  const supabase = await createClient();

  // get user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("addresses")
    .delete()
    .eq('id', addressId)
    .eq('user_id', user.id)

  if (error) {
    throw new Error("error")
  }

  revalidatePath("/", "layout");
}