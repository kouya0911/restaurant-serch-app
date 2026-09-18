// src/lib/route-guide/osrm.ts
// map/smart-landmarks.js の getTurnPoints / getRouteCoords を移植
// 元コードと同じくpublicなOSRMデモサーバー（driving profile）を使用

import { SKIP_TYPES } from "./constants";
import { LatLng, RouteTurn } from "./types";

// TODO(本格運用前の宿題): 公開デモサーバーはdrivingプロファイルしか提供していないため
// 徒歩ルートでも車ルートを流用している（元コード smart-landmarks.js から引き継いだ制約）。
// 本番投入前に、徒歩対応のルーティングサービスへの切り替えを検討する。
const OSRM_BASE_URL = "http://router.project-osrm.org";

interface OsrmStep {
  distance: number;
  name?: string;
  maneuver: {
    location: [number, number];
    type: string;
    modifier?: string;
  };
}

interface OsrmRouteResponse {
  code: string;
  routes: Array<{
    legs: Array<{ steps: OsrmStep[] }>;
    geometry: { coordinates: [number, number][] };
  }>;
}

async function fetchOsrmRoute(start: LatLng, goal: LatLng, extraParams: string): Promise<OsrmRouteResponse> {
  const url =
    `${OSRM_BASE_URL}/route/v1/driving/` +
    `${start.lng},${start.lat};${goal.lng},${goal.lat}` +
    `?${extraParams}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRMリクエストエラー: ${res.status}`);
  }
  const data: OsrmRouteResponse = await res.json();
  if (data.code !== "Ok") {
    throw new Error(`OSRMエラー: ${data.code}`);
  }
  return data;
}

// 戻り値:
//   turns: 曲がり角の配列
//   segments: 区間ごとの実歩行距離(m)。長さは turns.length + 1
//     segments[0]            = 出発地 → turns[0]
//     segments[i] (1..n-1)   = turns[i-1] → turns[i]
//     segments[turns.length] = turns[最後] → 目的地
export async function getTurnPoints(
  start: LatLng,
  goal: LatLng
): Promise<{ turns: RouteTurn[]; segments: number[] }> {
  const data = await fetchOsrmRoute(start, goal, "steps=true&geometries=geojson");

  const allSteps: OsrmStep[] = [];
  for (const leg of data.routes[0].legs) {
    for (const step of leg.steps) allSteps.push(step);
  }

  const turns: RouteTurn[] = [];
  const keptIndices: number[] = [];
  allSteps.forEach((step, idx) => {
    const m = step.maneuver;
    if (SKIP_TYPES.has(m.type)) return;
    turns.push({
      lat: m.location[1],
      lng: m.location[0],
      type: m.type,
      modifier: m.modifier || "",
      street: step.name || "（名称なし）",
    });
    keptIndices.push(idx);
  });

  const segments: number[] = [];
  let prevIdx = 0; // depart(=step[0])の位置から積算開始
  for (const idx of keptIndices) {
    let dist = 0;
    for (let i = prevIdx; i < idx; i++) dist += allSteps[i].distance;
    segments.push(Math.round(dist));
    prevIdx = idx;
  }
  let lastDist = 0;
  for (let i = prevIdx; i < allSteps.length; i++) lastDist += allSteps[i].distance;
  segments.push(Math.round(lastDist)); // 最後の曲がり角 → 目的地

  return { turns, segments };
}

// ルート座標を取得（地図の線を描くため）
export async function getRouteCoords(start: LatLng, goal: LatLng): Promise<LatLng[]> {
  const data = await fetchOsrmRoute(start, goal, "overview=full&geometries=geojson");
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
}
