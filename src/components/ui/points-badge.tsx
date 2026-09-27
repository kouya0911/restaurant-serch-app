// 来店認証・レビュー送信の成功時に添える「+5pt」。アプリの「営業中」ラベルと同じ控えめな丸いラベル
export default function PointsBadge({ points }: { points: number }) {
  return (
    <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
      +{points}pt
    </span>
  )
}
