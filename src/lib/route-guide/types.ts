// src/lib/route-guide/types.ts
// map/smart-landmarks.js の内部データ構造をTypeScriptに移植したもの

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteTurn {
  lat: number;
  lng: number;
  type: string;
  modifier: string;
  street: string;
}

export interface Landmark {
  lat: number;
  lon: number;
  kind: string;
  name: string;
}

export interface LandmarkCandidate extends Landmark {
  distM: number;
  display: string;
  prominent: boolean;
  hasName: boolean;
}

export interface Road {
  id: number;
  class: string;
  pts: LatLng[];
}

export interface MapBbox {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface SelectedTurn {
  turn: RouteTurn;
  landmark?: LandmarkCandidate;
  shapeText?: string;
}

export interface RouteGuideData {
  start: LatLng;
  goal: LatLng;
  turns: RouteTurn[];
  segments: number[];
  routeCoords: LatLng[];
  bbox: MapBbox;
  selected: SelectedTurn[];
  roads: Road[];
}

// server.js の /api/guidance に渡す「事実」だけの形（map-smart.html生成時の selectedJSON と同じ形）
export interface RouteGuideTurnFact {
  turnLat: number;
  turnLng: number;
  modifier: string;
  hasLandmark: boolean;
  lat: number | null;
  lon: number | null;
  display: string | null;
  prominent: boolean;
  category: string | null;
  shapeText: string | null;
}
