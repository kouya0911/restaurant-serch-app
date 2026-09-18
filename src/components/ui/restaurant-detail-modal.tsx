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
import { Check, Copy, ExternalLink, LoaderCircle, MapPin, Route } from "lucide-react"
import { getRestaurantDetailsAction } from "@/app/(private)/actions/restaurantActions"
import { PlaceDetailsAll } from "@/types"
import RouteGuideDialog from "@/components/route-guide/route-guide-dialog"

interface RestaurantDetailModalProps {
  placeId: string
  restaurantName?: string
  isOpen: boolean
  onClose: () => void
}

interface PriceLevelInfo {
  symbol: string
  label: string
}

const PRICE_LEVEL_INFO: Record<string, PriceLevelInfo> = {
  PRICE_LEVEL_INEXPENSIVE: { symbol: "¥", label: "安い" },
  PRICE_LEVEL_MODERATE: { symbol: "¥¥", label: "普通" },
  PRICE_LEVEL_EXPENSIVE: { symbol: "¥¥¥", label: "やや高め" },
  PRICE_LEVEL_VERY_EXPENSIVE: { symbol: "¥¥¥¥", label: "高級" },
  // PRICE_LEVEL_FREE, PRICE_LEVEL_UNSPECIFIED などは意図的に含めない → 表示なし
}

function formatPriceLevel(priceLevel?: string): PriceLevelInfo | null {
  if (!priceLevel) return null
  return PRICE_LEVEL_INFO[priceLevel] ?? null
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
  const [copied, setCopied] = useState(false)
  const [showRouteGuide, setShowRouteGuide] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(restaurantName ?? "")
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

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

  const priceInfo = formatPriceLevel(details?.priceLevel)
  const openNow = details?.regularOpeningHours?.openNow
  const weekdayDescriptions = details?.regularOpeningHours?.weekdayDescriptions
  const location = details?.location

  return (
    <>
    <Dialog open={isOpen && !showRouteGuide} onOpenChange={(open) => { if (!open) onClose() }}>
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
              {priceInfo && (
                <span className="text-sm font-semibold text-muted-foreground">
                  {priceInfo.symbol}
                  <span className="ml-1 text-xs font-normal text-muted-foreground/70">
                    （{priceInfo.label}）
                  </span>
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

            <div className="flex flex-col gap-2 pt-1">
              <Button variant="outline" className="w-full" asChild>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurantName ?? "")}&query_place_id=${encodeURIComponent(placeId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin className="h-4 w-4" />
                  Googleマップで開く
                </a>
              </Button>

              <Button variant="outline" className="w-full" asChild>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${restaurantName ?? ""} site:tabelog.com`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  食べログで探す
                </a>
              </Button>

              <Button variant="outline" className="w-full" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    コピーしました
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    店名をコピー
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                className="w-full"
                disabled={location?.latitude == null || location?.longitude == null}
                title={location?.latitude == null || location?.longitude == null ? "座標情報を取得できませんでした" : undefined}
                onClick={() => setShowRouteGuide(true)}
              >
                <Route className="h-4 w-4" />
                ドコいく道案内
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>閉じる</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {location?.latitude != null && location?.longitude != null && (
      <RouteGuideDialog
        open={showRouteGuide}
        onClose={() => setShowRouteGuide(false)}
        goal={{ lat: location.latitude, lng: location.longitude }}
        goalName={restaurantName}
      />
    )}
    </>
  )
}
