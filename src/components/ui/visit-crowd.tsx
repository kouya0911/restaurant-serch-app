"use client"

// 混雑表示: 店・時間帯ごとの「アプリで行く予定の人数」(来店宣言の数。来店認証は使わない)。
// カードは表示されると自分の店IDを Provider に登録し、Provider が同じタイミングで集まった店を
// まとめて1回だけ問い合わせる(店ごとには問い合わせない)。今日(日本時間)の分だけを扱う。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Users } from "lucide-react"
import { VISIT_CROWD_KEY, fetchVisitCrowd } from "@/lib/calendar/visit-crowd-swr"
import { VISIT_HOURS, formatVisitHourLabel, jstDateAndHour } from "@/lib/calendar/visit-hours"
import { cn } from "@/lib/utils"

// visit_plan_counts() が受け付ける店の数の上限(docs/sql/010_visit_plan_counts.sql と同じ)
const MAX_PLACES = 100
// カードの登録をまとめる待ち時間。同じ描画で表示されたカードを1回の問い合わせにする
const REGISTER_BATCH_MS = 50
// ほかの人の宣言を反映するため、表示中はこの間隔でも取り直す
const REFRESH_INTERVAL_MS = 5 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
// 3人以上で濃い色(1〜2人は薄い色)
const BUSY_THRESHOLD = 3
// 棒の高さの基準の最小値(1人だけでも棒が振り切れないように)
const MIN_BAR_SCALE = 4

interface VisitCrowdContextValue {
  register: (placeId: string) => () => void
  /** 店ID → (時 → 人数)。取得前・取得失敗は null */
  counts: Map<string, Map<number, number>> | null
  currentHour: number
}

const VisitCrowdContext = createContext<VisitCrowdContextValue | null>(null)

export function VisitCrowdProvider({ children }: { children: React.ReactNode }) {
  // 表示中の店ID → 登録しているカード・モーダルの数
  const refCounts = useRef(new Map<string, number>())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [placeIds, setPlaceIds] = useState<string[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())

  // 時台が変わったら「今」を更新する(キーに時を含めるので、そのときに取り直しにもなる)
  useEffect(() => {
    const msToNextHour = HOUR_MS - (Date.now() % HOUR_MS) + 1000
    const timer = setTimeout(() => setNowMs(Date.now()), msToNextHour)
    return () => clearTimeout(timer)
  }, [nowMs])

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current != null) return
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null
      const next = Array.from(refCounts.current.keys()).sort().slice(0, MAX_PLACES)
      setPlaceIds((prev) => (prev.join(",") === next.join(",") ? prev : next))
    }, REGISTER_BATCH_MS)
  }, [])

  useEffect(() => () => {
    if (flushTimer.current != null) clearTimeout(flushTimer.current)
  }, [])

  const register = useCallback(
    (placeId: string) => {
      if (!placeId) return () => {}
      const map = refCounts.current
      map.set(placeId, (map.get(placeId) ?? 0) + 1)
      scheduleFlush()
      return () => {
        const n = (map.get(placeId) ?? 1) - 1
        if (n <= 0) map.delete(placeId)
        else map.set(placeId, n)
        scheduleFlush()
      }
    },
    [scheduleFlush]
  )

  const { date: today, hour: currentHour } = jstDateAndHour(nowMs)
  const { data } = useSWR(
    placeIds.length > 0 ? [VISIT_CROWD_KEY, today, currentHour, placeIds.join(",")] : null,
    ([, date, , ids]: [string, string, number, string]) => fetchVisitCrowd(ids.split(","), date),
    { refreshInterval: REFRESH_INTERVAL_MS }
  )

  const counts = useMemo(() => {
    if (!data) return null
    const map = new Map<string, Map<number, number>>()
    for (const row of data) {
      if (!map.has(row.place_id)) map.set(row.place_id, new Map())
      map.get(row.place_id)!.set(row.visit_hour, row.planned)
    }
    return map
  }, [data])

  const value = useMemo(() => ({ register, counts, currentHour }), [register, counts, currentHour])

  return <VisitCrowdContext.Provider value={value}>{children}</VisitCrowdContext.Provider>
}

/**
 * その店の今日の時間帯ごとの人数。Provider の外(旧ルートなど)では null を返す(何も表示しない)。
 * byHour は取得前・取得失敗なら null。
 */
function useVisitCrowd(placeId: string) {
  const ctx = useContext(VisitCrowdContext)
  const register = ctx?.register

  useEffect(() => {
    if (!register) return
    return register(placeId)
  }, [register, placeId])

  if (!ctx) return null
  return {
    byHour: ctx.counts ? ctx.counts.get(placeId) ?? new Map<number, number>() : null,
    currentHour: ctx.currentHour,
  }
}

function crowdLabelClass(planned: number) {
  return planned >= BUSY_THRESHOLD
    ? "bg-orange-500 text-white"
    : "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200"
}

/** カード用: 今の時間帯と次の時間帯の予定人数(0人なら出さない)。例: 「19時台 4人予定」 */
export function VisitCrowdBadges({ placeId }: { placeId: string }) {
  const crowd = useVisitCrowd(placeId)
  if (!crowd?.byHour) return null

  // 次の時台は今日の分だけ(23時台の次は翌日になるので出さない)
  const hours = crowd.currentHour < 23 ? [crowd.currentHour, crowd.currentHour + 1] : [crowd.currentHour]
  const items = hours
    .map((h) => ({ hour: h, planned: crowd.byHour!.get(h) ?? 0 }))
    .filter((x) => x.planned > 0)
  if (items.length === 0) return null

  return (
    <div className="mt-1 flex flex-wrap gap-1" title="アプリで行く予定の人数です（実際の混雑とは異なる場合があります）">
      {items.map((x) => (
        <span
          key={x.hour}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none",
            crowdLabelClass(x.planned)
          )}
        >
          <Users className="h-3 w-3" aria-hidden />
          {formatVisitHourLabel(x.hour)} {x.planned}人予定
        </span>
      ))}
    </div>
  )
}

/** 詳細モーダル用: 今日の時間帯ごとの予定人数を細い棒で */
export function VisitCrowdBars({ placeId }: { placeId: string }) {
  const crowd = useVisitCrowd(placeId)
  if (!crowd?.byHour) return null

  const byHour = crowd.byHour
  const rows = VISIT_HOURS.map((h) => ({ hour: h, planned: byHour.get(h) ?? 0 }))
  const total = rows.reduce((sum, r) => sum + r.planned, 0)
  const scale = Math.max(MIN_BAR_SCALE, ...rows.map((r) => r.planned))

  return (
    <div>
      <p className="mb-1 text-sm font-bold">今日の行く予定</p>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">今日はまだ行く予定の人はいません</p>
      ) : (
        <>
          {/* 読み上げ用: 人数のある時間帯だけ */}
          <ul className="sr-only">
            {rows
              .filter((r) => r.planned > 0)
              .map((r) => (
                <li key={r.hour}>
                  {formatVisitHourLabel(r.hour)} {r.planned}人
                </li>
              ))}
          </ul>
          <div aria-hidden className="flex h-16 items-end gap-0.5">
            {rows.map((r) => {
              const isNow = r.hour === crowd.currentHour
              const isPast = r.hour < crowd.currentHour
              return (
                <div key={r.hour} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                  {r.planned > 0 && (
                    <span className={cn("text-[10px] leading-none", isNow ? "font-bold text-orange-700" : "text-muted-foreground")}>
                      {r.planned}
                    </span>
                  )}
                  <div
                    className={cn(
                      "w-full max-w-3 rounded-sm",
                      r.planned === 0 ? "bg-gray-200" : isNow ? "bg-orange-500" : "bg-orange-300",
                      isPast && "opacity-40"
                    )}
                    style={{ height: r.planned === 0 ? 2 : `${Math.max(8, (r.planned / scale) * 100) * 0.75}%` }}
                  />
                </div>
              )
            })}
          </div>
          <div aria-hidden className="mt-0.5 flex gap-0.5">
            {rows.map((r) => (
              <span
                key={r.hour}
                className={cn(
                  "flex-1 text-center text-[10px] leading-none text-muted-foreground",
                  r.hour === crowd.currentHour && "font-bold text-orange-700"
                )}
              >
                {r.hour % 2 === 0 || r.hour === crowd.currentHour ? r.hour : ""}
              </span>
            ))}
          </div>
        </>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        アプリで行く予定の人数です（実際の混雑とは異なる場合があります）
      </p>
    </div>
  )
}
