"use client"

import { useEffect, useState } from "react"
import { CircleCheck, LoaderCircle, MapPinCheck } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { verifyVisitAction } from "@/app/(private)/actions/visitPlanActions"
import { refreshVisitPlans } from "@/lib/calendar/visit-plans-swr"

interface VisitVerifyDialogProps {
  open: boolean
  onClose: () => void
  planId: number | null
  restaurantName?: string
}

// 「行ったよ」の認証コード入力。コードの照合はサーバー(DB関数)で行い、正解はここには届かない。
export default function VisitVerifyDialog({
  open,
  onClose,
  planId,
  restaurantName,
}: VisitVerifyDialogProps) {
  const [code, setCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // 開くたびに入力状態をリセットする
  useEffect(() => {
    if (!open) return
    setCode("")
    setError(null)
    setDone(false)
    setIsSubmitting(false)
  }, [open])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (isSubmitting || planId == null) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await verifyVisitAction(planId, code)
      if (!res.success) {
        setError(
          res.message === "AUTH_REQUIRED"
            ? "ログインが必要です。ログインし直してください"
            : res.message
        )
        // すでに認証済み・当日でない等でも一覧は最新にしておく
        await refreshVisitPlans()
        return
      }
      setDone(true)
      await refreshVisitPlans()
    } catch (err) {
      console.error("[VisitVerifyDialog] unexpected error:", err)
      setError("認証に失敗しました。時間をおいてもう一度お試しください")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>行ったよ！</DialogTitle>
          <DialogDescription className="truncate">{restaurantName}</DialogDescription>
        </DialogHeader>

        {done ? (
          <p className="flex items-center gap-2 font-semibold text-green-700">
            <CircleCheck className="h-5 w-5" />
            来店を記録しました
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-sm font-bold" htmlFor="visit-verify-code">
              お店の認証コード
            </label>
            <input
              id="visit-verify-code"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={32}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="お店の人に聞いたコード"
              className="w-full rounded-md border px-3 py-2 text-base tracking-widest"
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!code.trim() || isSubmitting}>
              {isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <MapPinCheck className="h-4 w-4" />
              )}
              認証する
            </Button>
          </form>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {done ? "閉じる" : "キャンセル"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
