import { Restaurant } from "@/types";
import RestaurantCard from "./restaurant-card";

interface RestaurantListProps {
    restaurants: Restaurant[];
}

export default function RestaurantList({restaurants}: RestaurantListProps) {
  return (
    <ul className="grid grid-cols-4 gap-4">
        {restaurants.map((restaurant) => (
            <RestaurantCard restaurant={restaurant} key={restaurant.id} />
        ))}
    </ul>
  );
}
