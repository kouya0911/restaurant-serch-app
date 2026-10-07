import { Restaurant } from "@/types";
import RestaurantCard from "./restaurant-card";
import GoogleMapsAttribution from "./google-maps-attribution";

interface RestaurantListProps {
  restaurants: Restaurant[];
}

export default function RestaurantList({ restaurants }: RestaurantListProps) {
  return (
    <div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-4 md:px-0">
        {restaurants.map((restaurant) => (
          <RestaurantCard restaurant={restaurant} key={restaurant.id} />
        ))}
      </ul>
      <GoogleMapsAttribution className="mt-2 px-4 md:px-0" />
    </div>
  );
}
