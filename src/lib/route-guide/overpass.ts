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

// 昨日の本番移植時、混雑する公式インスタンスを避けてlz4ミラーに切り替えたところ
// 成功したため、lz4を先頭に据えて公式→kumiの順でフォールバックする。
const OVERPASS_MIRRORS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const MIRROR_RETRY_DELAY_MS = 500;
const MIRROR_FETCH_TIMEOUT_MS = 15000;

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function overpassFetchFromMirror(
  url: string,
  query: string,
): Promise<{ elements: OverpassElement[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MIRROR_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // 406対策としてAccept / User-Agentヘッダーが必須（元コードのコメントを踏襲）
        Accept: "application/json",
        "User-Agent": "doko-iku-map/0.1 (food-delivery-app)",
      },
      body: `data=${encodeURIComponent(query)}`,
      next: { revalidate: 86400 },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text.slice(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// 公開Overpassインスタンスは混雑時に504を返すことがあるため、複数ミラーを
// 順番に試し、失敗したら少し待って次のミラーにフォールバックする。
// 全ミラーが失敗した場合のみエラーを投げる（メッセージにはユーザー向け表示の
// 判定（route-guide-dialog.tsx）が拾えるよう "Overpass" を含める）。
async function overpassFetch(query: string): Promise<{ elements: OverpassElement[] }> {
  let lastError: unknown;

  for (let i = 0; i < OVERPASS_MIRRORS.length; i++) {
    const url = OVERPASS_MIRRORS[i];
    try {
      const data = await overpassFetchFromMirror(url, query);
      console.log(`[overpass] 成功: ${url}`);
      return data;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[overpass] 失敗: ${url} (${message})`);
      if (i < OVERPASS_MIRRORS.length - 1) {
        await sleep(MIRROR_RETRY_DELAY_MS);
      }
    }
  }

  const lastMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Overpassリクエストエラー: 全ミラーで失敗しました (${lastMessage})`);
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
