import { mutate } from "swr"
import { listVisitPlansAction } from "@/app/(private)/actions/visitPlanActions"
import { VisitPlan } from "@/types"

// サイドバー(menu-sheet)と詳細モーダルで共有するSWRキー。
// 登録・削除の成功後に refreshVisitPlans() を呼ぶとサイドバーが再取得される。
export const VISIT_PLANS_KEY = "visit-plans"

export async function fetchVisitPlans(): Promise<VisitPlan[]> {
  const res = await listVisitPlansAction()
  if (!res.success) throw new Error(res.message)
  return res.data
}

export function refreshVisitPlans() {
  return mutate(VISIT_PLANS_KEY)
}
