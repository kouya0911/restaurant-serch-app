"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Star } from "lucide-react"
import type { StoreReviews } from "@/lib/store/reviews"

const REFRESH_MS = 5000
const FLASH_MS = 2500

async function fetchReviews(url: string): Promise<StoreReviews> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// 星5つ。value(小数可)を四捨五入した数だけ塗る
function Stars({ value, className }: { value: number; className: string }) {
  const filled = Math.round(value)
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`星${value}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${className} ${n <= filled ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
        />
      ))}
    </span>
  )
}

// 件数が増えたら、増えた分(新しい順の先頭から)を数秒だけハイライトする
function useNewReviewFlash(count: number | undefined): number {
  const prev = useRef(count)
  const [flashCount, setFlashCount] = useState(0)
  useEffect(() => {
    if (count == null) return
    const before = prev.current
    prev.current = count
    if (before == null || count <= before) {
      setFlashCount(0) // デモのリセット等で減ったときは消す
      return
    }
    setFlashCount(count - before)
    const t = setTimeout(() => setFlashCount(0), FLASH_MS)
    return () => clearTimeout(t)
  }, [count])
  return flashCount
}

// 店長ページの「お客様の声」。人数の集計(store-dashboard)とは別の API を同じ間隔で自動更新する。
export default function StoreReviewsCard({
  token,
  initial,
}: {
  token: string
  initial: StoreReviews | null // サーバーでの初回取得に失敗したら null(自動更新で取り直す)
}) {
  const { data, error } = useSWR<StoreReviews>(`/api/store/${token}/reviews`, fetchReviews, {
    fallbackData: initial ?? undefined,
    refreshInterval: REFRESH_MS,
    revalidateOnMount: true,
    revalidateOnFocus: true,
    keepPreviousData: true,
  })
  const flashCount = useNewReviewFlash(data?.count)

  return (
    <section
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-all duration-500 md:p-6 ${
        flashCount > 0 ? "ring-8 ring-yellow-300" : ""
      }`}
      aria-label="お客様の声"
    >
      <h2 className="mb-4 text-lg font-bold md:text-xl">お客様の声</h2>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-amber-100 px-3 py-1.5 text-sm text-amber-800">
          レビューを取得できませんでした。{data ? "最後に取得できた内容を表示しています。" : ""}自動で再試行します。
        </p>
      )}

      {!data ? (
        !error && <p className="text-gray-500">読み込み中...</p>
      ) : data.count === 0 ? (
        <p className="text-gray-500">まだレビューはありません。</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[14rem_1fr] md:gap-8">
          {/* 平均と件数 */}
          <div className="text-center md:border-r md:pr-8">
            <p className="text-6xl font-bold leading-none text-amber-600 md:text-7xl">
              {data.average != null ? data.average.toFixed(1) : "-"}
            </p>
            {data.average != null && (
              <div className="mt-2">
                <Stars value={data.average} className="h-6 w-6 md:h-7 md:w-7" />
              </div>
            )}
            <p className="mt-2 text-base text-gray-600 md:text-lg">{data.count}件のレビュー</p>
          </div>

          {/* 最近のレビュー(新しい順) */}
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-500">最近のレビュー</p>
            <ul className="space-y-2">
              {data.recent.map((r, i) => (
                // レビューに ID は返らない(書いた人を特定しないため)ので、並び順をキーにする
                <li
                  key={i}
                  className={`rounded-lg border px-3 py-2 transition-colors duration-500 ${
                    i < flashCount ? "border-yellow-300 bg-yellow-50" : "border-gray-100"
                  }`}
                >
                  <Stars value={r.rating} className="h-4 w-4 md:h-5 md:w-5" />
                  {r.comment ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-base md:text-lg">{r.comment}</p>
                  ) : (
                    <p className="mt-1 text-sm text-gray-400">（ひとことなし）</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}
