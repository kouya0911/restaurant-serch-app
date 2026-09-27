import type { Metadata } from "next"
import { notFound } from "next/navigation"
import StoreDashboard from "@/components/store/store-dashboard"
import { getStoreStats } from "@/lib/store/stats"
import { getStoreReviews } from "@/lib/store/reviews"

// 店長ページ(ログイン不要・秘密URL)。トークンを知っている人だけが開ける。
export const dynamic = "force-dynamic"

// 検索エンジンに載せない / URL(トークン入り)を Referer で外部に送らない
export const metadata: Metadata = {
  title: "店長ページ",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [result, reviews] = await Promise.all([getStoreStats(token), getStoreReviews(token)])

  if (!result.ok) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-lg text-gray-600">{result.message}。少し待ってから再読み込みしてください。</p>
      </main>
    )
  }
  if (!result.data) notFound()

  // レビューの初回取得に失敗しても人数の表示は出す(レビュー欄は自動更新で取り直す)
  return (
    <StoreDashboard
      token={token}
      initial={result.data}
      initialReviews={reviews.ok ? reviews.data : null}
    />
  )
}
