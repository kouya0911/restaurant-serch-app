import { GooglePlacesAutocompleteAPIResponse, RestaurantSuggestion } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const input = searchParams.get('input')
    const sessionToken = searchParams.get("sessionToken")
    const lat = searchParams.get('lat')
    const Ing = searchParams.get('Ing')

    if (!input) {
        return NextResponse.json({ error: "文字を入力してください。" }, { status: 400 })
    }

    if (!sessionToken) {
        return NextResponse.json({ error: "セッショントークンは必須です" }, { status: 400 })
    }

    try {
        // モックモード
        if (process.env.ENABLE_MOCK_API === "true" || (process.env.NODE_ENV === "development" && !process.env.GOOGLE_API_KEY)) {
            const mockSuggestions: RestaurantSuggestion[] = [
                { type: "placePrediction", placeId: "mock-1", placeName: "モック和食処 まるふく" },
                { type: "placePrediction", placeId: "mock-2", placeName: "カフェ・ド・モック" },
                { type: "queryPrediction", placeName: `${input} の検索結果（モック）` }
            ].filter(s => s.placeName.includes(input));
            return NextResponse.json(mockSuggestions);
        }

        const url = "https://places.googleapis.com/v1/places:autocomplete"

        const apikey = process.env.GOOGLE_API_KEY
        if (!apikey) {
            return NextResponse.json({ error: "APIキーが設定されていません。" }, { status: 500 });
        }
        const header = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apikey,
        };

        const latitude = parseFloat(lat || "35.6669248");
        const longitude = parseFloat(Ing || "139.6514163");

        const requestBody = {
            includeQueryPredictions: true,
            input: input,
            sessionToken,
            includedPrimaryTypes: ["restaurant"],
            locationBias: {
                circle: {
                    center: {
                        latitude,
                        longitude,
                    },
                    radius: 1000.0,
                },
            },
            languageCode: "ja",
            // includedRegionCodes: ["jp"]
            regionCode: "jp"
        };

        const response = await fetch(url, {
            method: "POST",
            body: JSON.stringify(requestBody),
            headers: header,
            next: { revalidate: 86400 },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[restaurant autocomplete] Google API error:", response.status, errorText)
            return NextResponse.json({ error: `Autocomplete request error: ${response.status}` }, { status: 502 });
        };

        const data: GooglePlacesAutocompleteAPIResponse = await response.json();
        // console.log("data", JSON.stringify(data, null, 2));

        const suggestions = data.suggestions ?? [];

        const results = suggestions.map((suggestion) => {
            if (suggestion.placePrediction && suggestion.placePrediction.placeId && suggestion.placePrediction.structuredFormat?.mainText?.text) {
                return {
                    type: "placePrediction",
                    placeId: suggestion.placePrediction.placeId,
                    placeName: suggestion.placePrediction.structuredFormat?.mainText?.text
                }
            } else if (suggestion.queryPrediction && suggestion.queryPrediction.text?.text) {
                return {
                    type: "queryPrediction",
                    placeName: suggestion.queryPrediction.text?.text
                };
            }
        }).filter((suggestion): suggestion is RestaurantSuggestion => suggestion !== undefined);


        return NextResponse.json(results)
    } catch (error) {
        console.error("[restaurant autocomplete] unexpected error:", error)
        return NextResponse.json({ error: "unexpected error" }, { status: 500 })
    }
}

