"use client"

import { useState } from "react"
import { LoaderCircle, Send, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { submitReviewAction } from "@/app/(private)/actions/visitPlanActions"
import { refreshVisitPlans } from "@/lib/calendar/visit-plans-swr"

const MAX_COMMENT_LENGTH = 200

interface VisitReviewFormProps {
  planId: number
  onSubmitted: () => void // 送信できたとき
  onSkip: () => void // 「あとで」(サイドバーからあとで書ける)
}

// 来店後のレビュー入力(星1〜5 必須・ひとこと任意)。来店認証ダイアログの続きと、サイドバーから使う。
export default function VisitReviewForm({ planId, onSubmitted, onSkip }: VisitReviewFormProps) {
  const [rating, setRating] = useState(0) // 0 = 未選択
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // サーバー・DB と同じく、前後の空白を除いてコードポイント単位で数える
  const commentLength = [...comment.trim()].length
  const isTooLong = commentLength > MAX_COMMENT_LENGTH

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (isSubmitting || rating === 0 || isTooLong) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await submitReviewAction(planId, rating, comment)
      if (!res.success) {
        setError(
          res.message === "AUTH_REQUIRED"
            ? "ログインが必要です。ログインし直してください"
            : res.message
        )
        // すでに書いてある等でも一覧は最新にしておく
        await refreshVisitPlans()
        return
      }
      await refreshVisitPlans()
      onSubmitted()
    } catch (err) {
      console.error("[VisitReviewForm] unexpected error:", err)
      setError("送信に失敗しました。時間をおいてもう一度お試しください")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <p className="text-sm font-bold">お店はどうでしたか？</p>
        <div className="mt-1 flex items-center gap-1" role="group" aria-label="星の数">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`星${n}つ`}
              aria-pressed={rating === n}
              className="rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star
                className={`h-9 w-9 transition-colors ${
                  n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"
                }`}
              />
            </button>
          ))}
          <span className="ml-1 text-sm text-gray-500">{rating > 0 ? `${rating} / 5` : "タップして選択"}</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold" htmlFor="visit-review-comment">
          ひとこと<span className="ml-1 font-normal text-gray-500">（任意）</span>
        </label>
        <textarea
          id="visit-review-comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="例: 店員さんが親切でした"
          className="mt-1 w-full resize-none rounded-md border px-3 py-2 text-base"
        />
        <p className={`text-right text-xs ${isTooLong ? "font-bold text-destructive" : "text-gray-500"}`}>
          {commentLength}/{MAX_COMMENT_LENGTH}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onSkip} disabled={isSubmitting}>
          あとで
        </Button>
        <Button type="submit" className="flex-1" disabled={rating === 0 || isTooLong || isSubmitting}>
          {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          送る
        </Button>
      </div>
    </form>
  )
}
