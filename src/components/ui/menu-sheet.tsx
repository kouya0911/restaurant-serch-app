// import {
//   Sheet,
//   SheetContent,
//   SheetDescription,
//   SheetFooter,
//   SheetHeader,
//   SheetTitle,
//   SheetTrigger,
// } from "@/components/ui/sheet"
// import { Menu, Bookmark, Heart } from "lucide-react"
// import { Button } from "./button"
// import Link from "next/link"
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
// import { createClient } from "@/utils/supabase/server"
// import { redirect } from "next/navigation"
// import { logout } from "@/app/(auth)/login/actions"


// export default async function Menusheet() {

//   const supabase = await createClient();
//   const { data: { user } } = await supabase.auth.getUser()

//   if(!user){
//     redirect("/login")
//   }

//   const { avatar_url, full_name } = user.user_metadata;

//   return (
//     <Sheet>
//         <SheetTrigger asChild>
//             <Button variant="ghost" size="icon">
//                 <Menu />
//             </Button>
//         </SheetTrigger>
//         <SheetContent side="left" className="w-72 p-6">
//             <SheetHeader className="sr-only">
//                 <SheetTitle>メニュー情報</SheetTitle>
//                 <SheetDescription>
//                     ユーザー情報とメニュー情報を表示
//                 </SheetDescription>
//             </SheetHeader>

//             {/* ユーザー情報エリア */}
//             <div className="flex items-center gap-5">
//               <Avatar>
//                 <AvatarImage src={avatar_url} />
//                 <AvatarFallback>ユーザー名</AvatarFallback>
//               </Avatar>
//               <div>
//                 <div className="font-bold">{full_name}</div>
//                 <div>
//                   <Link href={"#"} className="text-green-500 text-xs">アカウントを管理する</Link>
//                 </div>
//               </div>
//             </div>

//             {/* お気に入りエリア */}
//             <span className="font-bold">お気に入り</span>
                
//             <SheetFooter>
//               <form>
//                 <Button className="w-full" formAction={logout}>ログアウト</Button>
//               </form>
//             </SheetFooter>

//         </SheetContent>
//     </Sheet>
//   )
// }



// import {
//   Sheet,
//   SheetContent,
//   SheetDescription,
//   SheetFooter,
//   SheetHeader,
//   SheetTitle,
//   SheetTrigger,
// } from "@/components/ui/sheet"
// import { Menu } from "lucide-react"
// import { Button } from "./button"
// import Link from "next/link"
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
// import { createClient } from "@/utils/supabase/server"
// import { redirect } from "next/navigation"
// import { logout } from "@/app/(auth)/login/actions"

// export default async function Menusheet() {
//   const supabase = await createClient();
//   const { data: { user } } = await supabase.auth.getUser()

//   if(!user){
//     redirect("/login")
//   }

//   const { avatar_url, full_name } = user.user_metadata ?? {}

//   // サーバー側でお気に入りを取得（最新10件）
//   const { data: favs } = await supabase
//     .from("favorites" as any) // 型が無い場合は暫定で any
//     .select("id, restaurant_name, created_at")
//     .eq("user_id", user.id)
//     .order("created_at", { ascending: false })
//     .limit(10)

//   const favorites = favs ?? []

//   return (
//     <Sheet>
//       <SheetTrigger asChild>
//         <Button variant="ghost" size="icon">
//           <Menu />
//         </Button>
//       </SheetTrigger>

//       <SheetContent side="left" className="w-72 p-6 flex flex-col h-full">
//         <SheetHeader className="sr-only">
//           <SheetTitle>メニュー情報</SheetTitle>
//           <SheetDescription>ユーザー情報とメニュー情報を表示</SheetDescription>
//         </SheetHeader>

//         <div className="flex items-center gap-5 mb-4">
//           <Avatar>
//             <AvatarImage src={avatar_url} />
//             <AvatarFallback>ユーザー名</AvatarFallback>
//           </Avatar>
//           <div>
//             <div className="font-bold">{full_name}</div>
//             <div>
//               <Link href={"#"} className="text-green-500 text-xs">アカウントを管理する</Link>
//             </div>
//           </div>
//         </div>

//         <div className="mb-2">
//           <span className="font-bold">お気に入り</span>
//         </div>

//         <div className="flex-1 overflow-y-auto pr-1">
//           {favorites.length === 0 ? (
//             <div className="text-sm text-muted-foreground">お気に入りがまだありません。</div>
//           ) : (
//             <ul className="flex flex-col gap-2">
//               {favorites.map((f: any) => (
//                 <li key={f.id} className="p-2 rounded border border-gray-100 flex items-center justify-between">
//                   <div className="text-sm truncate">{f.restaurant_name}</div>
//                   <div className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString()}</div>
//                 </li>
//               ))}
//             </ul>
//           )}
//         </div>

//         <div className="mt-3">
//           <Link href="/favorites" className="text-sm text-blue-600">もっと見る</Link>
//         </div>

//         <SheetFooter className="mt-4">
//           <form>
//             <Button className="w-full" formAction={logout}>ログアウト</Button>
//           </form>
//         </SheetFooter>
//       </SheetContent>
//     </Sheet>
//   )
// }

"use client"

import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Menu } from "lucide-react"
import { Button } from "./button"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/utils/supabase/client"
import { logout } from "@/app/(auth)/login/actions"

export default function Menusheet() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [favorites, setFavorites] = useState<any[]>([])

  useEffect(() => {
    const loadData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      setUser(user)

      const { data, error } = await supabase
        .from("favorites" as any)
        .select("restaurant_name")
        .eq("user_id", user.id)
        .order("id", { ascending: false })

      if (error) console.error("favorites load error:", error)
      else setFavorites(data || [])
    }

    loadData()

    const channel = supabase
      .channel('favorites')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'favorites', filter: `user_id=eq.${user?.id}` },
        payload => {
          // データが変わったら再取得
          loadData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-6 flex flex-col">
        <SheetHeader className="sr-only">
          <SheetTitle>メニュー情報</SheetTitle>
        </SheetHeader>

        {/* ユーザー情報 */}
        {user && (
          <div className="flex items-center gap-5 mb-4">
            <Avatar>
              <AvatarImage src={user.user_metadata.avatar_url} />
              <AvatarFallback>{user.user_metadata.full_name}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-bold">{user.user_metadata.full_name}</div>
              <Link href={"#"} className="text-green-500 text-xs">
                アカウントを管理する
              </Link>
            </div>
          </div>
        )}

        {/* お気に入りエリア */}
        <div className="flex-1 overflow-y-auto">
          <span className="font-bold text-sm mb-2 block">お気に入り</span>

          {favorites.length === 0 ? (
            <p className="text-gray-500 text-sm">まだお気に入りがありません</p>
          ) : (
            <ul className="space-y-2">
              {favorites.slice(0, 10).map((fav, i) => (
                <li
                  key={i}
                  className="text-sm text-gray-800 border-b pb-1 border-gray-200"
                >
                  {fav.restaurant_name}
                </li>
              ))}
            </ul>
          )}

          {favorites.length > 10 && (
            <Button variant="link" className="mt-2 text-xs text-green-600">
              もっと見る
            </Button>
          )}
        </div>

        {/* 下部固定ログアウト */}
        <SheetFooter className="mt-auto">
          <form>
            <Button className="w-full" formAction={logout}>
              ログアウト
            </Button>
          </form>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// menu-sheet.tsx
// "use client"

// import { useEffect, useState } from "react"
// import {
//   Sheet,
//   SheetContent,
//   SheetFooter,
//   SheetHeader,
//   SheetTitle,
//   SheetTrigger,
// } from "@/components/ui/sheet"
// import { Menu } from "lucide-react"
// import { Button } from "./button"
// import Link from "next/link"
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
// import { createClient } from "@/utils/supabase/client"
// import { logout } from "@/app/(auth)/login/actions"

// export default function Menusheet() {
//   const supabase = createClient()
//   const [user, setUser] = useState<any>(null)
//   const [favorites, setFavorites] = useState<any[]>([])
//   const [loading, setLoading] = useState(false)

//   // お気に入り取得を切り出す（デバッグログあり）
//   const loadFavorites = async () => {
//     console.log("[MenuSheet] loadFavorites start")
//     setLoading(true)
//     try {
//       const {
//         data: { user: currentUser },
//       } = await supabase.auth.getUser()
//       console.log("[MenuSheet] auth.getUser ->", currentUser?.id)
//       if (!currentUser) {
//         setUser(null)
//         setFavorites([])
//         setLoading(false)
//         return
//       }

//       setUser(currentUser)

//       const { data, error } = await supabase
//         .from("favorites" as any)
//         .select("restaurant_name")
//         .eq("user_id", currentUser.id)
//         .order("id", { ascending: false })

//       if (error) {
//         console.error("[MenuSheet] favorites load error:", error)
//       } else {
//         console.log("[MenuSheet] favorites loaded:", data)
//         setFavorites(data || [])
//       }
//     } catch (e) {
//       console.error("[MenuSheet] loadFavorites unexpected error:", e)
//     } finally {
//       setLoading(false)
//       console.log("[MenuSheet] loadFavorites end")
//     }
//   }

//   useEffect(() => {
//     let mounted = true
//     console.log("[MenuSheet] mounted")

//     // 初回ロード
//     loadFavorites()

//     // window カスタムイベントで同期（カード側が発火します）
//     const favHandler = (e: Event) => {
//       console.log("[MenuSheet] received favoritesChanged event:", e)
//       if (!mounted) return
//       loadFavorites()
//     }

//     // storage イベントも監視（他タブや localStorage トリガ対策）
//     const storageHandler = (ev: StorageEvent) => {
//       if (ev.key === "favoritesLastUpdated") {
//         console.log("[MenuSheet] storage event favoritesLastUpdated:", ev.newValue)
//         if (!mounted) return
//         loadFavorites()
//       }
//     }

//     window.addEventListener("favoritesChanged", favHandler as EventListener)
//     window.addEventListener("storage", storageHandler as EventListener)

//     return () => {
//       mounted = false
//       window.removeEventListener("favoritesChanged", favHandler as EventListener)
//       window.removeEventListener("storage", storageHandler as EventListener)
//       console.log("[MenuSheet] unmounted, listeners removed")
//     }
//     // [] にして初回だけ登録
//   }, [])

//   return (
//     <Sheet>
//       <SheetTrigger asChild>
//         <Button variant="ghost" size="icon">
//           <Menu />
//         </Button>
//       </SheetTrigger>
//       <SheetContent side="left" className="w-72 p-6 flex flex-col">
//         <SheetHeader className="sr-only">
//           <SheetTitle>メニュー情報</SheetTitle>
//         </SheetHeader>

//         {/* ユーザー情報 */}
//         {user && (
//           <div className="flex items-center gap-5 mb-4">
//             <Avatar>
//               <AvatarImage src={user.user_metadata?.avatar_url} />
//               <AvatarFallback>{user.user_metadata?.full_name}</AvatarFallback>
//             </Avatar>
//             <div>
//               <div className="font-bold">{user.user_metadata?.full_name}</div>
//               <Link href={"#"} className="text-green-500 text-xs">
//                 アカウントを管理する
//               </Link>
//             </div>
//           </div>
//         )}

//         {/* お気に入りエリア */}
//         <div className="flex-1 overflow-y-auto">
//           <div className="flex items-center justify-between">
//             <span className="font-bold text-sm mb-2 block">お気に入り</span>
//             {/* デバッグ用：手動再取得ボタン */}
//             <Button size="sm" variant="ghost" onClick={loadFavorites}>再取得</Button>
//           </div>

//           {loading && <p className="text-sm text-gray-500">読み込み中…</p>}

//           {favorites.length === 0 ? (
//             <p className="text-gray-500 text-sm">まだお気に入りがありません</p>
//           ) : (
//             <ul className="space-y-2">
//               {favorites.slice(0, 10).map((fav, i) => (
//                 <li
//                   key={i}
//                   className="text-sm text-gray-800 border-b pb-1 border-gray-200"
//                 >
//                   {fav.restaurant_name}
//                 </li>
//               ))}
//             </ul>
//           )}

//           {favorites.length > 10 && (
//             <Button variant="link" className="mt-2 text-xs text-green-600">
//               もっと見る
//             </Button>
//           )}
//         </div>

//         {/* 下部固定ログアウト */}
//         <SheetFooter className="mt-auto">
//           <form>
//             <Button className="w-full" formAction={logout}>
//               ログアウト
//             </Button>
//           </form>
//         </SheetFooter>
//       </SheetContent>
//     </Sheet>
//   )
// }
