// import { GooglePlacesDetailsAPIResponse, GooglePlacesSearchAPIResponse, PlaceDetailsAll } from "@/types";
// import { PlaceSearchResult } from "@/types";
// import { transformPlaceResults } from "@/lib/restaurants/utils"; 
// import { resumeToPipeableStream } from "react-dom/server";

// //近くのレストラン
// export async function fetchRestaurants() {
//     const url = "https://places.googleapis.com/v1/places:searchNearby";

//     const apikey = process.env.GOOGLE_API_KEY
//     const header = {
//         "Content-Type": "application/json",
//         "X-Goog-Api-Key": apikey!,
//         "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.photos",
//     };

//     const desiredTypes =[
//         "japanese_restaurant",
//         "cafe",
//         "cafeteria",
//         "coffee_shop",
//         "chinese_restaurant",
//         "fast_food_restaurant",
//         "hamburger_restaurant",
//         "french_restaurant",
//         "italian_restaurant",
//         "pizza_restaurant",
//         "ramen_restaurant",
//         "sushi_restaurant",
//         "korean_restaurant",
//         "indian_restaurant",
//     ];

//     const requestBody = {
//         includedTypes: desiredTypes,
//         maxResultCount: 10,
//         locationRestriction: {
//             circle: {
//                 center: {
//                     latitude: 35.6669248,
//                     longitude: 139.6514163,
//                 },
//                 radius: 1000.0,
//             },
//         },
//         languageCode: "ja",
//         rankPreference: "DISTANCE",
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
//         return {error: `Nearby Search API error: ${response.status}`};
//     };

//     const data:GooglePlacesSearchAPIResponse = await response.json();

//     if(!data.places) {
//             return {data: []};
//         }

//     const nearbyPlaces = data.places;

//     const matchingPlaces = nearbyPlaces.filter(
//         (place) => place.primaryType && desiredTypes.includes(place.primaryType)
//     );

//     const Restaurants = await transformPlaceResults(matchingPlaces);

//     return {data: Restaurants};
// }

// //近くのラーメン店
// export async function fetchRamenRestaurants() {
//     const url = "https://places.googleapis.com/v1/places:searchNearby";

//     const apikey = process.env.GOOGLE_API_KEY
//     const header = {
//         "Content-Type": "application/json",
//         "X-Goog-Api-Key": apikey!,
//         "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.photos",
//     };

//     const requestBody = {
//         includedPrimaryTypes: ["ramen_restaurant"],
//         maxResultCount: 10,
//         locationRestriction: {
//             circle: {
//                 center: {
//                     latitude: 35.6669248,
//                     longitude: 139.6514163,
//                 },
//                 radius: 1000.0,
//             },
//         },
//         languageCode: "ja",
//         rankPreference: "DISTANCE",
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
//         return {error: `Nearby Search API error: ${response.status}`};
//     };

//     const data:GooglePlacesSearchAPIResponse = await response.json();

//     if(!data.places) {
//             return {data: []};
//         }

//     const nearbyRamenPlaces = data.places;

//     const RamenRestaurants = await transformPlaceResults(nearbyRamenPlaces);
//     return {data: RamenRestaurants};
// }

// //カテゴリー検索機能
// export async function fetchCategoryRestaurants(category: string) {
//     const url = "https://places.googleapis.com/v1/places:searchNearby";

//     const apikey = process.env.GOOGLE_API_KEY
//     const header = {
//         "Content-Type": "application/json",
//         "X-Goog-Api-Key": apikey!,
//         "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.photos",
//     };

//     const requestBody = {
//         includedPrimaryTypes: [category],
//         maxResultCount: 10,
//         locationRestriction: {
//             circle: {
//                 center: {
//                     latitude: 35.6669248,
//                     longitude: 139.6514163,
//                 },
//                 radius: 1000.0,
//             },
//         },
//         languageCode: "ja",
//         rankPreference: "DISTANCE",
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
//         return {error: `Nearby Search API error: ${response.status}`};
//     };

//     const data:GooglePlacesSearchAPIResponse = await response.json();

//     if(!data.places) {
//             return {data: []};
//         }

//     const categoryPlaces = data.places;

//     const categoryRestaurants = await transformPlaceResults(categoryPlaces);
//     return {data: categoryRestaurants};
// }

// //キーワード検索機能
// export async function fetchRestaurantsByKeyword(query: string) {
//     const url = "https://places.googleapis.com/v1/places:searchText";

//     const apikey = process.env.GOOGLE_API_KEY
//     const header = {
//         "Content-Type": "application/json",
//         "X-Goog-Api-Key": apikey!,
//         "X-Goog-FieldMask": "places.id,places.displayName,place.types,places.primaryType,places.photos",
//     };

//     const requestBody = {
//         textQuery: query,
//         pageSize: 10,
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
//         rankPreference: "DISTANCE",
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
//         return {error: `Text Search request error: ${response.status}`};
//     };

//     const data:GooglePlacesSearchAPIResponse = await response.json();

//     if(!data.places) {
//             return {data: []};
//         }

//     const textSearchPlaces = data.places;

//     const restaurants = await transformPlaceResults(textSearchPlaces);
//     return {data: restaurants};
// }

// export async function getPhotoUrl(name: string, maxWidth = 400) {
//     "use cache";
//     const apikey = process.env.GOOGLE_API_KEY;
//     const url = `https://places.googleapis.com/v1/${name}/media?key=${apikey}&maxWidthPx=${maxWidth}`;
//     return url;
// }

// export async function getPlaceDetails(placeId: string, fields:string[], sessionToken?:string) {
//     let url:string;

//     const fieldsParam = fields.join(",");

//     if(sessionToken) {
//         url = `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${sessionToken}&languageCode=ja`
//     } else {
//         url = `https://places.googleapis.com/v1/places/${placeId}?languageCode=ja`
//     }

//     const apikey = process.env.GOOGLE_API_KEY
//     const header = {
//         "Content-Type": "application/json",
//         "X-Goog-Api-Key": apikey!,
//         "X-Goog-FieldMask": fieldsParam,
//     };

//     const response = await fetch(url, {
//         method: "GET",
//         headers: header,
//         next: { revalidate: 86400 },
//     });

//     if(!response.ok) {
//         const errorData = await response.json();
//         console.error(errorData)
//         return {error: `Place details request error: ${response.status}`};
//     };

//     const data: GooglePlacesDetailsAPIResponse = await response.json();

//     const results:PlaceDetailsAll = {}

//     if(fields.includes("location") && data.location) {
//         results.location = data.location
//     }

//     return {data: results}

// }

// src/lib/restaurants/api.ts
import { GooglePlacesDetailsAPIResponse, GooglePlacesSearchAPIResponse, PlaceDetailsAll } from "@/types";
import { PlaceSearchResult } from "@/types";
import { transformPlaceResults } from "@/lib/restaurants/utils";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";


// 近くのレストラン
async function safeFetchJson(url: string, opts: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    let errorDetail = text;
    try {
      const jsonError = JSON.parse(text);
      if (jsonError.error && jsonError.error.message) {
        errorDetail = jsonError.error.message;
      }
    } catch (e) {
      // not JSON
    }
    console.error(`[safeFetchJson] non-ok response (${res.status}):`, errorDetail);
    throw new Error(`Fetch error: ${res.status} - ${errorDetail}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    console.warn("[safeFetchJson] non-json response:", ct, text.slice(0, 1000));
    throw new Error("Non-JSON response");
  }
  return res.json();
}

export async function fetchRestaurants(lat: number, Ing: number) {
  const url = "https://places.googleapis.com/v1/places:searchNearby";
  const apikey = process.env.GOOGLE_API_KEY;
  if (!apikey) {
    console.error("[fetchRestaurants] Missing GOOGLE_API_KEY");
    return { error: "Server configuration error: missing API key" };
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apikey,
    "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.photos",
  };

  const desiredTypes = [
    "japanese_restaurant",
    "cafe",
    "cafeteria",
    "coffee_shop",
    "chinese_restaurant",
    "fast_food_restaurant",
    "hamburger_restaurant",
    "french_restaurant",
    "italian_restaurant",
    "pizza_restaurant",
    "ramen_restaurant",
    "sushi_restaurant",
    "korean_restaurant",
    "indian_restaurant",
  ];

  const requestBody = {
    includedTypes: desiredTypes,
    maxResultCount: 10,
    locationRestriction: {
      circle: {
        center: {
          latitude: lat,
          longitude: Ing,
        },
        radius: 1000.0,
      },
    },
    languageCode: "ja",
    rankPreference: "DISTANCE",
  };

  try {
    const data: GooglePlacesSearchAPIResponse = await safeFetchJson(url, {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers,
      next: { revalidate: 0 },
    });

    if (!data.places) {
      return { data: [] };
    }

    const nearbyPlaces = data.places;

    const matchingPlaces = nearbyPlaces.filter(
      (place) => place.primaryType && desiredTypes.includes(place.primaryType)
    );

    const Restaurants = await transformPlaceResults(matchingPlaces);

    return { data: Restaurants };
  } catch (err: any) {
    console.error("[fetchRestaurants] error:", err.message || err);
    return { error: `Nearby Search API error: ${err.message || "Unknown error"}` };
  }
}

export async function fetchRamenRestaurants(lat: number, Ing: number) {
  const url = "https://places.googleapis.com/v1/places:searchNearby";
  const apikey = process.env.GOOGLE_API_KEY;
  if (!apikey) {
    console.error("[fetchRamenRestaurants] Missing GOOGLE_API_KEY");
    return { error: "Server configuration error: missing API key" };
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apikey,
    "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.photos",
  };

  const requestBody = {
    includedPrimaryTypes: ["ramen_restaurant"],
    maxResultCount: 10,
    locationRestriction: {
      circle: {
        center: {
          latitude: lat,
          longitude: Ing,
        },
        radius: 1000.0,
      },
    },
    languageCode: "ja",
    rankPreference: "DISTANCE",
  };

  try {
    const data: GooglePlacesSearchAPIResponse = await safeFetchJson(url, {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers,
      next: { revalidate: 0 },
    });

    if (!data.places) {
      return { data: [] };
    }

    const nearbyRamenPlaces = data.places;

    const RamenRestaurants = await transformPlaceResults(nearbyRamenPlaces);
    return { data: RamenRestaurants };
  } catch (err: any) {
    console.error("[fetchRamenRestaurants] error:", err.message || err);
    return { error: `Nearby Search API error: ${err.message || "Unknown error"}` };
  }
}

export async function fetchCategoryRestaurants(category: string, lat: number, Ing: number) {
  const url = "https://places.googleapis.com/v1/places:searchNearby";
  const apikey = process.env.GOOGLE_API_KEY;
  if (!apikey) {
    console.error("[fetchCategoryRestaurants] Missing GOOGLE_API_KEY");
    return { error: "Server configuration error: missing API key" };
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apikey,
    "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.photos",
  };

  const requestBody = {
    includedPrimaryTypes: [category],
    maxResultCount: 10,
    locationRestriction: {
      circle: {
        center: {
          latitude: lat,
          longitude: Ing,
        },
        radius: 1000.0,
      },
    },
    languageCode: "ja",
    rankPreference: "DISTANCE",
  };

  try {
    const data: GooglePlacesSearchAPIResponse = await safeFetchJson(url, {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers,
      next: { revalidate: 0 },
    });

    if (!data.places) {
      return { data: [] };
    }

    const categoryPlaces = data.places;
    const categoryRestaurants = await transformPlaceResults(categoryPlaces);
    return { data: categoryRestaurants };
  } catch (err: any) {
    console.error("[fetchCategoryRestaurants] error:", err.message || err);
    return { error: `Nearby Search API error: ${err.message || "Unknown error"}` };
  }
}

export async function fetchRestaurantsByKeyword(query: string, lat: number, Ing: number) {
  const url = "https://places.googleapis.com/v1/places:searchText";
  const apikey = process.env.GOOGLE_API_KEY;
  if (!apikey) {
    console.error("[fetchRestaurantsByKeyword] Missing GOOGLE_API_KEY");
    return { error: "Server configuration error: missing API key" };
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apikey,
    "X-Goog-FieldMask": "places.id,places.displayName,places.types,places.primaryType,places.photos",
  };

  const requestBody = {
    textQuery: query,
    pageSize: 10,
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
    rankPreference: "DISTANCE",
  };

  try {
    const data: GooglePlacesSearchAPIResponse = await safeFetchJson(url, {
      method: "POST",
      body: JSON.stringify(requestBody),
      headers,
      next: { revalidate: 0 },
    });

    if (!data.places) {
      return { data: [] };
    }

    const textSearchPlaces = data.places;
    const restaurants = await transformPlaceResults(textSearchPlaces);
    return { data: restaurants };
  } catch (err: any) {
    console.error("[fetchRestaurantsByKeyword] error:", err.message || err);
    return { error: `Text Search request error: ${err.message || "Unknown error"}` };
  }
}

export async function getPhotoUrl(name: string, maxWidth = 400) {
  "use cache";
  const apikey = process.env.GOOGLE_API_KEY;
  const url = `https://places.googleapis.com/v1/${name}/media?key=${apikey}&maxWidthPx=${maxWidth}`;
  return url;
}

export async function getPlaceDetails(placeId: string, fields: string[], sessionToken?: string) {
  let url: string;

  const fieldsParam = fields.join(",");

  if (sessionToken) {
    url = `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${sessionToken}&languageCode=ja`;
  } else {
    url = `https://places.googleapis.com/v1/places/${placeId}?languageCode=ja`;
  }

  const apikey = process.env.GOOGLE_API_KEY;
  if (!apikey) {
    console.error("[getPlaceDetails] Missing GOOGLE_API_KEY");
    return { error: "Server configuration error: missing API key" };
  }

  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apikey,
    "X-Goog-FieldMask": fieldsParam,
  };

  try {
    const data: GooglePlacesDetailsAPIResponse = await safeFetchJson(url, {
      method: "GET",
      headers,
      next: { revalidate: 0 },
    });

    const results: PlaceDetailsAll = {};

    if (fields.includes("location") && (data as any).location) {
      results.location = (data as any).location;
    }

    return { data: results };
  } catch (err) {
    console.error("[getPlaceDetails] error:", err);
    return { error: "Place details request error" };
  }
}

export async function fetchLocation() {
  const Default_location = { lat: 35.6669248, lng: 139.6514163 };
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  // まずプロフィールの selected_address_id を取得
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('selected_address_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !profile.selected_address_id) {
    return { lat: Default_location.lat, Ing: Default_location.lng };
  }

  // selected_address_id を使ってアドレス情報を取得
  const { data: addressData, error: addressError } = await supabase
    .from('addresses')
    .select('latitude, longitude')
    .eq('id', profile.selected_address_id)
    .single();

  if (addressError || !addressData) {
    return { lat: Default_location.lat, Ing: Default_location.lng };
  }

  const lat = addressData.latitude ?? Default_location.lat;
  const Ing = addressData.longitude ?? Default_location.lng;

  return { lat, Ing };
}
