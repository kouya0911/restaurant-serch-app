"use client"

import { useEffect, useRef, useState } from "react"
import { LoaderCircle, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useLottery } from "@/components/ui/lottery-provider"
import { Restaurant } from "@/types"

interface LotteryModalProps {
  isOpen: boolean
  onClose: () => void
}

type LotteryPhase = "idle" | "drawing" | "result"

const DRAW_DURATION_MS = 2200
const LOTTERY_EMOJI = "🥠"

function LotteryEmoji({ animated = false }: { animated?: boolean }) {
  return (
    <div
      className={`text-center text-6xl ${animated ? "animate-bounce" : ""}`}
      aria-hidden="true"
    >
      {LOTTERY_EMOJI}
    </div>
  )
}

export default function LotteryModal({ isOpen, onClose }: LotteryModalProps) {
  const { candidates, removeCandidate } = useLottery()
  const [phase, setPhase] = useState<LotteryPhase>("idle")
  const [result, setResult] = useState<Restaurant | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // モーダルを閉じたら次回は候補一覧からやり直せるようリセットする(候補自体は消さない)
  useEffect(() => {
    if (!isOpen) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setPhase("idle")
      setResult(null)
    }
  }, [isOpen])

  // アンマウント時の保険としてタイマーを片付ける
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleStart = () => {
    if (candidates.length === 0) return
    setPhase("drawing")
    timeoutRef.current = setTimeout(() => {
      const winner = candidates[Math.floor(Math.random() * candidates.length)]
      setResult(winner)
      setPhase("result")
      timeoutRef.current = null
    }, DRAW_DURATION_MS)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🎟 くじびき</DialogTitle>
          <DialogDescription className="sr-only">
            くじびきの候補一覧と抽選
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" && (
          <>
            <LotteryEmoji />

            {candidates.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                候補がありません。カードの🎟ボタンから追加してください
              </p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {candidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="truncate text-sm font-medium">{candidate.restaurantName}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeCandidate(candidate.id)}
                      title="候補から削除"
                    >
                      <Trash2 className="h-4 w-4 text-gray-500" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <DialogFooter>
              <Button disabled={candidates.length === 0} onClick={handleStart}>
                くじびきを開始
              </Button>
              <Button variant="outline" onClick={onClose}>
                閉じる
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "drawing" && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-md bg-muted/60 py-12">
            <LotteryEmoji animated />
            <LoaderCircle className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">引き中...</p>
          </div>
        )}

        {phase === "result" && result && (
          <div className="flex flex-col items-center gap-4 py-6">
            <LotteryEmoji />
            <p className="text-center text-lg font-bold">
              {result.restaurantName} に決まりました！
            </p>
            {/* TODO: ステップ4-bでコピー・外部リンクボタンをここに追加する */}
            <DialogFooter>
              <Button
                onClick={() => {
                  setPhase("idle")
                  setResult(null)
                }}
              >
                もう一度引く
              </Button>
              <Button variant="outline" onClick={onClose}>
                閉じる
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
