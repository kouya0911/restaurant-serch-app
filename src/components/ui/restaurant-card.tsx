// // import Image from "next/image"
// // import { Heart } from "lucide-react"
// // import Link from "next/link"
// // import { Restaurant } from "@/types"

// // interface RestaurantCardProps {
// //     restaurant:Restaurant;
// // }

// // export default function RestaurantCard({restaurant}: RestaurantCardProps) {
// //   return (
// //     <div className="relative">
// //         <Link href={"/abc"} className="inset-0 absolute z-10"></Link>
// //         <div className="relative aspect-video rounded-lg overflow-hidden">
// //             <Image 
// //             className="object-cover"
// //             src={restaurant.photoUrl} 
// //             fill 
// //             alt="レストラン画像"
// //             sizes="(max-width: 1280px) 25vw, 280px"
// //             />
// //         </div>
// //         <div className="flex justify-between items-center">
// //             <p className="font-bold">{restaurant.restaurantName}</p>
// //             <div className="z-20">
// //                 <Heart 
// //                 color="gray" 
// //                 strokeWidth={3}
// //                 size={15} 
// //                 className="hover:fill-red-500 hover:stroke-0" />
// //             </div>
// //         </div>
// //     </div>
// //   )
// // }
// "use client"

// import { useState } from "react"
// import Image from "next/image"
// import { Copy, Check } from "lucide-react"
// import Link from "next/link"
// import { Button } from "@/components/ui/button"
// import { Restaurant } from "@/types"

// interface RestaurantCardProps {
//   restaurant: Restaurant
// }

// export default function RestaurantCard({ restaurant }: RestaurantCardProps) {
//   const [copied, setCopied] = useState(false)

//   const handleCopy = async () => {
//     await navigator.clipboard.writeText(restaurant.restaurantName ?? "")
//     setCopied(true)
//     setTimeout(() => setCopied(false), 1500)
//   }

//   return (
//     <div className="relative">
//       {/* カード全体クリック用リンク */}
//       <Link href={"/abc"} className="absolute inset-0 z-10"></Link>

//       {/* 画像部分 */}
//       <div className="relative aspect-video rounded-lg overflow-hidden">
//         <Image
//           className="object-cover"
//           src={restaurant.photoUrl}
//           fill
//           alt="レストラン画像"
//           sizes="(max-width: 1280px) 25vw, 280px"
//         />
//       </div>

//       {/* 下部：レストラン名 + コピーアイコン */}
//       <div className="flex justify-between items-center mt-2 z-20 relative">
//         <p className="font-bold">{restaurant.restaurantName}</p>
//         <Button
//           variant="ghost"
//           size="icon"
//           onClick={handleCopy}
//           className="h-6 w-6"
//         >
//           {copied ? (
//             <Check className="h-4 w-4 text-green-500" />
//           ) : (
//             <Copy className="h-4 w-4 text-gray-500" />
//           )}
//         </Button>
//       </div>
//     </div>
//   )
// }
"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Copy, Check, Heart as HeartIcon } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Restaurant } from "@/types"
import { createClient as createBrowserClient } from "@/utils/supabase/client"

interface RestaurantCardProps {
  restaurant: Restaurant
}

export default function RestaurantCard({ restaurant }: RestaurantCardProps) {
  const [copied, setCopied] = useState(false)
  const [isFav, setIsFav] = useState(false)
  const [loadingFav, setLoadingFav] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // supabase ブラウザクライアントを作る
  const supabase = createBrowserClient()

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(res => {
      if (!mounted) return
      const u = res.data.user
      setUserId(u?.id ?? null)
      if (u?.id) checkFavorite(u.id)
    })
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.restaurantName])

  const checkFavorite = async (uid: string) => {
    if (!restaurant.restaurantName) return
    const { data, error } = await supabase
      // 型が未定義のテーブルに対する暫定回避（後で types を更新してください）
      .from("favorites" as any)
      .select("id")
      .eq("user_id", uid)
      .eq("restaurant_name", restaurant.restaurantName)
      .limit(1)

    if (!error && data && data.length > 0) {
      setIsFav(true)
    } else {
      setIsFav(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(restaurant.restaurantName ?? "")
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const toggleFavorite = async () => {
    if (!userId) {
      alert("ログインが必要です")
      return
    }
    setLoadingFav(true)
    try {
      if (!isFav) {
        const { error } = await supabase
          .from("favorites" as any)
          .insert([{ user_id: userId, restaurant_name: restaurant.restaurantName }])
        
        if (error) throw error
        setIsFav(true)
      } else {
        const { error } = await supabase
          .from("favorites" as any)
          .delete()
          .match({ user_id: userId, restaurant_name: restaurant.restaurantName })
        if (error) throw error
        setIsFav(false)
      }
    } catch (err: any) {
      console.error("favorite error:", err?.message || err)
    } finally {
      setLoadingFav(false)
    }
    
  }

  return (
    <div className="relative">
      {/* 安全に空文字を渡す */}
      <Link href={`/restaurants/${encodeURIComponent(restaurant.restaurantName ?? "")}`} className="absolute inset-0 z-10" />

      <div className="relative aspect-video rounded-lg overflow-hidden">
        <Image
          className="object-cover"
          src={restaurant.photoUrl}
          fill
          alt="レストラン画像"
          sizes="(max-width: 1280px) 25vw, 280px"
        />
      </div>

      <div className="flex justify-between items-center mt-2 z-20 relative gap-2">
        <p className="font-bold">{restaurant.restaurantName}</p>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleCopy} className="h-6 w-6">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-500" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFavorite}
            className="h-6 w-6"
            aria-pressed={isFav}
            disabled={loadingFav}
            title={isFav ? "お気に入り解除" : "お気に入りに追加"}
          >
            <HeartIcon
              className={`h-4 w-4 transition-colors ${isFav ? "text-red-500 fill-red-500" : "text-gray-500"}`}
            />
          </Button>
        </div>
      </div>
    </div>
  )
}
// menu-sheet.tsx

// ---------------------------------------------
// restaurant-card.tsx

// "use client"

// import { useEffect, useState } from "react"
// import Image from "next/image"
// import { Copy, Check, Heart as HeartIcon } from "lucide-react"
// import Link from "next/link"
// import { Button } from "@/components/ui/button"
// import { Restaurant } from "@/types"
// import { createClient as createBrowserClient } from "@/utils/supabase/client"

// interface RestaurantCardProps {
//   restaurant: Restaurant
// }

// export default function RestaurantCard({ restaurant }: RestaurantCardProps) {
//   const [copied, setCopied] = useState(false)
//   const [isFav, setIsFav] = useState(false)
//   const [loadingFav, setLoadingFav] = useState(false)
//   const [userId, setUserId] = useState<string | null>(null)

//   // supabase ブラウザクライアントを作る
//   const supabase = createBrowserClient()

//   useEffect(() => {
//     let mounted = true
//     supabase.auth.getUser().then(res => {
//       if (!mounted) return
//       const u = res.data.user
//       console.log("[RestaurantCard] auth.getUser ->", u?.id)
//       setUserId(u?.id ?? null)
//       if (u?.id) checkFavorite(u.id)
//     })
//     return () => { mounted = false }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [restaurant.restaurantName])

//   const checkFavorite = async (uid: string) => {
//     if (!restaurant.restaurantName) return
//     const { data, error } = await supabase
//       .from("favorites" as any)
//       .select("id")
//       .eq("user_id", uid)
//       .eq("restaurant_name", restaurant.restaurantName)
//       .limit(1)

//     if (!error && data && data.length > 0) {
//       console.log("[RestaurantCard] checkFavorite: exists")
//       setIsFav(true)
//     } else {
//       console.log("[RestaurantCard] checkFavorite: not exists")
//       setIsFav(false)
//     }
//   }

//   const handleCopy = async () => {
//     await navigator.clipboard.writeText(restaurant.restaurantName ?? "")
//     setCopied(true)
//     setTimeout(() => setCopied(false), 1500)
//   }

//   const toggleFavorite = async () => {
//     if (!userId) {
//       alert("ログインが必要です")
//       return
//     }
//     setLoadingFav(true)
//     try {
//       if (!isFav) {
//         console.log("[RestaurantCard] inserting favorite for", restaurant.restaurantName)
//         const { error } = await supabase
//           .from("favorites" as any)
//           .insert([{ user_id: userId, restaurant_name: restaurant.restaurantName }])

//         if (error) throw error
//         setIsFav(true)

//         // サイドバーへ通知
//         console.log("[RestaurantCard] dispatch favoritesChanged (added)")
//         try {
//           window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { userId } }))
//         } catch (e) { console.warn(e) }

//         // 他タブや後からマウントされるコンポーネント向けに localStorage にタイムスタンプを入れる
//         try { localStorage.setItem('favoritesLastUpdated', String(Date.now())) } catch (e) { /* noop */ }
//       } else {
//         console.log("[RestaurantCard] deleting favorite for", restaurant.restaurantName)
//         const { error } = await supabase
//           .from("favorites" as any)
//           .delete()
//           .match({ user_id: userId, restaurant_name: restaurant.restaurantName })
//         if (error) throw error
//         setIsFav(false)

//         // サイドバーへ通知
//         console.log("[RestaurantCard] dispatch favoritesChanged (deleted)")
//         try {
//           window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { userId } }))
//         } catch (e) { console.warn(e) }

//         try { localStorage.setItem('favoritesLastUpdated', String(Date.now())) } catch (e) { /* noop */ }
//       }
//     } catch (err: any) {
//       console.error("favorite error:", err?.message || err)
//     } finally {
//       setLoadingFav(false)
//     }
//   }

//   return (
//     <div className="relative">
//       {/* 安全に空文字を渡す */}
//       <Link href={`/restaurants/${encodeURIComponent(restaurant.restaurantName ?? "")}`} className="absolute inset-0 z-10" />

//       <div className="relative aspect-video rounded-lg overflow-hidden">
//         <Image
//           className="object-cover"
//           src={restaurant.photoUrl}
//           fill
//           alt="レストラン画像"
//           sizes="(max-width: 1280px) 25vw, 280px"
//         />
//       </div>

//       <div className="flex justify-between items-center mt-2 z-20 relative gap-2">
//         <p className="font-bold">{restaurant.restaurantName}</p>

//         <div className="flex items-center gap-2">
//           <Button variant="ghost" size="icon" onClick={handleCopy} className="h-6 w-6">
//             {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-500" />}
//           </Button>

//           <Button
//             variant="ghost"
//             size="icon"
//             onClick={toggleFavorite}
//             className="h-6 w-6"
//             aria-pressed={isFav}
//             disabled={loadingFav}
//             title={isFav ? "お気に入り解除" : "お気に入りに追加"}
//           >
//             <HeartIcon
//               className={`h-4 w-4 transition-colors ${isFav ? "text-red-500 fill-red-500" : "text-gray-500"}`}
//             />
//           </Button>
//         </div>
//       </div>
//     </div>
//   )
// }
