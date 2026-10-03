import { mutate } from "swr"
import { getVisitCrowdAction } from "@/app/(private)/actions/visitPlanActions"
import { VisitCrowdCount } from "@/types"

// 混雑表示(店・時間帯ごとの行く予定の人数)の SWR キーの先頭。
// キーは [VISIT_CROWD_KEY, 日付, 時, 店IDをカンマでつないだもの]。表示中の店をまとめて1回で取る
export const VISIT_CROWD_KEY = "visit-crowd"

export async function fetchVisitCrowd(placeIds: string[], visitDate: string): Promise<VisitCrowdCount[]> {
  const res = await getVisitCrowdAction(placeIds, visitDate)
  if (!res.success) throw new Error(res.message)
  return res.data
}

/** 宣言・変更・取り消しのあとに、表示中の混雑を取り直す */
export function refreshVisitCrowd() {
  return mutate((key) => Array.isArray(key) && key[0] === VISIT_CROWD_KEY)
}
