"use client"

import useSWR from "swr"
import { Star } from "lucide-react"
import type { StoreReviews } from "@/lib/store/reviews"
import { Panel, UpdatedMark, useChangedRecently } from "@/components/store/dashboard-parts"

const REFRESH_MS = 5000
const SHOW_RECENT = 3

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
  const countChanged = useChangedRecently(data?.count)

  return (
    <Panel
      title="お客様の声"
      aside={
        data && data.count > 0 ? (
          <span className="text-xs text-muted-foreground">最近の{Math.min(SHOW_RECENT, data.recent.length)}件</span>
        ) : null
      }
    >
      {error && (
        <p role="alert" className="mb-2 text-xs text-amber-700">
          レビューを取得できませんでした。{data ? "最後に取得できた内容を表示しています。" : ""}自動で再試行します。
        </p>
      )}

      {!data ? (
        !error && <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : data.count === 0 ? (
        <p className="text-sm text-muted-foreground">まだレビューはありません</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xl font-semibold tabular-nums">
              {data.average != null ? data.average.toFixed(1) : "-"}
            </span>
            {data.average != null && <Stars value={data.average} className="h-4 w-4" />}
            <span className="text-sm text-muted-foreground">{data.count}件</span>
            <UpdatedMark show={countChanged} />
          </div>

          <ul className="mt-3 divide-y border-t">
            {data.recent.slice(0, SHOW_RECENT).map((r, i) => (
              // レビューに ID は返らない(書いた人を特定しないため)ので、並び順をキーにする
              <li key={i} className="py-2">
                <Stars value={r.rating} className="h-3.5 w-3.5" />
                {r.comment ? (
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-line break-words text-sm">{r.comment}</p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">（ひとことなし）</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}
