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

import { Address } from "@/types";
import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";

export async function GET(request: NextRequest) {
  noStore();
  try {
    let addressList: Address[] = [];
    let selectedAddress: Address | null = null;

    const supabase = await createClient();

    const { data: userData, error: userError } = await supabase.auth.getUser();

    const user = userData?.user ?? null;

    if (userError || !user) {
      return NextResponse.json({ error: "ユーザーが認証されていません" }, { status: 401 });
    }

    // 1. 全住所リストを取得
    const { data: addressData, error: addressError } = await supabase
      .from("addresses")
      .select("id,name,address_text,latitude,longitude")
      .eq("user_id", user.id);

    if (addressError) {
      console.error('[GET /api/address] addresses error:', addressError);
      return NextResponse.json({ error: "住所情報取得失敗" }, { status: 500 });
    }

    addressList = addressData ?? [];

    // 2. プロフィールから選択中の住所IDを取得
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("selected_address_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData?.selected_address_id) {
      selectedAddress = null;
    } else {
      // 3. 選択中の住所IDに一致する住所をリストから探すか、再度取得
      selectedAddress = addressList.find(a => a.id === profileData.selected_address_id) || null;

      if (!selectedAddress) {
        // リストにない場合（削除済みなど）は念のためDBから直接取得を試みる
        const { data: directAddress } = await supabase
          .from("addresses")
          .select("id,name,address_text,latitude,longitude")
          .eq("id", profileData.selected_address_id)
          .single();
        selectedAddress = directAddress || null;
      }
    }

    return NextResponse.json({ addressList, selectedAddress });
  } catch (error) {
    console.error('[GET /api/address] unexpected error', error);
    return NextResponse.json({ error: "例外的なエラー" }, { status: 500 });
  }
}
