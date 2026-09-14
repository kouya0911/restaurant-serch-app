"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { Restaurant } from "@/types"

interface LotteryContextValue {
  candidates: Restaurant[]
  addCandidate: (restaurant: Restaurant) => void
  removeCandidate: (id: string) => void
  isCandidate: (id: string) => boolean
}

const LotteryContext = createContext<LotteryContextValue | null>(null)

export function LotteryProvider({ children }: { children: React.ReactNode }) {
  const [candidates, setCandidates] = useState<Restaurant[]>([])

  const addCandidate = useCallback((restaurant: Restaurant) => {
    setCandidates((prev) =>
      prev.some((c) => c.id === restaurant.id) ? prev : [...prev, restaurant]
    )
  }, [])

  const removeCandidate = useCallback((id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const isCandidate = useCallback(
    (id: string) => candidates.some((c) => c.id === id),
    [candidates]
  )

  const value = useMemo(
    () => ({ candidates, addCandidate, removeCandidate, isCandidate }),
    [candidates, addCandidate, removeCandidate, isCandidate]
  )

  return <LotteryContext.Provider value={value}>{children}</LotteryContext.Provider>
}

export function useLottery() {
  const ctx = useContext(LotteryContext)
  if (!ctx) throw new Error("useLottery must be used within a LotteryProvider")
  return ctx
}
