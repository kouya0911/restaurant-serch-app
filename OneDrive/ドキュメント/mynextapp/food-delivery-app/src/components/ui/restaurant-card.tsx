// import Image from "next/image"
// import { Heart } from "lucide-react"
// import Link from "next/link"
// import { Restaurant } from "@/types"

// interface RestaurantCardProps {
//     restaurant:Restaurant;
// }

// export default function RestaurantCard({restaurant}: RestaurantCardProps) {
//   return (
//     <div className="relative">
//         <Link href={"/abc"} className="inset-0 absolute z-10"></Link>
//         <div className="relative aspect-video rounded-lg overflow-hidden">
//             <Image 
//             className="object-cover"
//             src={restaurant.photoUrl} 
//             fill 
//             alt="レストラン画像"
//             sizes="(max-width: 1280px) 25vw, 280px"
//             />
//         </div>
//         <div className="flex justify-between items-center">
//             <p className="font-bold">{restaurant.restaurantName}</p>
//             <div className="z-20">
//                 <Heart 
//                 color="gray" 
//                 strokeWidth={3}
//                 size={15} 
//                 className="hover:fill-red-500 hover:stroke-0" />
//             </div>
//         </div>
//     </div>
//   )
// }
"use client"

import { useState } from "react"
import Image from "next/image"
import { Copy, Check } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Restaurant } from "@/types"

interface RestaurantCardProps {
  restaurant: Restaurant
}

export default function RestaurantCard({ restaurant }: RestaurantCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(restaurant.restaurantName ?? "")
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative">
      {/* カード全体クリック用リンク */}
      <Link href={"/abc"} className="absolute inset-0 z-10"></Link>

      {/* 画像部分 */}
      <div className="relative aspect-video rounded-lg overflow-hidden">
        <Image
          className="object-cover"
          src={restaurant.photoUrl}
          fill
          alt="レストラン画像"
          sizes="(max-width: 1280px) 25vw, 280px"
        />
      </div>

      {/* 下部：レストラン名 + コピーアイコン */}
      <div className="flex justify-between items-center mt-2 z-20 relative">
        <p className="font-bold">{restaurant.restaurantName}</p>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          className="h-6 w-6"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4 text-gray-500" />
          )}
        </Button>
      </div>
    </div>
  )
}
