// import { Address } from "@/types";
// import { createClient } from "@/utils/supabase/server";
// import { NextRequest, NextResponse } from "next/server";

// export async function GET(request: NextRequest) {
//     try {
//         let addressList:Address[] = []
//         let selectedAddress:Address | null = null;

//         const supabase = await createClient();

//         const {data: {user}, error: userError,} = await supabase.auth.getUser();

//         if(userError || !user) {
//             return NextResponse.json({ error: "ユーザーが認証されていません"})
//         }

//         const {data: addressData, error: addressError} = await supabase
//         .from("addresses")
//         .select("id,name,address_text,latitude,longitude")
//         .eq("user_id", user.id)

//         if(addressError) {
//             return NextResponse.json({ error: "住所情報取得失敗"})
//         }

//         addressList = addressData

//         const {data: selectedAddressData, error:selectedAddressDataError} = await supabase
//         .from("profiles")
//         .select("addresses(id,name,address_text,latitude,longitude)")
//         .eq("id", user.id)
//         .single();

//         if(selectedAddressDataError) {
//             return NextResponse.json({ error: "プロフィール取得失敗"})
//         }

//         selectedAddress = selectedAddressData.addresses[0] || null

//     } catch(error) {
//         return NextResponse.json({ error: "例外的なエラー"})
//     }
// }

// src/app/api/user/address/route.ts  (App Router の場合)
import { Address } from "@/types";
import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    let addressList: Address[] = [];
    let selectedAddress: Address | null = null;

    const supabase = await createClient();

    const { data: userData, error: userError } = await supabase.auth.getUser();

    const user = userData?.user ?? null;

    if (userError || !user) {
      return NextResponse.json({ error: "ユーザーが認証されていません" }, { status: 401 });
    }

    const { data: addressData, error: addressError } = await supabase
      .from("addresses")
      .select("id,name,address_text,latitude,longitude")
      .eq("user_id", user.id);

    if (addressError) {
      console.error('[GET /api/user/address] addresses error:', addressError);
      return NextResponse.json({ error: "住所情報取得失敗" }, { status: 500 });
    }

    addressList = addressData ?? [];

    const { data: selectedAddressData, error: selectedAddressDataError } = await supabase
      .from("profiles")
      .select("addresses(id,name,address_text,latitude,longitude)")
      .eq("id", user.id)
      .single();

    if (selectedAddressDataError) {
      // プロフィールに住所が無いケースでも 200 を返すが情報は空にする
      console.warn('[GET /api/user/address] profile addresses not found:', selectedAddressDataError);
      selectedAddress = null;
    } else {
      // selectedAddressData.addresses が配列なら先頭を採る
      const addressesFromProfile = (selectedAddressData as any)?.addresses;
      if (Array.isArray(addressesFromProfile) && addressesFromProfile.length > 0) {
        selectedAddress = addressesFromProfile[0] as Address;
      } else {
        selectedAddress = null;
      }
    }

    // 成功レスポンスを返す（必須！）
    return NextResponse.json({ addressList, selectedAddress });
  } catch (error) {
    console.error('[GET /api/user/address] unexpected error', error);
    return NextResponse.json({ error: "例外的なエラー" }, { status: 500 });
  }
}
