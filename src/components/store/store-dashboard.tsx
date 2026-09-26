"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { formatVisitDateLabel } from "@/lib/calendar/visit-date"
import type { StoreStats, StoreStatsDay } from "@/lib/store/stats"

const REFRESH_MS = 5000

class InvalidTokenError extends Error {}

async function fetchStats(url: string): Promise<StoreStats> {
  const res = await fetch(url, { cache: "no-store" })
  if (res.status === 404) throw new InvalidTokenError("invalid token")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// 人数が少なく伏せられた値は「少数」と表示する(閾値の値そのものは画面に出さない)
function CountText({ value, masked }: { value: number | null; masked: boolean }) {
  if (masked || value == null) {
    return (
      <span title="個人が特定されないよう、人数が少ない日は数を表示していません">少数</span>
    )
  }
  return <>{value}</>
}

// 値が変わった瞬間だけ true を返す(数字が増えたことを目で追えるようにする)
function useFlash(value: number | null): boolean {
  const prev = useRef(value)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 1600)
    return () => clearTimeout(t)
  }, [value])
  return flash
}

function HeroNumber({
  label,
  value,
  masked,
  tone,
}: {
  label: string
  value: number | null
  masked: boolean
  tone: "blue" | "green"
}) {
  const flash = useFlash(masked ? null : value)
  const colors =
    tone === "green"
      ? "border-green-300 bg-green-50 text-green-700"
      : "border-blue-200 bg-blue-50 text-blue-700"
  return (
    <div
      className={`rounded-2xl border-2 p-5 text-center transition-all duration-500 md:p-8 ${colors} ${
        flash ? "scale-[1.03] ring-8 ring-yellow-300" : ""
      }`}
    >
      <p className="text-base font-semibold md:text-2xl">{label}</p>
      <p className="mt-2 flex items-baseline justify-center gap-2 font-bold leading-none">
        <span className={masked || value == null ? "text-6xl md:text-8xl" : "text-7xl md:text-[9rem]"}>
          <CountText value={value} masked={masked} />
        </span>
        {!(masked || value == null) && <span className="text-2xl md:text-4xl">人</span>}
      </p>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm md:p-6">
      <h2 className="mb-4 text-lg font-bold md:text-xl">{title}</h2>
      {children}
    </section>
  )
}

function UpcomingRow({ day, max, isToday }: { day: StoreStatsDay; max: number; isToday: boolean }) {
  const masked = day.planned_masked || day.planned == null
  const pct = masked ? 6 : Math.max(day.planned! > 0 ? 3 : 0, Math.round((day.planned! / max) * 100))
  return (
    <li
      className={`grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 rounded-lg px-2 py-1.5 md:grid-cols-[6.5rem_1fr_4rem] ${
        isToday ? "bg-amber-50 font-bold" : ""
      }`}
    >
      <span className="whitespace-nowrap text-sm md:text-base">
        {formatVisitDateLabel(day.date)}
        {isToday && <span className="ml-1 text-xs text-amber-700">今日</span>}
      </span>
      <div className="h-4 overflow-hidden rounded bg-gray-100">
        <div
          className={`h-full rounded transition-all duration-500 ${masked ? "bg-gray-300" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-right text-sm md:text-base">
        <CountText value={day.planned} masked={masked} />
        {!masked && <span className="text-xs font-normal text-gray-500">人</span>}
      </span>
    </li>
  )
}

function PastRow({ day, max }: { day: StoreStatsDay; max: number }) {
  const plannedMasked = day.planned_masked || day.planned == null
  const visitedMasked = day.visited_masked || day.visited == null
  const plannedPct = plannedMasked ? 0 : Math.round((day.planned! / max) * 100)
  const visitedPct = plannedMasked || visitedMasked ? 0 : Math.round((day.visited! / max) * 100)
  return (
    <li className="rounded-lg px-2 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold md:text-base">{formatVisitDateLabel(day.date)}</span>
        <span className="text-sm md:text-base">
          予定 <CountText value={day.planned} masked={plannedMasked} />
          {!plannedMasked && "人"}
          <span className="mx-1.5 text-gray-400">→</span>
          来店 <span className="font-bold text-green-700">
            <CountText value={day.visited} masked={plannedMasked || visitedMasked} />
          </span>
          {!(plannedMasked || visitedMasked) && "人"}
          {day.rate != null && (
            <span className="ml-2 font-bold text-green-700">（来店率 {day.rate}%）</span>
          )}
        </span>
      </div>
      {!plannedMasked && (
        <div className="relative mt-1.5 h-3 overflow-hidden rounded bg-gray-100">
          <div className="absolute inset-y-0 left-0 rounded bg-blue-300" style={{ width: `${plannedPct}%` }} />
          <div className="absolute inset-y-0 left-0 rounded bg-green-500" style={{ width: `${visitedPct}%` }} />
        </div>
      )}
    </li>
  )
}

export default function StoreDashboard({ token, initial }: { token: string; initial: StoreStats }) {
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
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-lg text-gray-600">このページは無効になりました。</p>
      </main>
    )
  }

  const stats = data ?? initial
  const today = stats.upcoming.find((d) => d.date === stats.today) ?? stats.upcoming[0]
  const upcomingMax = Math.max(1, ...stats.upcoming.map((d) => d.planned ?? 0))
  const pastMax = Math.max(1, ...stats.past.map((d) => d.planned ?? 0))

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:space-y-8 md:py-10">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">店長ページ</p>
            <h1 className="break-words text-3xl font-bold md:text-5xl">{stats.store.name}</h1>
          </div>
          <p className="text-xs text-gray-500 md:text-sm" aria-live="polite">
            <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-green-500 align-middle" />
            自動更新中（{REFRESH_MS / 1000}秒ごと）
            {updatedAt && <> ・ 最終更新 {updatedAt.toLocaleTimeString("ja-JP")}</>}
          </p>
        </header>

        {error && (
          <p role="alert" className="rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-800">
            通信できませんでした。最後に取得できた内容を表示しています（自動で再試行します）。
          </p>
        )}

        {/* 今日(デモの主役) */}
        <section aria-label="今日の状況">
          <h2 className="mb-3 text-lg font-bold md:text-2xl">
            今日（{formatVisitDateLabel(stats.today)}）
          </h2>
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <HeroNumber
              label="行く予定の人"
              value={today?.planned ?? null}
              masked={today?.planned_masked ?? false}
              tone="blue"
            />
            <HeroNumber
              label="来店した人"
              value={today?.visited ?? null}
              masked={today?.visited_masked ?? false}
              tone="green"
            />
          </div>
          {today?.rate != null && (
            <p className="mt-3 text-center text-xl font-bold text-green-700 md:text-3xl">
              来店率 {today.rate}%
            </p>
          )}
        </section>

        {/* 認証コード */}
        <section className="rounded-2xl border-2 border-dashed border-gray-400 bg-white p-5 text-center md:p-6">
          <p className="text-sm font-semibold text-gray-600 md:text-xl">
            来店認証コード（お客様にお伝えください）
          </p>
          <p className="mt-2 break-all font-mono text-6xl font-bold tracking-[0.25em] md:text-7xl md:leading-none">
            {stats.store.verify_code}
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
          <Card title="今後14日間の「行く予定」">
            <ul className="space-y-0.5">
              {stats.upcoming.map((d) => (
                <UpcomingRow key={d.date} day={d} max={upcomingMax} isToday={d.date === stats.today} />
              ))}
            </ul>
          </Card>

          <Card title="過去14日間：予定 → 来店">
            {stats.past.length === 0 ? (
              <p className="text-gray-500">まだ記録がありません。</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {stats.past.map((d) => (
                    <PastRow key={d.date} day={d} max={pastMax} />
                  ))}
                </ul>
                <p className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                  <span className="inline-block h-2.5 w-5 rounded bg-blue-300" /> 予定
                  <span className="inline-block h-2.5 w-5 rounded bg-green-500" /> 来店
                </p>
              </>
            )}
          </Card>
        </div>

        <p className="text-xs text-gray-500">
          ※ 個人が特定されないよう、人数が少ない日は数を「少数」と表示します（0人の日はそのまま 0 と表示）。
          お客様の氏名や利用者情報は表示されません。
        </p>
      </div>
    </main>
  )
}
