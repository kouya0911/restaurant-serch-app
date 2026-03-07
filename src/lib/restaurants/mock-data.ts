import { Restaurant } from "@/types";

export const MOCK_RESTAURANTS: Restaurant[] = [
    {
        id: "mock-1",
        restaurantName: "モック和食処 まるふく",
        primaryType: "japanese_restaurant",
        photoUrl: "/no_image.png",
    },
    {
        id: "mock-2",
        restaurantName: "カフェ・ド・モック",
        primaryType: "cafe",
        photoUrl: "/no_image.png",
    },
    {
        id: "mock-3",
        restaurantName: "モックラーメン 匠",
        primaryType: "ramen_restaurant",
        photoUrl: "/no_image.png",
    },
    {
        id: "mock-4",
        restaurantName: "Mock Burger King",
        primaryType: "hamburger_restaurant",
        photoUrl: "/no_image.png",
    },
    {
        id: "mock-5",
        restaurantName: "リストランテ・モック",
        primaryType: "italian_restaurant",
        photoUrl: "/no_image.png",
    },
    {
        id: "mock-6",
        restaurantName: "中華北京屋（モック）",
        primaryType: "chinese_restaurant",
        photoUrl: "/no_image.png",
    },
    {
        id: "mock-7",
        restaurantName: "モック寿司",
        primaryType: "sushi_restaurant",
        photoUrl: "/no_image.png",
    },
    {
        id: "mock-8",
        restaurantName: "Bistro Mock",
        primaryType: "french_restaurant",
        photoUrl: "/no_image.png",
    }
];

export const MOCK_RAMEN_RESTAURANTS: Restaurant[] = MOCK_RESTAURANTS.filter(r => r.primaryType === "ramen_restaurant");
