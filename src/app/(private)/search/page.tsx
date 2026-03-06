import Categories from "@/components/ui/categories";
import RestaurantList from "@/components/ui/restaurant-list";
import { fetchCategoryRestaurants, fetchLocation, fetchRestaurants, fetchRestaurantsByKeyword } from "@/lib/restaurants/api";
import { redirect } from "next/navigation";

export default async function SearchPage({
    searchParams
}: {
    searchParams: Promise<{category: string, restaurant:string}>;
}) {
    // searchParams: {
    //     Category: "sushi_restaurant";
    // }
    const {category, restaurant} = await searchParams;

    const {lat, Ing} = await fetchLocation();


    if(category) {
        const {data:categoryRestaurants, error: fetchError } = await fetchCategoryRestaurants(category, lat, Ing);

        return (
            <>
            <div className="mb-4">
                <Categories />
            </div>
            {!categoryRestaurants ? (
                  <p>{fetchError}</p>
                ): categoryRestaurants.length > 0 ? (
                  <RestaurantList restaurants={categoryRestaurants} />
                ): (
                  <p>カテゴリー<strong>{category}</strong>に一致するレストランが見つかりません</p>
            )}
            </>
        )
    } else if(restaurant) {

        const {data:restaurants, error: fetchError } = await fetchRestaurantsByKeyword(restaurant, lat, Ing);

        return (
            <>
            {!restaurants ? (
                  <p>{fetchError}</p>
                ): restaurants.length > 0 ? (
                <>
                <div className="mb-4">
                    {restaurant} の検索結果 {restaurants.length} 件
                </div>
                <RestaurantList restaurants={restaurants} />
                </>
                ): (
                  <p>
                    <strong>{restaurant}</strong>
                    に一致するレストランが見つかりません
                  </p>
            )}
            </>
        )
    } else {
        redirect("/");
    }

    }
