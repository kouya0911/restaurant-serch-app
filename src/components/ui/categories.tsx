"use client"

import { useRouter, useSearchParams } from "next/navigation";
import CarouselContainer from "./carousel-container";
import Category from "./category";

export interface CategoryType {
  categoryName: string,
  type: string,
  imageUrl: string;
}

export default function Categories() {
  const categories: CategoryType[] = [
    {
      categoryName: "ファーストフード",
      type: "fast_food_restaurant",
      imageUrl: "/images/categories/ファーストフード.png",
    },
    {
      categoryName: "日本料理",
      type: "japanese_restaurant",
      imageUrl: "/images/categories/日本料理.png",
    },
    {
      categoryName: "ラーメン",
      type: "ramen_restaurant",

      imageUrl: "/images/categories/ラーメン.png",
    },
    {
      categoryName: "寿司",
      type: "sushi_restaurant",
      imageUrl: "/images/categories/寿司.png",
    },
    {
      categoryName: "中華料理",
      type: "chinese_restaurant",

      imageUrl: "/images/categories/中華料理.png",
    },
    {
      categoryName: "コーヒ-",
      type: "cafe",
      imageUrl: "/images/categories/コーヒー.png",
    },
    {
      categoryName: "イタリアン",
      type: "italian_restaurant",
      imageUrl: "/images/categories/イタリアン.png",
    },
    {
      categoryName: "フランス料理",
      type: "french_restaurant",
      imageUrl: "/images/categories/フレンチ.png",
    },

    {
      categoryName: "ピザ",
      type: "pizza_restaurant",
      imageUrl: "/images/categories/ピザ.png",
    },

    {
      categoryName: "韓国料理",
      type: "korean_restaurant",
      imageUrl: "/images/categories/韓国料理.png",
    },
    {
      categoryName: "インド料理",
      type: "indian_restaurant",
      imageUrl: "/images/categories/インド料理.png",
    },
  ];

  const searchParams = useSearchParams();
  const router = useRouter();
  const currentCategory = searchParams.get("category")

  const searchRestaurantsOfCategory = (category: string) => {
    const params = new URLSearchParams(searchParams);

    if (currentCategory === category) {
      router.replace("/");
    } else {
      params.set("category", category);
      router.replace(`/search?${params.toString()}`)
    }
  }

  return (
    <div className="w-full overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-4 pt-2 -mx-4 px-4 md:mx-0 md:px-0">
      <div className="flex gap-4 md:gap-6 w-max">
        {categories.map((category) => (
          <div key={category.type} className="snap-start shrink-0 w-[72px] md:w-[90px]">
            <Category
              category={category}
              onClick={searchRestaurantsOfCategory}
              select={category.type === currentCategory}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
