// src/lib/route-guide/overpass.ts
// map/smart-landmarks.js の getLandmarks / getRoads を移植
//
// 元コードはNodeのcurl(execSync)経由でOverpassを叩いていたが、
// Next.jsのサーバー環境ではfetch()で直接POSTできるため、そちらに置き換えている。
// クエリ内容・選定ロジックは変更していない。
// ローカルJSONファイルへのキャッシュ（landmarks-cache-*.json 等）はサーバーレス環境に
// 持ち越せないため廃止し、Next.jsのfetchキャッシュ（next.revalidate）に委ねる。

import { LANDMARK_TAG_KEYS, ROAD_CLASSES } from "./constants";
import { Landmark, MapBbox, Road } from "./types";
import { classifyLandmark } from "./landmarks";

const OVERPASS_URL = "https://lz4.overpass-api.de/api/interpreter";

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

// TODO(本格運用前の宿題): Overpassの公開インスタンスは混雑時に504を返すことがある
// （lz4ミラーでも発生しうる）。本番投入前に、リトライ処理と、失敗時にユーザーへ
// 分かりやすいエラー表示を出す仕組みを追加する。
async function overpassFetch(query: string): Promise<{ elements: OverpassElement[] }> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // 406対策としてAccept / User-Agentヘッダーが必須（元コードのコメントを踏襲）
      Accept: "application/json",
      "User-Agent": "doko-iku-map/0.1 (food-delivery-app)",
    },
    body: `data=${encodeURIComponent(query)}`,
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Overpassリクエストエラー: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

function bboxToStr(bbox: MapBbox): string {
  return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
}

// 目印取得
export async function getLandmarks(bbox: MapBbox): Promise<Landmark[]> {
  const b = bboxToStr(bbox);
  const tagClauses = LANDMARK_TAG_KEYS.map((k) => `nwr["${k}"](${b});`).join("\n  ");
  const query = `[out:json][timeout:30];
(
  nwr["name"](${b});
  ${tagClauses}
  nwr["highway"="bus_stop"](${b});
);
out center tags;`;

  const data = await overpassFetch(query);

  const landmarks: Landmark[] = [];
  for (const n of data.elements) {
    const coord = n.type === "node" && n.lat != null && n.lon != null
      ? { lat: n.lat, lon: n.lon }
      : n.center
        ? { lat: n.center.lat, lon: n.center.lon }
        : null;
    if (!coord) continue;
    landmarks.push({
      lat: coord.lat,
      lon: coord.lon,
      kind: classifyLandmark(n.tags || {}),
      name: n.tags?.name || n.tags?.["name:ja"] || "（名前なし）",
    });
  }
  return landmarks;
}

// 背景道路取得
export async function getRoads(bbox: MapBbox): Promise<Road[]> {
  const b = bboxToStr(bbox);
  const classPattern = ROAD_CLASSES.join("|");
  const query =
    `[out:json][timeout:30];` +
    `way["highway"~"^(${classPattern})$"](${b});` +
    `out geom;`;

  const data = await overpassFetch(query);

  const roads: Road[] = [];
  for (const w of data.elements) {
    if (!Array.isArray(w.geometry) || w.geometry.length < 2) continue;
    roads.push({
      id: w.id,
      class: w.tags?.highway || "",
      pts: w.geometry.map((p) => ({ lat: p.lat, lng: p.lon })),
    });
  }
  return roads;
}
