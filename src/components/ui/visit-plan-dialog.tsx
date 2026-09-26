"use client"

import { useEffect, useState } from "react"
import { CalendarPlus, CircleCheck, ExternalLink, LoaderCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { addVisitPlanAction } from "@/app/(private)/actions/visitPlanActions"
import { buildGoogleCalendarUrl } from "@/lib/calendar/google-calendar-url"
import { formatVisitDateLabel, todayInJst } from "@/lib/calendar/visit-date"
import { refreshVisitPlans } from "@/lib/calendar/visit-plans-swr"

interface VisitPlanDialogProps {
  open: boolean
  onClose: () => void
  placeId: string
  restaurantName?: string
}

// 詳細モーダルとは重ねず、詳細モーダル側が開閉を切り替える(道案内ダイアログと同じ方式)。
export default function VisitPlanDialog({
  open,
  onClose,
  placeId,
  restaurantName,
}: VisitPlanDialogProps) {
  const [date, setDate] = useState("")
  const [minDate, setMinDate] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registeredDate, setRegisteredDate] = useState<string | null>(null)

  // 開くたびに、初期値=今日(JST)・入力状態をリセットする
  useEffect(() => {
    if (!open) return
    const today = todayInJst()
    setMinDate(today)
    setDate(today)
    setError(null)
    setRegisteredDate(null)
    setIsSubmitting(false)
  }, [open])

  const name = restaurantName ?? ""

  const handleSubmit = async () => {
    if (isSubmitting || !date) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await addVisitPlanAction({ placeId, restaurantName: name, visitDate: date })
      if (!res.success) {
        setError(
          res.message === "AUTH_REQUIRED"
            ? "ログインが必要です。ログインし直してください"
            : res.message
        )
        return
      }
      setRegisteredDate(res.data.visit_date)
      await refreshVisitPlans()
    } catch (err) {
      console.error("[VisitPlanDialog] unexpected error:", err)
      setError("登録に失敗しました。時間をおいてもう一度お試しください")
    } finally {
      setIsSubmitting(false)
    }
  }

  const calendarUrl = registeredDate
    ? buildGoogleCalendarUrl({ restaurantName: name, visitDate: registeredDate, placeId })
    : null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>行く日をカレンダーに追加</DialogTitle>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>

        {registeredDate ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-semibold text-green-700">
              <CircleCheck className="h-5 w-5" />
              登録しました（{formatVisitDateLabel(registeredDate)}）
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
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button className="w-full" onClick={handleSubmit} disabled={!date || isSubmitting}>
              {isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="h-4 w-4" />
              )}
              登録する
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {registeredDate ? "閉じる" : "キャンセル"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
