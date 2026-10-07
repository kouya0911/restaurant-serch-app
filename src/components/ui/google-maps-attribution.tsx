// src/components/ui/google-maps-attribution.tsx
// Google Places のデータ(店名・営業時間・住所候補など)を Google の地図なしで表示するときに必要な帰属表示。
// 規約上、文字は「Google Maps」のまま(翻訳・改行・大文字小文字の変更は不可)、
// Roboto(なければsans-serif)・太さ400・12〜16px・#5E5E5E にする。
// https://developers.google.com/maps/documentation/places/web-service/policies
import { cn } from "@/lib/utils"

interface GoogleMapsAttributionProps {
  className?: string
}

export default function GoogleMapsAttribution({ className }: GoogleMapsAttributionProps) {
  return (
    <p className={cn("text-right", className)}>
      <span
        translate="no"
        className="notranslate whitespace-nowrap text-xs font-normal not-italic tracking-normal text-[#5E5E5E]"
        style={{ fontFamily: "Roboto, sans-serif" }}
      >
        Google Maps
      </span>
    </p>
  )
}
