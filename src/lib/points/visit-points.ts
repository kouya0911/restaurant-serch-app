// 電気代還元ポイント(イメージ)。保存はせず、ユーザーの予定一覧(visit_plans + 自分のレビュー)から都度計算する。
// 来店認証済みの予定は本人でも削除できず(002)、レビューも編集・削除できない(006)ため、一度付いたポイントは減らない。

import { VisitPlan } from "@/types"

export const VISIT_POINTS = 5 // 来店認証済みの予定1件につき
export const REVIEW_POINTS = 5 // その予定にレビューを書いていれば、さらに

export function calcVisitPoints(plans: VisitPlan[]): number {
  return plans.reduce((sum, p) => {
    if (p.visited_at == null) return sum
    return sum + VISIT_POINTS + (p.review != null ? REVIEW_POINTS : 0)
  }, 0)
}
