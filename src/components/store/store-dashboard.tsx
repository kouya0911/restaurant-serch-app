"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { formatVisitDateLabel } from "@/lib/calendar/visit-date"
import type { StoreStats, StoreStatsDay } from "@/lib/store/stats"
import type { StoreReviews } from "@/lib/store/reviews"
import StoreReviewsCard from "@/components/store/store-reviews-card"
import StoreForecastConcept from "@/components/store/store-forecast-concept"
import { Panel, UpdatedMark, useChangedRecently } from "@/components/store/dashboard-parts"

const REFRESH_MS = 5000
const WEEK_DAYS = 7

class InvalidTokenError extends Error {}

async function fetchStats(url: string): Promise<StoreStats> {
  const res = await fetch(url, { cache: "no-store" })
  if (res.status === 404) throw new InvalidTokenError("invalid token")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const MASKED_TITLE = "個人が特定されないよう、人数が少ない日は数を表示していません"

// 今日の数字1つ分。value が null のときは placeholder(人数が伏せられた日は「少数」、率が出ない日は「—」)
function Stat({
  label,
  value,
  unit,
  placeholder,
  tone = "",
}: {
  label: string
  value: number | null
  unit: string
  placeholder: "少数" | "—"
  tone?: string
}) {
  const changed = useChangedRecently(value ?? placeholder)
  return (
    <div className="min-w-0 px-4 first:pl-0 last:pr-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-baseline whitespace-nowrap">
        {value == null ? (
          <span
            className="text-2xl font-semibold text-muted-foreground"
            title={placeholder === "少数" ? MASKED_TITLE : undefined}
          >
            {placeholder}
          </span>
        ) : (
          <>
            <span className={`text-3xl font-semibold tabular-nums ${tone}`}>{value}</span>
            <span className="ml-0.5 text-sm text-muted-foreground">{unit}</span>
          </>
        )}
        <UpdatedMark show={changed} />
      </p>
    </div>
  )
}

// 今後7日の1行: 日付・細い棒・人数
function WeekRow({ day, max, isToday }: { day: StoreStatsDay; max: number; isToday: boolean }) {
  const masked = day.planned_masked || day.planned == null
  const pct = masked ? 0 : Math.round((day.planned! / max) * 100)
  return (
    <li
      className={`grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 text-sm ${isToday ? "font-semibold" : ""}`}
    >
      <span className="whitespace-nowrap">
        {formatVisitDateLabel(day.date)}
        {isToday && <span className="ml-1 text-xs font-normal text-muted-foreground">今日</span>}
      </span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/70 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-right tabular-nums">
        {masked ? (
          <span className="text-xs font-normal text-muted-foreground" title={MASKED_TITLE}>
            少数
          </span>
        ) : (
          <>
            {day.planned}
            <span className="ml-0.5 text-xs font-normal text-muted-foreground">人</span>
          </>
        )}
      </span>
    </li>
  )
}

export default function StoreDashboard({
  token,
  initial,
  initialReviews,
}: {
  token: string
  initial: StoreStats
  initialReviews: StoreReviews | null
}) {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  useEffect(() => setUpdatedAt(new Date()), []) // 初回表示(サーバーで取得済み)の時刻

  const { data, error } = useSWR<StoreStats>(`/api/store/${token}/stats`, fetchStats, {
    fallbackData: initial,
    refreshInterval: REFRESH_MS,
    revalidateOnMount: true,
    revalidateOnFocus: true,
    keepPreviousData: true,
    onSuccess: () => setUpdatedAt(new Date()),
  })

  if (error instanceof InvalidTokenError) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">このページは無効になりました。</p>
      </main>
    )
  }

  const stats = data ?? initial
  const today = stats.upcoming.find((d) => d.date === stats.today) ?? stats.upcoming[0]
  const week = stats.upcoming.slice(0, WEEK_DAYS)
  const weekMax = Math.max(1, ...week.map((d) => d.planned ?? 0))

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* ヘッダー(アプリ側のヘッダーと同じく細い下線・太字の名前) */}
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="shrink-0 text-xs text-muted-foreground">店長ページ</span>
            <h1 className="truncate text-lg font-bold">{stats.store.name}</h1>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 align-middle" />
            <span className="hidden sm:inline">自動更新中（{REFRESH_MS / 1000}秒ごと）・</span>
            {updatedAt ? `最終更新 ${updatedAt.toLocaleTimeString("ja-JP")}` : "読み込み中"}
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-5 px-4 py-5 md:px-6 lg:grid-cols-[6fr_4fr] lg:gap-6">
        {/* 左: 本物のデータ */}
        <div className="min-w-0 space-y-4">
          {error && (
            <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              通信できませんでした。最後に取得できた内容を表示しています（自動で再試行します）。
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Panel title={`今日 ${formatVisitDateLabel(stats.today)}`}>
              <div className="grid grid-cols-3 divide-x">
                <Stat
                  label="予定"
                  value={today?.planned_masked ? null : today?.planned ?? null}
                  unit="人"
                  placeholder="少数"
                />
                <Stat
                  label="来店"
                  value={today?.visited_masked ? null : today?.visited ?? null}
                  unit="人"
                  placeholder="少数"
                  tone="text-green-700"
                />
                <Stat label="来店率" value={today?.rate ?? null} unit="%" placeholder="—" tone="text-green-700" />
              </div>
            </Panel>

            <section className="rounded-lg border bg-card p-4 sm:min-w-[15rem]">
              <h2 className="text-sm font-semibold">来店認証コード</h2>
              <p className="text-xs text-muted-foreground">お客様にお伝えください</p>
              <p className="mt-2 break-all font-mono text-5xl font-semibold leading-none tracking-[0.2em]">
                {stats.store.verify_code}
              </p>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="今後7日の予定">
              <ul className="space-y-2.5">
                {week.map((d) => (
                  <WeekRow key={d.date} day={d} max={weekMax} isToday={d.date === stats.today} />
                ))}
              </ul>
            </Panel>

            <StoreReviewsCard token={token} initial={initialReviews} />
          </div>

          <p className="text-xs text-muted-foreground">
            ※ 個人が特定されないよう、人数が少ない日は「少数」と表示します（0人の日は 0 と表示）。
            お客様の氏名や利用者情報は表示されません。
          </p>
        </div>

        {/* 右: 構想イメージ(固定のサンプルデータ。実データとはつながっていない) */}
        <StoreForecastConcept />
      </main>
    </div>
  )
}
