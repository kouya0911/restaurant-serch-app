// 店長ページ右列「電力データ × 来店予測」の構想イメージ用サンプルデータ。
// 実データとはつながっていない、説明用の固定値(架空の数値)。画面にも「サンプルデータ」と明記する。

/** 今日の電力使用量(kWh / 30分)。10:00 から 22:30 まで30分ごとの26点 */
export const SAMPLE_POWER_START_HOUR = 10
export const SAMPLE_POWER_KWH: number[] = [
  1.1, 1.3, // 10:00 仕込み
  2.0, 3.1, // 11:00 開店
  4.3, 4.6, // 12:00 昼のピーク
  4.0, 3.0, // 13:00
  2.2, 1.8, // 14:00
  1.6, 1.6, // 15:00 アイドルタイム
  1.8, 2.1, // 16:00
  2.6, 3.2, // 17:00
  3.9, 4.5, // 18:00
  4.8, 4.7, // 19:00 夜のピーク
  4.1, 3.4, // 20:00
  2.7, 2.0, // 21:00
  1.5, 1.2, // 22:00 閉店に向けて
]

/** 明日の時間帯別の来店予測(人)。11時台〜22時台 */
export const SAMPLE_VISIT_FORECAST: { hour: number; visits: number }[] = [
  { hour: 11, visits: 2 },
  { hour: 12, visits: 8 },
  { hour: 13, visits: 6 },
  { hour: 14, visits: 2 },
  { hour: 15, visits: 1 },
  { hour: 16, visits: 1 },
  { hour: 17, visits: 2 },
  { hour: 18, visits: 4 },
  { hour: 19, visits: 8 },
  { hour: 20, visits: 5 },
  { hour: 21, visits: 2 },
  { hour: 22, visits: 1 },
]

/** 明日の予測来店数(時間帯別の合計と一致させる) */
export const SAMPLE_TOMORROW = {
  visits: SAMPLE_VISIT_FORECAST.reduce((sum, h) => sum + h.visits, 0), // 42
  low: 36,
  high: 48,
  vsLastWeekPct: 8, // 先週の同じ曜日比
}

export type SampleAdviceIcon = "prep" | "aircon" | "staff"

/** 予測にもとづくおすすめ */
export const SAMPLE_ADVICE: { icon: SampleAdviceIcon; title: string; body: string }[] = [
  { icon: "prep", title: "仕込み量の目安", body: "スープは昼 18杯分・夜 22杯分" },
  {
    icon: "aircon",
    title: "空調のピークをずらす",
    body: "来店ピーク（12時・19時）の30分前に予冷し、14〜17時は設定温度を +1℃",
  },
  { icon: "staff", title: "人員", body: "19時台は予測 8人。ホールを1人増やす" },
]
