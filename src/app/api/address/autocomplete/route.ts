
// import { AddressSuggestion, GooglePlacesAutocompleteAPIResponse, RestaurantSuggestion } from "@/types";
// import { NextRequest, NextResponse } from "next/server";

// export async function GET(request: NextRequest) {
//   const searchParams = request.nextUrl.searchParams
//   const input = searchParams.get('input')
//   const sessionToken = searchParams.get("sessionToken")

//   if(!input){
//     NextResponse.json({ error: "文字を入力してください。"}, { status: 400 })
//   }

//   if(!sessionToken){
//     NextResponse.json({ error: "セッショントークンは必須です"}, { status: 400 })
//   }

//     try {
//         const url ="https://places.googleapis.com/v1/places:autocomplete"

//         const apikey = process.env.GOOGLE_API_KEY
//         const header = {
//             "Content-Type": "application/json",
//             "X-Goog-Api-Key": apikey!,
//         };

//     const requestBody = {
//         // includeQueryPredictions: true,
//         input: input,
//         sessionToken: sessionToken,
//         // includedPrimaryTypes: ["restaurant"],
//         locationBias: {
//             circle: {
//                 center: {
//                     latitude: 35.6669248,
//                     longitude: 139.6514163,
//                 },
//                 radius: 1000.0,
//             },
//         },
//         languageCode: "ja",
//         // includedRegionCodes: ["jp"]
//         regionCode: "jp"
//     };

//     const response = await fetch(url, {
//         method: "POST",
//         body: JSON.stringify(requestBody),
//         headers: header,
//         next: { revalidate: 86400 },
//     });

//     if(!response.ok) {
//         const errorData = await response.json();
//         console.error(errorData)
//         return {error: `Autocomplete request error: ${response.status}`};
//     };

//     const data: GooglePlacesAutocompleteAPIResponse = await response.json();
//     // console.log("data", JSON.stringify(data, null, 2));

//     const suggestions = data.suggestions ?? [];

//     const results = suggestions.map((suggestion) => {
//         return {
//             placeId: suggestion.placePrediction?.placeId,
//             placeName: suggestion.placePrediction?.structuredFormat?.mainText?.text,
//             address_text: suggestion.placePrediction?.structuredFormat?.secondaryText?.text
//         }
//     }).filter((suggestion): suggestion is AddressSuggestion => !!suggestion.placeId && !!suggestion.placeName && !!suggestion.address_text);


//     return NextResponse.json(results)
//     } catch(error) {
//         return {error: "unexpected error"}
//     }
// }

// src/app/api/address/autocomplete/route.ts
import { AddressSuggestion, GooglePlacesAutocompleteAPIResponse } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const input = searchParams.get("input");
    const sessionToken = searchParams.get("sessionToken");

    if (!input) {
      return NextResponse.json({ error: "文字を入力してください。" }, { status: 400 });
    }

    if (!sessionToken) {
      return NextResponse.json({ error: "セッショントークンは必須です" }, { status: 400 });
    }

    const url = "https://places.googleapis.com/v1/places:autocomplete";
    const apikey = process.env.GOOGLE_API_KEY;

    if (!apikey) {
      console.error("Missing GOOGLE_API_KEY env var");
      return NextResponse.json({ error: "サーバー設定エラー: APIキーがありません" }, { status: 500 });
    }

    const headers = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apikey,
    };

    const requestBody = {
      input,
      sessionToken,
      locationBias: {
        circle: {
          center: { latitude: 35.6669248, longitude: 139.6514163 },
          radius: 1000.0,
        },
      },
      languageCode: "ja",
      regionCode: "jp",
      // includedPrimaryTypes: ["RESTAURANT"], // 必要なら有効化（API仕様を確認）
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      next: { revalidate: 86400 },
    });

    // レスポンスがOKでない場合は text() を取り、内容をログに出す（HTML やエラーメッセージ確認用）
    if (!response.ok) {
      const text = await response.text();
      console.error("Google Places autocomplete error:", response.status, text);
      // クライアントには簡潔に返す
      return NextResponse.json({ error: "Google API error", status: response.status, detail: text }, { status: 502 });
    }

    // content-type をチェックして JSON かどうか確認
    const contentType = response.headers.get("content-type") ?? "";
    const bodyText = await response.text();

    if (!contentType.includes("application/json")) {
      console.warn("Google returned non-JSON response:", contentType, bodyText.slice(0, 500));
      // ここでもクライアント向けにはわかりやすく返す
      return NextResponse.json({ error: "Google returned non-json", detail: bodyText }, { status: 502 });
    }

    // JSON パース
    const data: GooglePlacesAutocompleteAPIResponse = JSON.parse(bodyText);

    const suggestions = data.suggestions ?? [];

    const results: AddressSuggestion[] = suggestions
      .map((suggestion) => {
        return {
          placeId: suggestion.placePrediction?.placeId ?? "",
          placeName: suggestion.placePrediction?.structuredFormat?.mainText?.text ?? "",
          address_text: suggestion.placePrediction?.structuredFormat?.secondaryText?.text ?? "",
        };
      })
      .filter((s): s is AddressSuggestion => !!s.placeId && !!s.placeName && !!s.address_text);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Unexpected error in autocomplete route:", error);
    return NextResponse.json({ error: "unexpected error", detail: String(error) }, { status: 500 });
  }
}
