// src/lib/route-guide/geo.ts
// map/smart-landmarks.js の haversineM / calcMapBbox を移植

import { BBOX_MARGIN } from "./constants";
import { LatLng, MapBbox } from "./types";

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 出発地・目的地・ルート全体が入るバウンディングボックスを計算
export function calcMapBbox(routeCoords: LatLng[], start: LatLng, goal: LatLng): MapBbox {
  const lats = routeCoords.map((c) => c.lat).concat([start.lat, goal.lat]);
  const lngs = routeCoords.map((c) => c.lng).concat([start.lng, goal.lng]);
  return {
    south: Math.min(...lats) - BBOX_MARGIN,
    north: Math.max(...lats) + BBOX_MARGIN,
    west: Math.min(...lngs) - BBOX_MARGIN,
    east: Math.max(...lngs) + BBOX_MARGIN,
  };
}
