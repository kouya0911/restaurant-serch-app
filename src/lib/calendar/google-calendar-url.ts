// Googleカレンダーの「予定を追加」URLを組み立てる純関数。
// APIやOAuthは使わず、開いたユーザーが自分のカレンダーで保存する方式。
// 日付は "YYYY-MM-DD" の文字列のまま計算し、Date のタイムゾーン変換を通さない。

export const VISIT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** "YYYY-MM-DD" が実在する日付か判定する（2026-02-30 などを弾く） */
export function isValidVisitDate(value: string): boolean {
  if (!VISIT_DATE_PATTERN.test(value)) return false
  const [y, m, d] = value.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** "YYYY-MM-DD" の翌日を "YYYY-MM-DD" で返す（UTC演算なのでタイムゾーンの影響なし） */
export function addOneDay(value: string): string {
  const [y, m, d] = value.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

interface GoogleCalendarUrlParams {
  restaurantName: string
  visitDate: string // "YYYY-MM-DD"
  placeId?: string
}

/** 終日予定として登録するURLを返す。visitDate が不正なら null */
export function buildGoogleCalendarUrl({
  restaurantName,
  visitDate,
  placeId,
}: GoogleCalendarUrlParams): string | null {
  if (!isValidVisitDate(visitDate)) return null

  // 終日予定の end は「最終日の翌日」を指定する（Googleカレンダーの仕様）
  const start = visitDate.replaceAll("-", "")
  const end = addOneDay(visitDate).replaceAll("-", "")

  const mapsParams = new URLSearchParams({ api: "1", query: restaurantName })
  if (placeId) mapsParams.set("query_place_id", placeId)

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${restaurantName} に行く`,
    dates: `${start}/${end}`,
    location: restaurantName,
    details: `https://www.google.com/maps/search/?${mapsParams.toString()}`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
