"use client"

import { useEffect, useRef, useState } from "react"

// 店長ページの共通部品。見た目はアプリ側(白背景・細い枠線・rounded-lg・影なし)に合わせる。

const MARK_MS = 5000

/** 値が変わったあと MARK_MS だけ true を返す。初回表示と、未取得(null/undefined)からの変化は除く */
export function useChangedRecently(value: unknown): boolean {
  const prev = useRef(value)
  const [changed, setChanged] = useState(false)
  useEffect(() => {
    const before = prev.current
    if (Object.is(before, value)) return
    prev.current = value
    if (before == null) return
    setChanged(true)
    const t = setTimeout(() => setChanged(false), MARK_MS)
    return () => clearTimeout(t)
  }, [value])
  return changed
}

/** 新しいデータが届いたときの控えめな目印(数字の横に小さく「更新」) */
export function UpdatedMark({ show }: { show: boolean }) {
  return (
    <span
      aria-hidden={!show}
      className={`ml-1.5 text-[11px] font-medium text-green-700 transition-opacity duration-300 ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      更新
    </span>
  )
}

export function Panel({
  title,
  aside,
  className = "",
  children,
}: {
  title: string
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-lg border bg-card p-4 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
