// 「行く日」("YYYY-MM-DD" 文字列)まわりの共通ヘルパー。
// Date のローカルタイムゾーン変換を通さず、日本時間(JST)基準で扱う。

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]

/** 日本時間の「今日」を "YYYY-MM-DD" で返す（サーバー/ブラウザのTZに依存しない） */
export function todayInJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** "2026-10-03" → "10/3（土）" */
export function formatVisitDateLabel(value: string): string {
  const [y, m, d] = value.split("-").map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${m}/${d}（${weekday}）`
}
