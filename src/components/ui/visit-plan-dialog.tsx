"use client"

import { useEffect, useState } from "react"
import { CalendarPlus, CircleCheck, ExternalLink, LoaderCircle, TriangleAlert } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { addVisitPlanAction, updateVisitPlanAction } from "@/app/(private)/actions/visitPlanActions"
import { buildGoogleCalendarUrl } from "@/lib/calendar/google-calendar-url"
import { formatVisitDateLabel, todayInJst } from "@/lib/calendar/visit-date"
import {
  VISIT_HOURS,
  formatVisitHourLabel,
  isDeclaredInTime,
  visitSlotStartMs,
} from "@/lib/calendar/visit-hours"
import { refreshVisitPlans } from "@/lib/calendar/visit-plans-swr"
import { VisitPlan } from "@/types"

interface VisitPlanDialogProps {
  open: boolean
  onClose: () => void
  placeId: string
  restaurantName?: string
  // 渡すと「予定の変更」モード(日付・時間帯を変える)。省略時は新しく宣言する
  plan?: VisitPlan | null
}

// 時間帯ボタンの「すでに始まったか」を判定し直す間隔
const NOW_TICK_MS = 30 * 1000

// 詳細モーダルとは重ねず、詳細モーダル側が開閉を切り替える(道案内ダイアログと同じ方式)。
// サイドバーからは plan を渡して「予定の変更」に使う。
export default function VisitPlanDialog({
  open,
  onClose,
  placeId,
  restaurantName,
  plan,
}: VisitPlanDialogProps) {
  const isEdit = plan != null
  const [date, setDate] = useState("")
  const [hour, setHour] = useState<number | null>(null)
  const [minDate, setMinDate] = useState("")
  const [nowMs, setNowMs] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedPlan, setSavedPlan] = useState<VisitPlan | null>(null)

  // 開くたびに入力状態をリセットする。新規は今日(JST)・時間帯は未選択、変更は今の予定の値から始める
  useEffect(() => {
    if (!open) return
    const today = todayInJst()
    setMinDate(today)
    setDate(plan && plan.visit_date >= today ? plan.visit_date : today)
    setHour(plan?.visit_hour ?? null)
    setNowMs(Date.now())
    setError(null)
    setSavedPlan(null)
    setIsSubmitting(false)
    // 開いたときだけ初期化する(保存後の再取得で plan が別オブジェクトになっても「変更しました」を消さない)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 開いている間は「今」を更新し、始まった時間帯のボタンを押せなくする
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS)
    return () => clearInterval(timer)
  }, [open])

  const isStarted = (h: number) => !date || visitSlotStartMs(date, h) <= nowMs
  // 選んでいた時間帯が(日付の変更や時間の経過で)始まってしまったら、選び直してもらう
  const selectedHour = hour != null && !isStarted(hour) ? hour : null

  // 来店認証は「最初に宣言した時刻」が時間帯の始まりの1時間以上前のときだけできる。
  // 新規は今が宣言の時刻、変更は最初の宣言(created_at)のまま。保存は止めない
  const declaredAtMs = plan ? Date.parse(plan.created_at) : nowMs
  const showLateWarning = selectedHour != null && !isDeclaredInTime(declaredAtMs, date, selectedHour)

  const name = restaurantName ?? ""

  const handleSubmit = async () => {
    if (isSubmitting || !date || selectedHour == null) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = plan
        ? await updateVisitPlanAction({ id: plan.id, visitDate: date, visitHour: selectedHour })
        : await addVisitPlanAction({ placeId, restaurantName: name, visitDate: date, visitHour: selectedHour })
      if (!res.success) {
        setError(
          res.message === "AUTH_REQUIRED"
            ? "ログインが必要です。ログインし直してください"
            : res.message
        )
        return
      }
      setSavedPlan(res.data)
      await refreshVisitPlans()
    } catch (err) {
      console.error("[VisitPlanDialog] unexpected error:", err)
      setError(`${isEdit ? "変更" : "登録"}に失敗しました。時間をおいてもう一度お試しください`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Googleカレンダーは新規の登録のときだけ(変更のたびに出すと予定が重複するため)
  const calendarUrl =
    savedPlan && !isEdit
      ? buildGoogleCalendarUrl({ restaurantName: name, visitDate: savedPlan.visit_date, placeId })
      : null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "予定を変更" : "行く日をカレンダーに追加"}</DialogTitle>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>

        {savedPlan ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-semibold text-green-700">
              <CircleCheck className="h-5 w-5" />
              {isEdit ? "変更しました" : "登録しました"}（{formatVisitDateLabel(savedPlan.visit_date)}{" "}
              {formatVisitHourLabel(savedPlan.visit_hour)}）
            </p>
            {calendarUrl && (
              <Button variant="outline" className="w-full" asChild>
                <a href={calendarUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Googleカレンダーにも追加
                </a>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm font-bold" htmlFor="visit-plan-date">
              行く日
            </label>
            <input
              id="visit-plan-date"
              type="date"
              value={date}
              min={minDate}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-base"
            />

            <div role="group" aria-labelledby="visit-plan-hour-label">
              <p id="visit-plan-hour-label" className="mb-1.5 text-sm font-bold">
                行く時間帯
              </p>
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
                {VISIT_HOURS.map((h) => {
                  const selected = selectedHour === h
                  return (
                    <Button
                      key={h}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      className="h-8 px-0 text-xs"
                      disabled={isStarted(h)}
                      aria-pressed={selected}
                      onClick={() => setHour(h)}
                    >
                      {formatVisitHourLabel(h)}
                    </Button>
                  )
                })}
              </div>
            </div>

            {showLateWarning && (
              <p role="status" className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  この時間だと来店認証ができません。来店認証は、
                  {isEdit ? "最初に宣言した時刻" : "宣言"}が予定の時間帯の始まりの1時間以上前のときだけできます（保存はできます）
                </span>
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={!date || selectedHour == null || isSubmitting}
            >
              {isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="h-4 w-4" />
              )}
              {isEdit ? "変更する" : "登録する"}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {savedPlan ? "閉じる" : "キャンセル"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
