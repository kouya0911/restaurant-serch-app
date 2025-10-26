"use server"

import { getPlaceDetails } from "@/lib/restaurants/api";
import { AddressSuggestion } from "@/types";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function selectSuggestionAction(suggestion:AddressSuggestion, sessionToken:string) {
    const supabase = await createClient();

    const {data: locationData, error } = await getPlaceDetails(
        suggestion.placeId, 
        ["location"], 
        sessionToken)

    if(error || !locationData || !locationData.location || !locationData.location.latitude || !locationData.location.longitude) {
        throw new Error("住所情報を取得できませんでした")
    }

    const {
        data: {user}, 
        error: userError,
    } = await supabase.auth.getUser();

    if(userError || !user) {
        redirect("/login");
    }

    const {data:newAddress, error: inserterror} = await supabase.from("addresses").insert({
        name: suggestion.placeName,
        address_text: suggestion.address_text,
        latitude: locationData.location.latitude,
        longitude: locationData.location.longitude,
        user_id: user.id,
    }).select("id").single();

    if (inserterror) {
        throw new Error("住所の保存に失敗しました")
    }

    const {error: updateError} = await supabase.from("profiles").update({
        selected_address_id: newAddress.id,
    }).eq("id", user.id)

    if (updateError) {
        throw new Error("プロフィールの更新に失敗しました")
    }
}

export async function selectAddressAction(addressId: number) {
  const supabase = await createClient();

  // get user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    // サーバアクション内での未認証はリダイレクトする
    redirect("/login");
  }

  // 所有者チェック: 指定 address の user_id が現在の user.id と一致するか確認
  const { data: addrData, error: addrError } = await supabase
    .from("addresses")
    .select("id, user_id")
    .eq("id", addressId)
    .single();

  if (addrError) {
    // address が見つからない / DB エラー
    throw new Error("指定された住所が見つかりませんでした");
  }

  if (!addrData || addrData.user_id !== user.id) {
    // 他人の住所を選択しようとしているなどの不整合
    throw new Error("この住所を選択する権限がありません");
  }

  // プロフィールの selected_address_id を更新
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ selected_address_id: addressId })
    .eq("id", user.id);

  if (updateError) {
    throw new Error("プロフィールの更新に失敗しました");
  }

  return true;
}


export async function deleteAddressAction(addressId:number) {
    const supabase = await createClient();

  // get user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    // サーバアクション内での未認証はリダイレクトする
    redirect("/login");
  }

  const { error } = await supabase
  .from("addresses")
  .delete()
  .eq('id', addressId)
  .eq('user_id', user.id)

  if(error) {
    throw new Error("error")
  }
}