// src/hooks/use-is-mobile-viewport.ts
// 画面幅がTailwindの sm ブレークポイント(640px)未満かどうかを返すフック。
// route-guide-dialog.tsx が出し分けているスマホ用レイアウト(sm:)と判定基準を揃えることで、
// 「見た目がスマホレイアウトのときは保存操作もスマホ用」という一貫性を保つ。
import { useEffect, useState } from "react"

const MOBILE_QUERY = "(max-width: 639.98px)"

export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    setIsMobile(mql.matches)
    function handleChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches)
    }
    mql.addEventListener("change", handleChange)
    return () => mql.removeEventListener("change", handleChange)
  }, [])

  return isMobile
}
