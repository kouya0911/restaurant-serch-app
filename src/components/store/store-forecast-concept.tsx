import { ChefHat, Thermometer, Users } from "lucide-react"
import {
  SAMPLE_ADVICE,
  SAMPLE_POWER_KWH,
  SAMPLE_POWER_START_HOUR,
  SAMPLE_TOMORROW,
  SAMPLE_VISIT_FORECAST,
  type SampleAdviceIcon,
} from "@/lib/store/sample-forecast"

// 店長ページ右列「電力データ × 来店予測」の構想イメージ。
// 実データとはつながっていない固定のサンプルを描く。本物のデータ(左列)と区別するため、
// 点線の枠・薄い背景・「構想イメージ（サンプルデータ）」のラベルを付け、差し色は緑ではなく落ち着いた青にする。

const POWER_MAX = 5 // kWh。グラフの縦軸の上限
const POWER_LABEL_HOURS = [10, 13, 16, 19, 22]

const ADVICE_ICONS: Record<SampleAdviceIcon, React.ComponentType<{ className?: string }>> = {
  prep: ChefHat,
  aircon: Thermometer,
  staff: Users,
}

function Block({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        {aside && <span className="text-[11px] text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </div>
  )
}

// 今日の電力使用量(30分ごと)の折れ線。viewBox は 100×40 を横に引き伸ばし、線の太さは固定
function PowerChart() {
  const n = SAMPLE_POWER_KWH.length
  const points = SAMPLE_POWER_KWH.map((v, i) => `${((i / (n - 1)) * 100).toFixed(2)},${(40 - (v / POWER_MAX) * 40).toFixed(2)}`)
  const line = `M${points.join(" L")}`
  const area = `${line} L100,40 L0,40 Z`
  return (
    <div>
      <div className="relative h-24">
        <span className="absolute left-0 top-0 text-[10px] leading-none text-muted-foreground">{POWER_MAX} kWh</span>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          {[0, 20].map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} className="stroke-gray-200" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2="100" y1="40" y2="40" className="stroke-gray-300" vectorEffect="non-scaling-stroke" />
          <path d={area} className="fill-slate-500/10" />
          <path d={line} className="fill-none stroke-slate-500" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="relative mt-1 h-3 text-[10px] leading-none text-muted-foreground">
        {POWER_LABEL_HOURS.map((h) => {
          const pct = (((h - SAMPLE_POWER_START_HOUR) * 2) / (n - 1)) * 100
          return (
            <span key={h} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: `${pct}%` }}>
              {h}:00
            </span>
          )
        })}
      </div>
    </div>
  )
}

// 明日の時間帯別の来店予測(細い棒)
function VisitForecastBars() {
  const max = Math.max(...SAMPLE_VISIT_FORECAST.map((h) => h.visits))
  return (
    <div>
      <div className="flex h-14 items-end gap-1">
        {SAMPLE_VISIT_FORECAST.map((h) => (
          <div key={h.hour} className="flex h-full flex-1 items-end" title={`${h.hour}時台 ${h.visits}人`}>
            <div className="w-full rounded-sm bg-slate-400" style={{ height: `${(h.visits / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-center text-[10px] leading-none text-muted-foreground">
        {SAMPLE_VISIT_FORECAST.map((h) => (
          <span key={h.hour} className="flex-1">
            {h.hour}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function StoreForecastConcept() {
  const totalKwh = SAMPLE_POWER_KWH.reduce((sum, v) => sum + v, 0)
  const peakIndex = SAMPLE_POWER_KWH.indexOf(Math.max(...SAMPLE_POWER_KWH))
  const peakTime = `${SAMPLE_POWER_START_HOUR + Math.floor(peakIndex / 2)}:${peakIndex % 2 === 0 ? "00" : "30"}`

  return (
    <aside className="min-w-0 rounded-lg border border-dashed border-gray-300 bg-muted/40 p-4" aria-label="構想イメージ">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">電力データ × 来店予測</h2>
        <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
          構想イメージ（サンプルデータ）
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        お店の電力の使い方から来店の波を予測し、仕込みや空調に生かす機能のイメージです。
      </p>

      <div className="mt-3 space-y-3">
        <Block title="今日の電力使用量（30分ごと）" aside={`合計 ${totalKwh.toFixed(1)} kWh・ピーク ${peakTime}`}>
          <PowerChart />
        </Block>

        <Block title="明日の来店予測" aside={`先週の同じ曜日より +${SAMPLE_TOMORROW.vsLastWeekPct}%`}>
          <p className="mb-2 flex items-baseline gap-1">
            <span className="text-3xl font-semibold tabular-nums text-slate-700">{SAMPLE_TOMORROW.visits}</span>
            <span className="text-sm text-muted-foreground">人</span>
            <span className="ml-1 text-xs text-muted-foreground">
              （{SAMPLE_TOMORROW.low}〜{SAMPLE_TOMORROW.high}人）
            </span>
          </p>
          <VisitForecastBars />
        </Block>

        <Block title="おすすめ">
          <ul className="space-y-2">
            {SAMPLE_ADVICE.map((a) => {
              const Icon = ADVICE_ICONS[a.icon]
              return (
                <li key={a.icon} className="flex gap-2 text-sm">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <p>
                    <span className="font-semibold">{a.title}</span>
                    <span className="text-muted-foreground">：{a.body}</span>
                  </p>
                </li>
              )
            })}
          </ul>
        </Block>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        ※ 表示は説明用の架空の数値です。実際の電力データとはつながっていません。
      </p>
    </aside>
  )
}
