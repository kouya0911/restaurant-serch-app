// src/lib/route-guide/guidance.ts
// map/server.js の案内文生成ロジック（distance丸め・legビルド・OpenAI呼び出し・
// 距離検証・1回だけの自動リトライ・警告付与）を移植したもの。
//
// 重要: OPENAI_API_KEY はこのファイル（サーバー側）でだけ読み込む。
//       クライアントに返すレスポンスに絶対にキーを含めないこと。

import OpenAI from "openai";
import { MANEUVER_MODIFIER_JA } from "./constants";
import { RouteGuideTurnFact } from "./types";

const GUIDANCE_MODEL = "gpt-4o-mini"; // 安価・日本語も十分な品質。変更したければここだけ直す

// 100m未満は10m単位、100m以上は50m単位に丸める
// SHORT_SEGMENT_THRESHOLD_M以下の区間は数字を言わず「すぐ」「少し進むと」のような柔らかい表現にする
const SHORT_SEGMENT_THRESHOLD_M = 50;

function roundNiceMeters(m: number): number {
  if (m < 100) return Math.round(m / 10) * 10;
  return Math.round(m / 50) * 50;
}

interface TurnFactSummary {
  landmark: { name: string; revealedAsRealName: boolean } | null;
  shapeText: string | null;
}

// 1曲がり角ぶんのデータを、AIに渡す「事実」だけの形に整える。
// 実名を見せるか隠すかはここで決める（AIには決めさせない）。
function buildTurnFact(t: RouteGuideTurnFact): TurnFactSummary {
  if (!t.hasLandmark) {
    return { landmark: null, shapeText: t.shapeText || null };
  }
  // prominent(学校・公民館・大型店・橋・公園・バス停など)は実名を残す。
  // それ以外は種別名(category)だけ渡し、実名(display)は渡さない＝AIも知らない状態にする。
  const landmarkName = t.prominent ? t.display : t.category || null;
  return {
    landmark: landmarkName ? { name: landmarkName, revealedAsRealName: !!t.prominent } : null,
    shapeText: null,
  };
}

export interface GuidanceLeg {
  legNo: number;
  rawDistanceM: number;
  distanceM: number;
  short: boolean;
  direction?: string;
  landmark?: { name: string; revealedAsRealName: boolean } | null;
  shapeText?: string | null;
  arrival: boolean;
}

// turnFacts(曲がり角の配列) + segments(区間距離、長さturnFacts.length+1) から
// 「◯m歩く→曲がる／到着」の単位=legの配列を作る。距離はここで丸め・short判定まで確定させる。
function buildLegs(turnFacts: RouteGuideTurnFact[], segments: number[]): GuidanceLeg[] {
  return segments.map((rawM, i) => {
    const distanceM = roundNiceMeters(rawM);
    const leg: GuidanceLeg = {
      legNo: i + 1,
      rawDistanceM: rawM, // 検証用（AIには渡すが、突き合わせにも使う）
      distanceM, // 丸め済み・AIが文中で使ってよい数字
      short: distanceM <= SHORT_SEGMENT_THRESHOLD_M,
      arrival: i >= turnFacts.length, // 最後のleg = 目的地に到着
    };
    if (i < turnFacts.length) {
      const directionJa = MANEUVER_MODIFIER_JA[turnFacts[i].modifier] || turnFacts[i].modifier || "";
      const fact = buildTurnFact(turnFacts[i]);
      leg.direction = directionJa;
      leg.landmark = fact.landmark;
      leg.shapeText = fact.shapeText;
    }
    return leg;
  });
}

const SYSTEM_PROMPT = `あなたは道案内文の「言い換え」だけを行う担当です。
渡されたJSONは、出発地から目的地までを「区間(leg)」の連続として表したものです。
各legは「distanceM(歩く距離)進むと、direction方向に曲がる（またはarrival:trueなら到着する）」という事実を表します。
これだけをもとに、人が人に口で教えるような、やさしく自然な日本語の道案内文を、legごとの短いステップ文として作ってください。

出力形式（厳守）:
必ず次の形のJSONオブジェクトのみを出力すること。他の文字列やコードブロック記号は一切付けない。
{"steps": [ {"legNo": <legの番号>, "text": "<そのlegの案内文（1〜2文）>"}, ... ]}
- stepsの要素数・legNoの値と順序は、渡されたlegsの配列と完全に同じにする（省略・追加・並べ替えをしない）。
- 各stepのtextは単独でも読めるが、通して読んだときに「まず」「そこから」「最後に」のような自然な流れになるようにする。

厳守事項:
- JSONに無いleg・曲がり角・方向・目印を絶対に作らない。legの数・順番・distanceM・directionはJSON通りにする。
- 距離は各legのdistanceMの数値をそのまま使う。distanceMはすでに確定した最終的な数字なので、これをさらに丸め直したり、別のきりのいい数字（250→200など）に変えたりせず、そのlegのtextにそのまま使うこと。distanceMに無い数字を出さない。
- leg.short が true の区間は、distanceMの数字をtextで言わない。代わりに「すぐ」「少し進むと」「ほどなく」のような柔らかい表現にする（例外なく数字を言わない）。
- leg.short が false の区間は、「200mほど進むと」のように自然に距離を入れる。
- landmarkがnullでshapeTextがある場合は、shapeTextの表現（「右に曲がる」等）をそのまま自然な文にする。目印をでっち上げない。
- landmark.nameは渡された文字列をそのまま使う。省略や短縮はよいが、別の施設名に変えたり、色・見た目などJSONに無い特徴を付け足したりしない。
- 高齢の方にも分かりやすい、やさしい言葉づかいにする。専門用語・交差点名・方角(北東など)は避ける。
- 目印は「右手に見える」「左手にある」程度のふわっとした位置表現にとどめ、目印までのピンポイント距離は絶対に言わない（そもそもJSONにも渡していない）。
- arrival:trueのlegは、そのdistanceMのルールに従いつつ到着の案内にする。`;

export interface GuidanceStep {
  legNo: number;
  text: string;
}

interface DistanceCheckMismatch {
  legNo?: number;
  reason?: string;
  expected?: number | string;
  found?: number[];
}

interface DistanceCheckResult {
  ok: boolean;
  mismatches: DistanceCheckMismatch[];
}

// leg単位で「そのstepのtext内の数字」が期待値と一致するかを機械的にチェックする。
// プロンプトのお願いだけに頼らない保険。short区間は数字ゼロ個、それ以外はdistanceMのみが期待値。
function checkStepDistances(steps: GuidanceStep[] | null, legs: GuidanceLeg[]): DistanceCheckResult {
  const legByNo = new Map(legs.map((l) => [l.legNo, l]));
  const mismatches: DistanceCheckMismatch[] = [];

  if (!Array.isArray(steps) || steps.length !== legs.length) {
    return {
      ok: false,
      mismatches: [
        {
          reason: `steps数が不一致（期待${legs.length}, 実際${Array.isArray(steps) ? steps.length : "配列でない"}）`,
        },
      ],
    };
  }

  for (const s of steps) {
    const leg = legByNo.get(s.legNo);
    if (!leg) {
      mismatches.push({ legNo: s.legNo, reason: "未知のlegNo" });
      continue;
    }
    const found = [...String(s.text || "").matchAll(/(\d+)\s*m/g)].map((m) => parseInt(m[1], 10));
    const ok = leg.short ? found.length === 0 : found.length >= 1 && found.every((n) => n === leg.distanceM);
    if (!ok) mismatches.push({ legNo: s.legNo, expected: leg.short ? "(数字なし)" : leg.distanceM, found });
  }
  return { ok: mismatches.length === 0, mismatches };
}

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

async function callGuidanceModel(facts: { start: string; goal: string; legs: GuidanceLeg[] }): Promise<GuidanceStep[] | null> {
  const completion = await getOpenAIClient().chat.completions.create({
    model: GUIDANCE_MODEL,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(facts) },
    ],
  });
  const raw = completion.choices[0]?.message?.content?.trim() || "{}";
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.steps) ? parsed.steps : null;
  } catch {
    return null; // JSONとして壊れていた場合はnull（＝距離チェックで不一致扱いにしてリトライへ）
  }
}

export interface GuidanceResult {
  guidance: string;
  steps: GuidanceStep[] | null;
  model: string;
  legs: GuidanceLeg[];
  distanceCheck: DistanceCheckResult & { attempts: number };
  warning?: string;
}

export async function generateGuidance(params: {
  start?: string;
  goal?: string;
  turnFacts: RouteGuideTurnFact[];
  segments: number[];
}): Promise<{ data: GuidanceResult } | { error: string }> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[generateGuidance] Missing OPENAI_API_KEY");
    return { error: "サーバー設定エラー: OpenAI APIキーがありません" };
  }

  const { turnFacts, segments } = params;
  if (!Array.isArray(turnFacts) || turnFacts.length === 0) {
    return { error: "turnFacts（曲がり角の配列）が必要です" };
  }
  if (!Array.isArray(segments) || segments.length !== turnFacts.length + 1) {
    return {
      error: `segments は turnFacts.length+1 個の配列が必要です（turnFacts=${turnFacts.length}件, segments=${
        Array.isArray(segments) ? segments.length : "なし"
      }件）`,
    };
  }

  const legs = buildLegs(turnFacts, segments);
  const facts = { start: params.start || "出発地", goal: params.goal || "目的地", legs };

  try {
    // 1回目の生成
    let steps = await callGuidanceModel(facts);
    let check = checkStepDistances(steps, legs);
    let attempts = 1;

    // 距離が渡したものと一致しなければ、プロンプトの言葉だけに頼らず機械的に1回だけ生成し直す
    if (!check.ok) {
      console.warn("[generateGuidance] 距離の不一致を検出 → 1回だけ再生成します", check.mismatches);
      steps = await callGuidanceModel(facts);
      check = checkStepDistances(steps, legs);
      attempts = 2;
    }

    const guidance = (steps || []).map((s) => s.text).join(""); // 互換用: 通し文としても返す

    const result: GuidanceResult = {
      guidance,
      steps: steps || null,
      model: GUIDANCE_MODEL,
      legs, // 呼び出し側でも数字の突き合わせができるよう返す
      distanceCheck: { ok: check.ok, mismatches: check.mismatches, attempts },
    };

    // 再生成してもまだズレている場合は、案内文をそのまま信頼できる体で出さず警告を付ける
    if (!check.ok) {
      console.error("[generateGuidance] 再生成後も距離が不一致 → 警告付きで返します", check.mismatches);
      result.warning = "距離の表現に誤りの可能性があります。区間の距離は地図の表示を目安にしてください。";
    }

    return { data: result };
  } catch (err: any) {
    console.error("[generateGuidance] error:", err.message || err);
    return { error: `案内文の生成に失敗しました: ${err.message || "Unknown error"}` };
  }
}
