"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LoaderCircle } from "lucide-react"
import { getRestaurantDetailsAction } from "@/app/(private)/actions/restaurantActions"
import { PlaceDetailsAll } from "@/types"

interface RestaurantDetailModalProps {
  placeId: string
  restaurantName?: string
  isOpen: boolean
  onClose: () => void
}

const PRICE_LEVEL_LABELS: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: "¥",
  PRICE_LEVEL_MODERATE: "¥¥",
  PRICE_LEVEL_EXPENSIVE: "¥¥¥",
  PRICE_LEVEL_VERY_EXPENSIVE: "¥¥¥¥",
  // PRICE_LEVEL_FREE, PRICE_LEVEL_UNSPECIFIED などは意図的に含めない → 表示なし
}

function formatPriceLevel(priceLevel?: string): string | null {
  if (!priceLevel) return null
  return PRICE_LEVEL_LABELS[priceLevel] ?? null
}

export default function RestaurantDetailModal({
  placeId,
  restaurantName,
  isOpen,
  onClose,
}: RestaurantDetailModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [details, setDetails] = useState<PlaceDetailsAll | null>(null)

  useEffect(() => {
    if (!isOpen) return

    let mounted = true
    setIsLoading(true)
    setHasError(false)
    setDetails(null)

    getRestaurantDetailsAction(placeId)
      .then((res) => {
        if (!mounted) return
        if ("error" in res) {
          console.error("[RestaurantDetailModal] error:", res.error)
          setHasError(true)
          return
        }
        setDetails(res.data)
      })
      .catch((err) => {
        console.error("[RestaurantDetailModal] unexpected error:", err)
        if (mounted) setHasError(true)
      })
      .finally(() => {
        if (mounted) setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [isOpen, placeId])

  const priceLabel = formatPriceLevel(details?.priceLevel)
  const openNow = details?.regularOpeningHours?.openNow
  const weekdayDescriptions = details?.regularOpeningHours?.weekdayDescriptions

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{restaurantName ?? "レストラン詳細"}</DialogTitle>
          <DialogDescription className="sr-only">
            レストランの営業状況・価格帯・営業時間
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <LoaderCircle className="mr-2 animate-spin" />
            読み込み中...
          </div>
        )}

        {!isLoading && hasError && (
          <p className="py-4 text-destructive">詳細情報を取得できませんでした</p>
        )}

        {!isLoading && !hasError && details && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {openNow !== undefined && (
                <span
                  className={
                    openNow
                      ? "inline-block rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700"
                      : "inline-block rounded-full bg-gray-200 px-3 py-1 text-sm font-semibold text-gray-600"
                  }
                >
                  {openNow ? "営業中" : "営業時間外"}
                </span>
              )}
              {priceLabel && (
                <span className="text-sm font-semibold text-muted-foreground">
                  {priceLabel}
                </span>
              )}
            </div>

            {weekdayDescriptions && weekdayDescriptions.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-bold">営業時間</p>
                <ul className="space-y-0.5 text-sm text-muted-foreground">
                  {weekdayDescriptions.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>閉じる</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
