import { mutate } from "swr"
import { listVisitPlansAction } from "@/app/(private)/actions/visitPlanActions"
import { refreshVisitCrowd } from "@/lib/calendar/visit-crowd-swr"
import { VisitPlan } from "@/types"

// サイドバー(menu-sheet)と詳細モーダルで共有するSWRキー。
// 登録・変更・削除の成功後に refreshVisitPlans() を呼ぶとサイドバーが再取得される(混雑の人数も取り直す)。
export const VISIT_PLANS_KEY = "visit-plans"

export async function fetchVisitPlans(): Promise<VisitPlan[]> {
  const res = await listVisitPlansAction()
  if (!res.success) throw new Error(res.message)
  return res.data
}

export function refreshVisitPlans() {
  return Promise.all([mutate(VISIT_PLANS_KEY), refreshVisitCrowd()])
}
