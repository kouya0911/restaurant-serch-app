// src/lib/route-guide/landmarks.ts
// map/smart-landmarks.js の目印選定ロジック（classifyLandmark 〜 selectLandmarkForTurn）を移植

import { GENERIC_LABELS, MANEUVER_MODIFIER_JA, PROMINENT_KINDS, TURN_RADIUS_M } from "./constants";
import { haversineM } from "./geo";
import { Landmark, LandmarkCandidate, RouteTurn } from "./types";

// 地物のタグから「種類ラベル」を作る（amenity=school, shop=convenience など）
// ※この文字列は内部分類用。画面にはresolveLandmarkDisplay()で変換した後の値しか出さない
export function classifyLandmark(tags: Record<string, string>): string {
  if (tags.bridge && tags.bridge !== "no") return "bridge";
  const keys = ["amenity", "shop", "leisure", "natural", "historic", "tourism"] as const;
  for (const key of keys) {
    if (tags[key]) return `${key}=${tags[key]}`;
  }
  if (tags.highway === "bus_stop") return "highway=bus_stop";
  return "name_only"; // 分類タグは無いがnameだけ付いている地物
}

// 地物の「画面表示用ラベル」を決める。生タグはここで必ず日本語に変換し、
// 変換先が無い（名前も一般名も無い）地物は null を返して選定対象から除外する
function resolveLandmarkDisplay(candidate: Landmark): string | null {
  const hasName = candidate.name && candidate.name !== "（名前なし）";
  if (hasName) return candidate.name;
  return GENERIC_LABELS[candidate.kind] || null;
}

// 曲がり角の半径内にある目印を「全部」距離順で返す
function findCandidates(turn: RouteTurn, landmarks: Landmark[]): (Landmark & { distM: number })[] {
  return landmarks
    .map((lm) => ({ ...lm, distM: Math.round(haversineM(turn.lat, turn.lng, lm.lat, lm.lon)) }))
    .filter((lm) => lm.distM <= TURN_RADIUS_M)
    .sort((a, b) => a.distM - b.distM);
}

// 地物を一意に識別するキー（同じ地物かどうかの判定に使う。座標で同一性を見る）
export function landmarkKey(lm: Landmark): string {
  return `${lm.lat},${lm.lon}`;
}

// 曲がり角1個の代表目印を選ぶ（目立つもの優先→実名優先→距離優先。使える候補が無ければnull）
// usedKeys: 他の曲がり角で既に選ばれた目印のキー集合。渡すと「使い回し」を避けて次点の候補を選ぶ
export function selectLandmarkForTurn(
  turn: RouteTurn,
  landmarks: Landmark[],
  usedKeys: Set<string> = new Set()
): LandmarkCandidate | null {
  const usable = findCandidates(turn, landmarks)
    .map((c) => ({
      ...c,
      display: resolveLandmarkDisplay(c),
      prominent: PROMINENT_KINDS.has(c.kind),
      hasName: !!(c.name && c.name !== "（名前なし）"),
    }))
    .filter(
      (c): c is typeof c & { display: string } => c.display !== null && !usedKeys.has(landmarkKey(c))
    );

  if (usable.length === 0) return null;

  usable.sort((a, b) => {
    if (a.prominent !== b.prominent) return a.prominent ? -1 : 1; // ① 目立つものを先に
    if (a.hasName !== b.hasName) return a.hasName ? -1 : 1; // ② 同格なら実名付きを先に
    return a.distM - b.distM; // ③ それでも同格なら近い方
  });
  return usable[0];
}

// OSRMのmaneuver情報 → 目印が無いときの「道の形」表現
export function describeManeuverShape(turn: RouteTurn): string {
  const mod = MANEUVER_MODIFIER_JA[turn.modifier] || "";
  if (turn.type === "end of road") return `突き当りを${mod || "曲がる"}`;
  if (turn.type === "fork") return `分岐を${mod || "進む"}`;
  if (turn.type === "roundabout" || turn.type === "rotary") return "ロータリーを進む";
  if (turn.type === "turn") return mod ? `${mod}に曲がる` : "曲がる";
  return mod ? `${mod}方向へ` : "道なりに進む";
}
