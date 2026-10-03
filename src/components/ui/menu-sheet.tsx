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
import { Check, Menu, Pencil, Star, Ticket, TicketCheck, Trash2 } from "lucide-react"
import useSWR from "swr"
import { deleteVisitPlanAction } from "@/app/(private)/actions/visitPlanActions"
import { formatVisitDateLabel, todayInJst } from "@/lib/calendar/visit-date"
import {
  formatJstClock,
  formatVisitHourLabel,
  getVerifyState,
  verifyWindow,
} from "@/lib/calendar/visit-hours"
import { VISIT_PLANS_KEY, fetchVisitPlans, refreshVisitPlans } from "@/lib/calendar/visit-plans-swr"
import { VisitPlan } from "@/types"
import VisitPlanDialog from "@/components/ui/visit-plan-dialog"
import VisitVerifyDialog from "@/components/ui/visit-verify-dialog"
import VisitReviewDialog from "@/components/ui/visit-review-dialog"
import { calcVisitPoints } from "@/lib/points/visit-points"
import { Button } from "./button"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/utils/supabase/client"
import { logout } from "@/app/(auth)/login/actions"
import LotteryModal from "@/components/ui/lottery-modal"
import { useLottery } from "@/components/ui/lottery-provider"
import RestaurantDetailModal from "@/components/ui/restaurant-detail-modal"

const UPCOMING_LIMIT = 5
const REVIEW_PENDING_LIMIT = 3
// 「行ったよ」ボタンの出し分け(認証できる時間か)を判定し直す間隔
const NOW_TICK_MS = 60 * 1000

export default function Menusheet() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [favorites, setFavorites] = useState<any[]>([])
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [selectedFavorite, setSelectedFavorite] = useState<any | null>(null)
  const [isFavDetailOpen, setIsFavDetailOpen] = useState(false)
  const { candidates, addCandidate, isCandidate } = useLottery()
  const [isLotteryOpen, setIsLotteryOpen] = useState(false)
  const [deletingPlanId, setDeletingPlanId] = useState<number | null>(null)
  const [planDeleteError, setPlanDeleteError] = useState<string | null>(null)
  // 「行ったよ」の認証コード入力ダイアログの対象(null なら閉じている)
  const [verifyTarget, setVerifyTarget] = useState<{ id: number; name: string } | null>(null)
  // 「レビューを書く」ダイアログの対象(null なら閉じている)
  const [reviewTarget, setReviewTarget] = useState<{ id: number; name: string } | null>(null)
  // 「これから行く」を全件表示するか(既定は先頭 UPCOMING_LIMIT 件だけ)
  const [showAllPlans, setShowAllPlans] = useState(false)
  // 日付・時間帯を変更する予定。閉じるアニメーション中も表示が変わらないよう、開閉は別に持つ
  const [editTarget, setEditTarget] = useState<VisitPlan | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  // 「行ったよ」を押せる時間かの判定に使う「今」。1分ごとに更新する
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  // 「これから行く」: 詳細モーダルでの登録/削除は refreshVisitPlans() (= mutate) で再取得される
  const { data: visitPlans, error: visitPlansError } = useSWR(VISIT_PLANS_KEY, fetchVisitPlans)
  const today = todayInJst()
  // 今日以降の予定に加えて、日付が変わっても来店認証の時間が残っている予定(前日の23時台など)も出す
  const isUpcoming = (p: VisitPlan) =>
    p.visit_date >= today ||
    (p.visit_hour != null && p.visited_at == null && nowMs <= verifyWindow(p.visit_date, p.visit_hour).toMs)
  // 取得エラー中は一覧の代わりにエラー文を出すので、件数も 0 扱いにする(「ほか◯件」を出さない)
  const allUpcomingPlans = visitPlansError ? [] : (visitPlans ?? []).filter(isUpcoming)
  const upcomingPlans = showAllPlans ? allUpcomingPlans : allUpcomingPlans.slice(0, UPCOMING_LIMIT)
  const hiddenPlanCount = allUpcomingPlans.length - upcomingPlans.length
  // 「レビューを書く」: 来店済みでまだレビューのない予定(過去の日付も含む)を、来店日の新しい順に数件
  const reviewPendingPlans = visitPlansError
    ? []
    : (visitPlans ?? [])
        .filter((p) => p.visited_at != null && p.review == null)
        .sort((a, b) => b.visit_date.localeCompare(a.visit_date) || b.id - a.id)
        .slice(0, REVIEW_PENDING_LIMIT)
  // 電気代還元ポイント: 取得済みの予定一覧(過去分も含む全件)から計算する。取得前・エラー時は null(「—」表示)
  const points = visitPlans && !visitPlansError ? calcVisitPoints(visitPlans) : null

  const handleDeletePlan = async (id: number) => {
    if (deletingPlanId !== null) return
    setDeletingPlanId(id)
    setPlanDeleteError(null)
    try {
      const res = await deleteVisitPlanAction(id)
      if (!res.success) {
        setPlanDeleteError(res.message)
        return
      }
      await refreshVisitPlans()
    } catch (err) {
      console.error("visit plan delete error:", err)
      setPlanDeleteError("削除に失敗しました")
    } finally {
      setDeletingPlanId(null)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      setUser(user)

      const { data, error } = await supabase
        .from("favorites" as any)
        .select("id, restaurant_name, place_id")
        .eq("user_id", user.id)
        .order("id", { ascending: false })

      if (error) console.error("favorites load error:", error)
      else setFavorites(data || [])
    }

    loadData()

    // 同一タブ内: restaurant-card側の追加/削除を即時反映
    const handleFavoritesChanged = () => {
      loadData()
    }
    window.addEventListener('favoritesChanged', handleFavoritesChanged)

    return () => {
      window.removeEventListener('favoritesChanged', handleFavoritesChanged)
    }
  }, [])

  const handleDelete = async (id: number) => {
    if (deletingId !== null) return
    setDeletingId(id)
    try {
      const { error } = await supabase
        .from("favorites" as any)
        .delete()
        .eq("id", id)

      if (error) {
        console.error("favorite delete error:", error)
        return
      }
      setFavorites((prev) => prev.filter((f) => f.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          setIsLotteryOpen(false)
          setShowAllPlans(false)
        }
      }}
    >
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

        {/* 電気代還元ポイント(来店認証・レビューから計算。保存はしない) */}
        {user && (
          <div className="mb-4">
            <p className="text-sm">
              電気代還元ポイント{" "}
              <span className="font-bold tabular-nums">{points ?? "—"}</span>
              {points != null && <span className="ml-0.5 text-xs text-gray-500">pt</span>}
            </p>
            <p className="text-xs text-gray-500">※ 電気代への還元はイメージです</p>
          </div>
        )}

        {/* お気に入りエリア */}
        <div className="flex-1 overflow-y-auto">
          <span className="font-bold text-sm mb-2 block">お気に入り</span>

          {favorites.length === 0 ? (
            <p className="text-gray-500 text-sm">まだお気に入りがありません</p>
          ) : (
            <ul className="space-y-2">
              {favorites.slice(0, 10).map((fav) => (
                <li
                  key={fav.id}
                  className="text-sm text-gray-800 border-b pb-1 border-gray-200 flex items-center justify-between gap-2 cursor-pointer"
                  onClick={() => {
                    setSelectedFavorite(fav)
                    setIsFavDetailOpen(true)
                  }}
                >
                  <span className="truncate">{fav.restaurant_name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        addCandidate({
                          id: fav.place_id,
                          restaurantName: fav.restaurant_name,
                          // favoritesは写真を保存していないため空文字。くじびきモーダルの描画では未使用
                          photoUrl: "",
                        })
                      }}
                      disabled={isCandidate(fav.place_id)}
                      aria-pressed={isCandidate(fav.place_id)}
                      title={isCandidate(fav.place_id) ? "追加済み" : "くじびきに追加"}
                    >
                      {isCandidate(fav.place_id) ? (
                        <TicketCheck className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Ticket className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(fav.id)
                      }}
                      disabled={deletingId === fav.id}
                      title="お気に入りから削除"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {favorites.length > 10 && (
            <Button variant="link" className="mt-2 text-xs text-green-600">
              もっと見る
            </Button>
          )}

          {/* これから行く(visit_plans) */}
          <span className="font-bold text-sm mt-5 mb-2 block">これから行く</span>

          {visitPlansError ? (
            <p className="text-gray-500 text-sm">予定を取得できませんでした</p>
          ) : !visitPlans ? (
            <p className="text-gray-400 text-sm">読み込み中...</p>
          ) : upcomingPlans.length === 0 ? (
            <p className="text-gray-500 text-sm">まだ予定がありません</p>
          ) : (
            <ul className="space-y-2">
              {upcomingPlans.map((plan) => {
                const isVisited = plan.visited_at != null
                // 「行ったよ」の出し分け。認証できるかの最終判断は DB(verify_visit)が行う
                const verifyState = getVerifyState(plan, nowMs, today)
                return (
                  <li
                    key={plan.id}
                    className="text-sm text-gray-800 border-b pb-1 border-gray-200 cursor-pointer"
                    onClick={() => {
                      setSelectedFavorite({ place_id: plan.place_id, restaurant_name: plan.restaurant_name })
                      setIsFavDetailOpen(true)
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {formatVisitDateLabel(plan.visit_date)}
                        <span className="mr-1 text-xs text-gray-500">{formatVisitHourLabel(plan.visit_hour)}</span>
                        {plan.restaurant_name}
                      </span>
                      {/* 来店済みの予定は変更・削除できない(DB側でも拒否される) */}
                      {!isVisited && (
                        <div className="flex shrink-0 items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditTarget(plan)
                              setIsEditOpen(true)
                            }}
                            title="日付・時間帯を変更"
                          >
                            <Pencil className="h-3.5 w-3.5 text-gray-400 hover:text-gray-700" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeletePlan(plan.id)
                            }}
                            disabled={deletingPlanId === plan.id}
                            title="予定を削除"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {isVisited && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-green-700">
                        <Check className="h-3.5 w-3.5" />
                        来店済み
                        {plan.review && (
                          <span className="ml-2 flex items-center gap-0.5 text-amber-600">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            {plan.review.rating} レビュー済み
                          </span>
                        )}
                      </p>
                    )}
                    {verifyState.kind === "open" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1 h-7 w-full text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          setVerifyTarget({ id: plan.id, name: plan.restaurant_name })
                        }}
                      >
                        行ったよ
                      </Button>
                    )}
                    {/* 当日でまだ時間前なら、「行ったよ」を押せる時間を添える */}
                    {verifyState.kind === "early" && plan.visit_date === today && (
                      <p className="mt-1 text-xs text-gray-500">
                        {formatJstClock(verifyState.fromMs)}〜{formatJstClock(verifyState.toMs)} に「行ったよ」できます
                      </p>
                    )}
                    {verifyState.kind === "ineligible" && (
                      <p
                        className="mt-1 text-xs text-amber-700"
                        title="来店認証は、最初に宣言した時刻が予定の時間帯の始まりの1時間以上前のときだけできます"
                      >
                        この時間だと来店認証ができません
                      </p>
                    )}
                    {verifyState.kind === "expired" && (
                      <p className="mt-1 text-xs text-gray-500">来店認証の時間を過ぎました</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {hiddenPlanCount > 0 && (
            <Button
              variant="link"
              className="mt-1 h-auto p-0 text-xs text-green-600"
              onClick={() => setShowAllPlans(true)}
            >
              ほか{hiddenPlanCount}件
            </Button>
          )}
          {showAllPlans && allUpcomingPlans.length > UPCOMING_LIMIT && (
            <Button
              variant="link"
              className="mt-1 h-auto p-0 text-xs text-gray-500"
              onClick={() => setShowAllPlans(false)}
            >
              たたむ
            </Button>
          )}
          {planDeleteError && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {planDeleteError}
            </p>
          )}

          {/* レビューを書く(来店済み・未レビュー)。対象がないときは欄ごと出さない */}
          {reviewPendingPlans.length > 0 && (
            <>
              <span className="font-bold text-sm mt-5 mb-2 block">レビューを書く</span>
              <ul className="space-y-2">
                {reviewPendingPlans.map((plan) => (
                  <li
                    key={plan.id}
                    className="text-sm text-gray-800 border-b pb-1 border-gray-200 cursor-pointer"
                    onClick={() => {
                      setSelectedFavorite({ place_id: plan.place_id, restaurant_name: plan.restaurant_name })
                      setIsFavDetailOpen(true)
                    }}
                  >
                    <span className="block truncate">
                      {formatVisitDateLabel(plan.visit_date)}
                      {plan.restaurant_name}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 h-7 w-full text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        setReviewTarget({ id: plan.id, name: plan.restaurant_name })
                      }}
                    >
                      <Star className="h-3.5 w-3.5" />
                      レビューを書く
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* くじびき */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setIsLotteryOpen(true)}
        >
          <Ticket className="h-4 w-4 mr-2" />
          くじびきを見る（{candidates.length}件）
        </Button>

        <LotteryModal
          isOpen={isLotteryOpen}
          onClose={() => setIsLotteryOpen(false)}
        />

        <VisitPlanDialog
          open={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          placeId={editTarget?.place_id ?? ""}
          restaurantName={editTarget?.restaurant_name}
          plan={editTarget}
        />

        <VisitVerifyDialog
          open={verifyTarget !== null}
          onClose={() => setVerifyTarget(null)}
          planId={verifyTarget?.id ?? null}
          restaurantName={verifyTarget?.name}
        />

        <VisitReviewDialog
          open={reviewTarget !== null}
          onClose={() => setReviewTarget(null)}
          planId={reviewTarget?.id ?? null}
          restaurantName={reviewTarget?.name}
        />

        <RestaurantDetailModal
          placeId={selectedFavorite?.place_id ?? ""}
          restaurantName={selectedFavorite?.restaurant_name}
          isOpen={isFavDetailOpen}
          onClose={() => setIsFavDetailOpen(false)}
        />

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
