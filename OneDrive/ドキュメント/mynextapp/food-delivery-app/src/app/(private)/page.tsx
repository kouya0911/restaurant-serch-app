import Section from "@/components/ui/section";
import CarouselContainer from "@/components/ui/carousel-container";
import RestaurantCard from "@/components/ui/restaurant-card";
import { fetchLocation, fetchRamenRestaurants } from "@/lib/restaurants/api";
import { fetchRestaurants } from "@/lib/restaurants/api";
import RestaurantList from "@/components/ui/restaurant-list";
import Categories from "@/components/ui/categories";

export default async function Home() {
  const { lat, Ing } = await fetchLocation();
  const {data:nearbyRamenRestaurants, error: nearbyRamenRestaurantsError} = await fetchRamenRestaurants(lat, Ing);
  const {data:nearbyRestaurants, error: nearbyRestaurantsError} = await fetchRestaurants(lat, Ing);
  return (
    <>
    <Categories />

    {/* 近くのレストラン */}
    {!nearbyRestaurants ? (
      <p>{nearbyRestaurantsError}</p>
    ): nearbyRestaurants.length > 0 ? (
      <Section title="近くのレストラン" expandedContent={<RestaurantList restaurants={nearbyRestaurants} />}>
        <CarouselContainer slideToShow={4}>
          {nearbyRestaurants.map((restaurant, index) => (
            <RestaurantCard key={index} restaurant={restaurant} />
          ))}
        </CarouselContainer>
      </Section>
    ): (
      <p>近くにレストランが見つかりませんでした。</p>
    )}

    {/* 近くのラーメン屋 */}
    {!nearbyRamenRestaurants ? (
      <p>{nearbyRamenRestaurantsError}</p>
    ): nearbyRamenRestaurants.length > 0 ? (
      <Section title="近くのラーメン屋" expandedContent={<RestaurantList restaurants={nearbyRamenRestaurants}/>}>
        <CarouselContainer slideToShow={4}>
          {nearbyRamenRestaurants.map((restaurant, index) => (
            <RestaurantCard key={index} restaurant={restaurant} />
          ))}
        </CarouselContainer>
      </Section>
    ): (
      <p>近くにラーメン屋が見つかりませんでした。</p>
    )}
    </>
  );
}
  