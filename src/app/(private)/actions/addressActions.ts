"use server"

import { getPlaceDetails } from "@/lib/restaurants/api";
import { AddressSuggestion } from "@/types";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

// 画面に出すエラー文。DB のエラー文などの詳細はサーバーのログ(console.error)にだけ残す
const SAVE_ERROR = "住所を保存できませんでした。もう一度お試しください。";
const SELECT_ERROR = "住所を選択できませんでした。もう一度お試しください。";
const DELETE_ERROR = "住所を削除できませんでした。もう一度お試しください。";

export async function selectSuggestionAction(suggestion: AddressSuggestion, sessionToken: string) {
  try {
    const supabase = await createClient();
    console.log(`[selectSuggestionAction] Starting for placeId: ${suggestion.placeId}`);

    // Google(有料)を呼ぶ前にログインを確かめる
    const { data, error: userError } = await supabase.auth.getUser();
    const user = data?.user;

    if (userError || !user) {
      console.error("[selectSuggestionAction] Auth error:", userError?.message);
      return { success: false, message: "AUTH_REQUIRED" };
    }

    const { data: locationData, error: detailsError } = await getPlaceDetails(
      suggestion.placeId,
      ["location"],
      sessionToken)

    if (detailsError || !locationData || !locationData.location) {
      console.error("[selectSuggestionAction] getPlaceDetails error:", detailsError, locationData);
      return { success: false, message: "住所情報を取得できませんでした" };
    }

    const lat = locationData.location.latitude;
    const lng = locationData.location.longitude;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return { success: false, message: "緯度経度が正しくありません" };
    }

    console.log(`[selectSuggestionAction] Inserting for user ${user.id}: ${suggestion.placeName}`);

    const { data: newAddress, error: inserterror } = await supabase.from("addresses").insert({
      name: suggestion.placeName,
      address_text: suggestion.address_text,
      latitude: lat,
      longitude: lng,
      user_id: user.id,
    }).select("id").single();

    if (inserterror || !newAddress) {
      console.error("[selectSuggestionAction] Address insert error:", inserterror?.message);
      return { success: false, message: SAVE_ERROR };
    }

    console.log(`[selectSuggestionAction] Upserting profile user_id: ${user.id}, address_id: ${newAddress.id}`);
    const { error: updateError } = await supabase.from("profiles").upsert({
      id: user.id,
      selected_address_id: newAddress.id,
    })

    if (updateError) {
      console.error("[selectSuggestionAction] Profile upsert error:", updateError.message);
      return { success: false, message: SAVE_ERROR };
    }

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err: any) {
    console.error("[selectSuggestionAction] UNEXPECTED CRASH:", err);
    return { success: false, message: SAVE_ERROR };
  }
}

export async function selectAddressAction(addressId: number) {
  try {
    const supabase = await createClient();
    console.log(`[selectAddressAction] Starting for addressId: ${addressId}`);

    const { data, error: userError } = await supabase.auth.getUser();
    const user = data?.user;

    if (userError || !user) {
      return { success: false, message: "AUTH_REQUIRED" };
    }

    // 所有者チェック
    const { data: addrData, error: addrError } = await supabase
      .from("addresses")
      .select("id, user_id")
      .eq("id", addressId)
      .single();

    if (addrError || !addrData) {
      console.error("[selectAddressAction] Address not found:", addrError?.message);
      return { success: false, message: "住所が見つかりませんでした" };
    }

    if (addrData.user_id !== user.id) {
      return { success: false, message: "権限がありません" };
    }

    // プロフィールの selected_address_id を更新 (upsert)
    const { error: updateError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        selected_address_id: addressId
      });

    if (updateError) {
      console.error("[selectAddressAction] Profile upsert error:", updateError.message);
      return { success: false, message: SELECT_ERROR };
    }

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err: any) {
    console.error("[selectAddressAction] UNEXPECTED CRASH:", err);
    return { success: false, message: SELECT_ERROR };
  }
}

export async function deleteAddressAction(addressId: number) {
  try {
    const supabase = await createClient();

    const { data, error: userError } = await supabase.auth.getUser();
    const user = data?.user;

    if (userError || !user) {
      return { success: false, message: "AUTH_REQUIRED" };
    }

    const { error } = await supabase
      .from("addresses")
      .delete()
      .eq('id', addressId)
      .eq('user_id', user.id)

    if (error) {
      console.error("[deleteAddressAction] delete error:", error.message);
      return { success: false, message: DELETE_ERROR };
    }

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err: any) {
    console.error("[deleteAddressAction] UNEXPECTED CRASH:", err);
    return { success: false, message: DELETE_ERROR };
  }
}