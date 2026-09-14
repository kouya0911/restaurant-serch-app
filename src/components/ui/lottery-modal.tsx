"use client"

import { Trash2 } from "lucide-react"
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

interface LotteryModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function LotteryModal({ isOpen, onClose }: LotteryModalProps) {
  const { candidates, removeCandidate } = useLottery()

  const handleStart = () => {
    // TODO: ステップ4で抽選演出・結果表示を実装する
    console.log("[LotteryModal] start lottery (not implemented yet)", candidates)
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
      </DialogContent>
    </Dialog>
  )
}
