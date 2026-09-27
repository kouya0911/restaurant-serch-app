"use client"

import { useEffect, useState } from "react"
import { Star } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import VisitReviewForm from "@/components/ui/visit-review-form"

interface VisitReviewDialogProps {
  open: boolean
  onClose: () => void
  planId: number | null
  restaurantName?: string
}

// サイドバーの「レビューを書く」から開く。来店認証ダイアログで「あとで」にした予定に、あとから書く。
export default function VisitReviewDialog({
  open,
  onClose,
  planId,
  restaurantName,
}: VisitReviewDialogProps) {
  const [reviewed, setReviewed] = useState(false)

  // 開くたびに送信済みの表示をリセットする(フォームの入力は閉じると破棄される)
  useEffect(() => {
    if (open) setReviewed(false)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      {/* スマホでキーボードが出ても「送る」までスクロールできるように高さを抑える */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>レビューを書く</DialogTitle>
          <DialogDescription className="truncate">{restaurantName}</DialogDescription>
        </DialogHeader>

        {reviewed ? (
          <p className="flex items-center gap-2 font-semibold text-amber-600">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            レビューを送りました。ありがとうございます！
          </p>
        ) : (
          planId != null && (
            <VisitReviewForm planId={planId} onSubmitted={() => setReviewed(true)} onSkip={onClose} />
          )
        )}

        {/* 入力中は、フォームの「あとで」が閉じるボタンを兼ねる */}
        {reviewed && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              閉じる
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
