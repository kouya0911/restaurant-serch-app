// src/lib/route-guide/index.ts
// map/smart-landmarks.js のメイン処理（①〜⑥）を、HTML生成・console.logを除いた
// 純粋な関数として移植したもの。呼び出し側（Route Handlerなど）はこれを叩いて
// ルート・目印・案内文生成用データをまとめて取得する。

import { getRouteCoords, getTurnPoints } from "./osrm";
import { getLandmarks, getRoads } from "./overpass";
import { describeManeuverShape, landmarkKey, selectLandmarkForTurn } from "./landmarks";
import { calcMapBbox } from "./geo";
import { GENERIC_LABELS } from "./constants";
import { LatLng, RouteGuideData, RouteGuideTurnFact, SelectedTurn } from "./types";

export * from "./types";

export async function buildRouteGuideData(start: LatLng, goal: LatLng): Promise<RouteGuideData> {
  const { turns, segments } = await getTurnPoints(start, goal);
  const routeCoords = await getRouteCoords(start, goal);
  const bbox = calcMapBbox(routeCoords, start, goal);

  const landmarks = await getLandmarks(bbox);
  const roads = await getRoads(bbox);

  const usedLandmarkKeys = new Set<string>();
  const selected: SelectedTurn[] = turns.map((turn) => {
    const best = selectLandmarkForTurn(turn, landmarks, usedLandmarkKeys);
    if (best) {
      usedLandmarkKeys.add(landmarkKey(best));
      return { turn, landmark: best };
    }
    return { turn, shapeText: describeManeuverShape(turn) };
  });

  return { start, goal, turns, segments, routeCoords, bbox, selected, roads };
}

// map-smart.html生成時の selectedJSON と同じ形に変換する。
// server.js の /api/guidance にそのまま渡せる「事実」だけのデータになる
// （目印の実名を見せるか種別名だけにするかの判断は、従来通りAI呼び出し側=server.js相当の処理で行う）
export function toTurnFacts(selected: SelectedTurn[]): RouteGuideTurnFact[] {
  return selected.map(({ turn, landmark, shapeText }) => ({
    turnLat: turn.lat,
    turnLng: turn.lng,
    modifier: turn.modifier,
    hasLandmark: !!landmark,
    lat: landmark ? landmark.lat : null,
    lon: landmark ? landmark.lon : null,
    display: landmark ? landmark.display : null,
    prominent: landmark ? landmark.prominent : false,
    category: landmark ? GENERIC_LABELS[landmark.kind] ?? null : null,
    shapeText: shapeText ?? null,
  }));
}
