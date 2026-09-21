"use client"

// src/components/route-guide/route-guide-dialog.tsx
// 「ドコいく道案内」の出発地入力〜地図/案内文表示までをまとめたDialog。
// 既存の restaurant-detail-modal.tsx からボタン経由で開く、独立した新規コンポーネント。

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toPng } from "html-to-image"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Image as ImageIcon, LoaderCircle, MapPin, Printer, RotateCcw, X } from "lucide-react"
import { useDebouncedCallback } from "use-debounce"
import { v4 as uuidv4 } from "uuid"
import { AddressSuggestion } from "@/types"
import { resolvePlaceLocationAction } from "@/app/(private)/actions/routeGuideActions"
import { LatLng, MapBbox, Road, RouteGuideTurnFact } from "@/lib/route-guide/types"
import { MAX_ROUTE_DISTANCE_M } from "@/lib/route-guide/constants"
import { useIsMobileViewport } from "@/hooks/use-is-mobile-viewport"
import RouteGuideMap from "./route-guide-map"

type Step = "input" | "loading" | "result" | "error"

// サーバーから返ってくる技術的なエラー文字列（Overpassの504/XML断片など）を、
// そのまま画面に出さずユーザー向けの日本語メッセージに変換する。
// 生の詳細は呼び出し側で console にだけ残す。
function toFriendlyErrorMessage(rawMessage: string | undefined): string {
  if (rawMessage?.includes("TOO_FAR")) {
    const maxKm = MAX_ROUTE_DISTANCE_M / 1000
    return `この道案内は徒歩で行ける範囲（約${maxKm}kmまで）向けです。もっと近い場所からお試しください。`
  }
  if (rawMessage?.includes("Overpass")) {
    return "近くの目印情報を取得できませんでした。少し時間をおいて「もう一度試す」を押してください。"
  }
  if (rawMessage?.includes("turnFacts")) {
    return "出発地と目的地が近すぎるようです。出発地を少し離れた場所に変えてみてください。"
  }
  return "道案内の作成に失敗しました。もう一度お試しください。"
}

interface GuidanceStepData {
  legNo: number
  text: string
}

interface RouteGuideApiResult {
  routeCoords: LatLng[]
  roads: Road[]
  bbox: MapBbox
  turnFacts: RouteGuideTurnFact[]
  guidance: {
    steps: GuidanceStepData[] | null
    warning?: string
  }
}

interface StartPoint {
  lat: number
  lng: number
  name: string
}

export interface RouteGuideDialogProps {
  open: boolean
  onClose: () => void
  goal: LatLng
  goalName?: string
}

export default function RouteGuideDialog({ open, onClose, goal, goalName }: RouteGuideDialogProps) {
  const [step, setStep] = useState<Step>("input")
  const [inputText, setInputText] = useState("")
  const [sessionToken, setSessionToken] = useState(() => uuidv4())
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [startPoint, setStartPoint] = useState<StartPoint | null>(null)
  const [result, setResult] = useState<RouteGuideApiResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSavingImage, setIsSavingImage] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const printAreaRef = useRef<HTMLDivElement>(null)
  const previewOverlayRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobileViewport()

  // 印刷ダイアログを閉じた後（キャンセル含む）は必ず route-guide-printing を外し、
  // 通常の画面表示に戻す
  useEffect(() => {
    function clearPrintingClass() {
      document.body.classList.remove("route-guide-printing")
    }
    window.addEventListener("afterprint", clearPrintingClass)
    return () => window.removeEventListener("afterprint", clearPrintingClass)
  }, [])

  function handlePrint() {
    document.body.classList.add("route-guide-printing")
    window.print()
  }

  // スマホ幅: 地図＋番号付き案内文（.route-guide-print-area）を1枚のPNGとして書き出し、画面に大きく表示する。
  // iOSでは<a download>によるダウンロードが機能しないため、生成した画像をそのまま<img>で
  // 表示し、ユーザーが長押しして「"写真"に追加」で保存する形にする。
  // isSavingImage中は印刷用の拡大レイアウト(印刷時と同じテキスト/バッジサイズ)を一時的に適用してから撮影する。
  async function handleGenerateImage() {
    const node = printAreaRef.current
    if (!node || isSavingImage) return

    setIsSavingImage(true)
    try {
      // isSavingImageのstate更新でDOM(拡大レイアウト)が反映されるのを待ってから撮影する
      // (バックグラウンドタブ等ではrequestAnimationFrameが止まることがあるためsetTimeoutを使う)
      await new Promise((resolve) => setTimeout(resolve, 50))
      await document.fonts.ready

      const dataUrl = await toPng(node, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      })

      setPreviewImageUrl(dataUrl)
    } catch (err) {
      console.error("[RouteGuideDialog] handleGenerateImage error:", err)
    } finally {
      setIsSavingImage(false)
    }
  }

  const fetchSuggestions = useDebouncedCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([])
      setIsSearching(false)
      return
    }
    try {
      const res = await fetch(`/api/address/autocomplete?input=${encodeURIComponent(query)}&sessionToken=${sessionToken}`)
      const data = await res.json()
      if (!res.ok || !Array.isArray(data)) {
        console.error("[RouteGuideDialog] autocomplete error:", data)
        setSuggestions([])
        return
      }
      setSuggestions(data)
    } catch (err) {
      console.error("[RouteGuideDialog] autocomplete fetch error:", err)
      setSuggestions([])
    } finally {
      setIsSearching(false)
    }
  }, 500)

  function handleInputChange(value: string) {
    setInputText(value)
    if (!value.trim()) {
      setSuggestions([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    fetchSuggestions(value)
  }

  async function generateGuide(start: StartPoint) {
    setStep("loading")
    setErrorMessage(null)
    try {
      const res = await fetch("/api/route-guide/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { lat: start.lat, lng: start.lng },
          goal,
          startName: start.name,
          goalName,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        console.error("[RouteGuideDialog] generate API error:", data.error)
        setErrorMessage(toFriendlyErrorMessage(data.error))
        setStep("error")
        return
      }
      setResult(data)
      setStep("result")
    } catch (err) {
      console.error("[RouteGuideDialog] generate error:", err)
      setErrorMessage("道案内の生成に失敗しました。通信状況をご確認のうえ、もう一度お試しください。")
      setStep("error")
    }
  }

  async function handleSelectSuggestion(suggestion: AddressSuggestion) {
    setStep("loading")
    setErrorMessage(null)
    try {
      const locationRes = await resolvePlaceLocationAction(suggestion.placeId, sessionToken)
      setSessionToken(uuidv4()) // 次の検索セッション用にトークンを更新

      if ("error" in locationRes) {
        console.error("[RouteGuideDialog] resolvePlaceLocation error:", locationRes.error)
        setErrorMessage("出発地の位置情報を取得できませんでした")
        setStep("error")
        return
      }

      const location = locationRes.data.location
      if (location?.latitude == null || location?.longitude == null) {
        setErrorMessage("出発地の位置情報を取得できませんでした")
        setStep("error")
        return
      }

      const start: StartPoint = { lat: location.latitude, lng: location.longitude, name: suggestion.placeName }
      setStartPoint(start)
      await generateGuide(start)
    } catch (err) {
      console.error("[RouteGuideDialog] handleSelectSuggestion error:", err)
      setErrorMessage("出発地の位置情報を取得できませんでした")
      setStep("error")
    }
  }

  function handleRetry() {
    if (startPoint) {
      generateGuide(startPoint)
    } else {
      setStep("input")
    }
  }

  function resetState() {
    setStep("input")
    setInputText("")
    setSuggestions([])
    setIsSearching(false)
    setStartPoint(null)
    setResult(null)
    setErrorMessage(null)
    setPreviewImageUrl(null)
  }

  function handleClose() {
    onClose()
    resetState() // 次回開いたときは出発地入力からやり直す
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent
        // 画像プレビューはdocument.body直下にポータルしており、RadixのDialogContentからは
        // 「外側」の要素とみなされるため、そのままだとプレビュー内をクリックしただけで
        // Dialog自体が閉じてしまう。プレビュー領域内のクリックだけは無視する。
        onInteractOutside={(event) => {
          if (previewOverlayRef.current?.contains(event.target as Node)) {
            event.preventDefault()
          }
        }}
        className={cn(
          // スマホ幅: 上寄せ配置＋画面高さに収まらない分だけダイアログ自体をスクロール可能にする。
          // 現状は中央寄せ＋高さ無制限のため、画面の狭いスマホで中身（特にヘッダー直後の地図）が
          // 画面外にはみ出し、スクロールもできず見切れることがあった。
          "top-4 translate-y-0 max-h-[calc(100dvh-2rem)] overflow-y-auto",
          // sm以上（PC相当）は元の中央寄せ・高さ無制限の見た目に完全に戻す（PCの表示は変更しない）
          "sm:top-[50%] sm:translate-y-[-50%] sm:max-h-none sm:overflow-visible",
          "sm:max-w-2xl",
          // 印刷時: fixed配置・高さ制限・枠線・影を解除し、.route-guide-print-areaが
          // 紙面の左上に正しく配置されるようにする（画面表示には影響しない）。
          // translate-x-0/y-0ではなくtranslate-noneにする必要がある点に注意:
          // translateに0以外の"none"以外の値が残っていると、position:staticにしても
          // CSS仕様上このDialogContentがabsolute配置の子(.route-guide-print-area)の
          // containing blockになってしまい、紙面左上ではなくこの要素基準にずれる。
          "print:static print:top-auto print:left-auto print:translate-none print:transform-none",
          "print:max-h-none print:overflow-visible print:max-w-none print:w-full",
          "print:border-0 print:shadow-none print:p-0 print:m-0 print:rounded-none print:gap-0"
        )}
      >
        <DialogHeader className="print:hidden">
          <DialogTitle>ドコいく道案内{goalName ? ` - ${goalName}まで` : ""}</DialogTitle>
          <DialogDescription className="sr-only">
            出発地を入力すると、手書き風の地図と道案内を表示します
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <Command shouldFilter={false}>
            <div className="bg-muted mb-2">
              <CommandInput
                value={inputText}
                onValueChange={handleInputChange}
                placeholder="出発地を入力...（駅名・住所など）"
              />
            </div>
            {/* TODO(将来の改善候補・今回は見送り): 「現在地を使う」ボタン
                （navigator.geolocationで取得した座標をそのままstart.latlngとして使う）。
                今回は出発地の入力（検索）のみ対応。 */}
            <CommandList>
              {isSearching && (
                <div className="p-3 text-sm text-muted-foreground">
                  <LoaderCircle className="animate-spin inline-block mr-2 h-4 w-4" />
                  検索中…
                </div>
              )}
              {!isSearching && inputText && suggestions.length === 0 && (
                <CommandEmpty>候補が見つかりません。</CommandEmpty>
              )}
              {!isSearching &&
                suggestions.map((s) => (
                  <CommandItem key={s.placeId} onSelect={() => handleSelectSuggestion(s)} className="p-4">
                    <MapPin />
                    <div className="ml-3">
                      <p className="font-bold">{s.placeName}</p>
                      <p className="text-muted-foreground">{s.address_text}</p>
                    </div>
                  </CommandItem>
                ))}
            </CommandList>
          </Command>
        )}

        {step === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
            <LoaderCircle className="animate-spin h-6 w-6" />
            地図と道案内を作成しています…
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-destructive text-center text-sm">{errorMessage ?? "エラーが発生しました"}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRetry}>
                <RotateCcw className="h-4 w-4" />
                もう一度試す
              </Button>
              <Button variant="outline" onClick={() => setStep("input")}>
                出発地を変更
              </Button>
            </div>
          </div>
        )}

        {step === "result" && result && startPoint && (
          <div className="space-y-4">
            {result.guidance.warning && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden">
                ⚠ {result.guidance.warning}
              </div>
            )}
            {/* route-guide-print-area: 印刷時・画像保存時はこの中身（見出し・地図・番号付き案内文）だけを出す */}
            <div ref={printAreaRef} className="route-guide-print-area space-y-4">
              <h2
                className={cn(
                  "hidden print:block text-2xl font-bold mb-2",
                  isSavingImage && "block"
                )}
              >
                {goalName ? `${goalName}まで` : "道案内"}
              </h2>
              <RouteGuideMap
                routeCoords={result.routeCoords}
                roads={result.roads}
                bbox={result.bbox}
                turnFacts={result.turnFacts}
                start={{ lat: startPoint.lat, lng: startPoint.lng }}
                goal={goal}
                startName={startPoint.name}
                goalName={goalName}
              />
              <ol className={cn("space-y-2 print:space-y-3", isSavingImage && "space-y-3")}>
                {(result.guidance.steps ?? []).map((s) => (
                  <li
                    key={s.legNo}
                    className={cn(
                      "flex gap-3 items-start text-sm print:text-lg",
                      isSavingImage && "text-lg"
                    )}
                  >
                    <span
                      className={cn(
                        "flex-none w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold print:w-8 print:h-8 print:text-base",
                        isSavingImage && "w-8 h-8 text-base"
                      )}
                    >
                      {s.legNo}
                    </span>
                    <span className="pt-0.5">{s.text}</span>
                  </li>
                ))}
              </ol>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep("input")} className="print:hidden">
              出発地を変更する
            </Button>
          </div>
        )}

        <DialogFooter className="print:hidden">
          {step === "result" && (isMobile ? (
            <Button variant="outline" onClick={handleGenerateImage} disabled={isSavingImage}>
              {isSavingImage ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
              画像を表示
            </Button>
          ) : (
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              印刷
            </Button>
          ))}
          <Button variant="outline" onClick={handleClose}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {previewImageUrl && typeof document !== "undefined" && createPortal(
      // DialogContentにtransformがかかっているため、position:fixedの子をそのまま置くと
      // Dialog内に閉じ込められる。document.body直下にポータルして画面全体に表示する。
      <div
        ref={previewOverlayRef}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/90 p-4"
      >
        <button
          type="button"
          onClick={() => setPreviewImageUrl(null)}
          className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="閉じる"
        >
          <X className="h-6 w-6" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URLかつiOSの長押し保存を確実に効かせるため素の<img>を使う */}
        <img
          src={previewImageUrl}
          alt={goalName ? `${goalName}までの道案内` : "道案内"}
          className="max-h-[80vh] max-w-full rounded object-contain shadow-lg"
        />
        <p className="text-sm text-white/90">画像を長押しして保存できます</p>
      </div>,
      document.body
    )}
    </>
  )
}
