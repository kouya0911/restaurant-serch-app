export interface Restaurant {
    id: string;
    restaurantName?: string;
    primaryType?: string;
    photoUrl: string;
}

export interface GooglePlacesSearchAPIResponse {
    places?: PlaceSearchResult[]
}

export interface PlaceSearchResult {
    displayName?: {
        laguageCode?: string;
        text?: string;
    };
    id: string;
    primaryType?: string;
    photos?: PlacePhoto[];
}

export interface PlacePhoto {
    name: string;
}
    
export interface GooglePlacesAutocompleteAPIResponse {
    suggestions?: PlaceAutoCompleteResult[]
}

export interface PlaceAutoCompleteResult {
    placePrediction?: {
        place?: string,
        placeId?: string,
        structuredFormat?: {
            mainText?: {
                text?: string;
            }
            secondaryText: {
                text?: string,
            }
        }
    }
    queryPrediction?: {
        text?: {
            text?: string;
        }
    }
}

export interface GooglePlacesDetailsAPIResponse {
    location?: {latitude?: number, longitude?: number}
}

export interface PlaceDetailsAll {
        location?: { latitude?: number, longitude?: number}
    }

export interface RestaurantSuggestion {
        type: string;
        placeId?: string;
        placeName: string;
    }

export interface AddressSuggestion {
        placeId: string,
        placeName: string,
        address_text: string
    }

export interface Address {
    id: number;
    name: string;
    address_text: string,
    latitude: number,
    longitude: number;
}