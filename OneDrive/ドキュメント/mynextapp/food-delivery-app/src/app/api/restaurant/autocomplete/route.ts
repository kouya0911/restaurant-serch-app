import { GooglePlacesAutocompleteAPIResponse, RestaurantSuggestion } from "@/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const input = searchParams.get('input')
  const sessionToken = searchParams.get("sessionToken")
  const lat = searchParams.get('lat')
  const Ing = searchParams.get('Ing')

  if(!input){
    NextResponse.json({ error: "文字を入力してください。"}, { status: 400 })
  }

  if(!sessionToken){
    NextResponse.json({ error: "セッショントークンは必須です"}, { status: 400 })
  }

    try {
        const url ="https://places.googleapis.com/v1/places:autocomplete"

        const apikey = process.env.GOOGLE_API_KEY
        const header = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apikey!,
        };

    const requestBody = {
        includeQueryPredictions: true,
        input: input,
        sessionToken,
        includedPrimaryTypes: ["restaurant"],
        locationBias: {
            circle: {
                center: {
                    latitude: lat,
                    longitude: Ing,
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

    if(!response.ok) {
        const errorData = await response.json();
        console.error(errorData)
        return {error: `Autocomplete request error: ${response.status}`};
    };

    const data: GooglePlacesAutocompleteAPIResponse = await response.json();
    // console.log("data", JSON.stringify(data, null, 2));

    const suggestions = data.suggestions ?? [];

    const results = suggestions.map((suggestion) => {
        if(suggestion.placePrediction && suggestion.placePrediction.placeId && suggestion.placePrediction.structuredFormat?.mainText?.text) {
            return {
                type: "placePrediction",
                placeId: suggestion.placePrediction.placeId,
                placeName: suggestion.placePrediction.structuredFormat?.mainText?.text
            }
        } else if(suggestion.queryPrediction && suggestion.queryPrediction.text?.text) {
            return {
                type: "queryPrediction",
                placeName: suggestion.queryPrediction.text?.text
            };
        }
    }).filter((suggestion): suggestion is RestaurantSuggestion => suggestion !== undefined);


    return NextResponse.json(results)
    } catch(error) {
        return {error: "unexpected error"}
    }
}
    
