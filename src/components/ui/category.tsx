"use client"

import Image from "next/image";
import { CategoryType } from "./categories";
import { cn } from "@/lib/utils";

interface CategoryProps {
  category: CategoryType;
  onClick: (category: string) => void;
  select: boolean;
}

export default function Category({ category, onClick, select}: CategoryProps) {
  return (
    <div onClick={() => onClick(category.type)} className="cursor-pointer">
      <div className={cn("relative aspect-square overflow-hidden rounded-full",
        select && "bg-green-200")}>
        <Image
          className="object-cover scale-75"
          src={category.imageUrl}
          fill
          alt={category.categoryName}
          sizes="(max-width: 1280px) 10vw, 97px"
        />
      </div>
      <div className="mt-2 text-center ">
        <p className="text-xs truncate">{category.categoryName}</p>
      </div>
    </div>
  );
}

