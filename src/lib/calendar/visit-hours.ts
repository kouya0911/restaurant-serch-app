// 「行く時間帯」(日本時間の「〇時台」)まわりの共通ヘルパー。サーバー/ブラウザの両方で使う。
// 来店認証の可否は DB 関数(docs/sql/008_visit_hours.sql の visit_time_check)が正。
// ここの判定は、画面で注意やボタンを出し分けるための写しなので、数値は DB とそろえること。

/** 画面で選べる時間帯(10時台〜23時台)。DB の列は 0〜23 を受け付ける */
export const VISIT_HOUR_MIN = 10
export const VISIT_HOUR_MAX = 23
export const VISIT_HOURS = Array.from(
  { length: VISIT_HOUR_MAX - VISIT_HOUR_MIN + 1 },
  (_, i) => VISIT_HOUR_MIN + i
)

const HOUR_MS = 60 * 60 * 1000
const JST_OFFSET_MS = 9 * HOUR_MS
/** 時間帯の始まりの何ms前までに宣言していれば来店認証できるか(1時間) */
const DECLARE_LEAD_MS = HOUR_MS
/** 時間帯の始まりの何ms前から来店認証できるか(15分) */
const VERIFY_EARLY_MS = 15 * 60 * 1000
/** 時間帯の始まりから何ms後まで来店認証できるか(3時間) */
const VERIFY_LATE_MS = 3 * HOUR_MS

/** 画面で選べる時間帯か(10〜23 の整数) */
export function isValidVisitHour(hour: unknown): hour is number {
  return Number.isInteger(hour) && (hour as number) >= VISIT_HOUR_MIN && (hour as number) <= VISIT_HOUR_MAX
}

/** "YYYY-MM-DD" + 時 → 時間帯の始まり(epoch ms)。日本時間として解釈する */
export function visitSlotStartMs(visitDate: string, hour: number): number {
  const [y, m, d] = visitDate.split("-").map(Number)
  return Date.UTC(y, m - 1, d, hour) - JST_OFFSET_MS
}

/** epoch ms → 日本時間の日付 "YYYY-MM-DD" と時(0〜23) */
export function jstDateAndHour(ms: number): { date: string; hour: number } {
  const jst = new Date(ms + JST_OFFSET_MS)
  return { date: jst.toISOString().slice(0, 10), hour: jst.getUTCHours() }
}

/** 12 → "12時台" / null → "時間未定" */
export function formatVisitHourLabel(hour: number | null): string {
  return hour == null ? "時間未定" : `${hour}時台`
}

/** epoch ms → 日本時間の "H:MM"(例: "11:45") */
export function formatJstClock(ms: number): string {
  const jst = new Date(ms + JST_OFFSET_MS)
  return `${jst.getUTCHours()}:${String(jst.getUTCMinutes()).padStart(2, "0")}`
}

/** 最初の宣言(createdAtMs)が、時間帯の始まりの1時間以上前か = 来店認証の対象になるか */
export function isDeclaredInTime(createdAtMs: number, visitDate: string, hour: number): boolean {
  return createdAtMs <= visitSlotStartMs(visitDate, hour) - DECLARE_LEAD_MS
}

/** 来店認証できる時間(epoch ms)。始まりの15分前 〜 始まりの3時間後 */
export function verifyWindow(visitDate: string, hour: number): { fromMs: number; toMs: number } {
  const start = visitSlotStartMs(visitDate, hour)
  return { fromMs: start - VERIFY_EARLY_MS, toMs: start + VERIFY_LATE_MS }
}

export type VerifyState =
  | { kind: "visited" }
  | { kind: "open" } // 今「行ったよ」を押せる
  | { kind: "ineligible" } // 1時間前までに宣言していない(時間帯を変えれば対象になりうる)
  | { kind: "early"; fromMs: number; toMs: number } // まだ時間前
  | { kind: "expired" } // 認証できる時間を過ぎた
  | { kind: "none" } // 時間未定の予定で、当日ではない

/**
 * 予定の来店認証の状態(画面の出し分け用)。DB の verify_visit と同じ順で判定する。
 * 時間未定の予定(visit_hour = null)は今までどおり「当日(日本時間)なら認証できる」。
 */
export function getVerifyState(
  plan: { visit_date: string; visit_hour: number | null; visited_at: string | null; created_at: string },
  nowMs: number,
  today: string
): VerifyState {
  if (plan.visited_at != null) return { kind: "visited" }
  if (plan.visit_hour == null) return plan.visit_date === today ? { kind: "open" } : { kind: "none" }

  if (!isDeclaredInTime(Date.parse(plan.created_at), plan.visit_date, plan.visit_hour)) {
    return { kind: "ineligible" }
  }
  const { fromMs, toMs } = verifyWindow(plan.visit_date, plan.visit_hour)
  if (nowMs < fromMs) return { kind: "early", fromMs, toMs }
  if (nowMs > toMs) return { kind: "expired" }
  return { kind: "open" }
}
