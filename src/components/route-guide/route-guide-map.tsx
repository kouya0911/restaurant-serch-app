// src/components/route-guide/route-guide-map.tsx
// map/smart-landmarks.js が生成する map-smart.html 内の <script> による
// SVG描画ロジック（背景道路・正解ルート・目印・番号バッジ・出発地/目的地ピン）を
// Reactコンポーネントとして移植したもの。既存コンポーネントには依存しない独立ファイル。
//
// 元コードは CFG.SKETCH_STYLE で Rough.js による手書き風描画に切り替えられる作りだったが、
// 移植元(map-smart.html)自体が最後に「正確線モード（SKETCH_STYLE: false）」で生成された
// ものだったため、今回はまずそちらのみ移植している。
// TODO(本格運用前の宿題): Rough.js を使った手書き風描画（SKETCH_STYLE: true 相当）の追加。
// 元コードのコメントにも「手書き風の味付けは仕上げ工程で」とあり、当初から後回しの想定だった。

import { LatLng, MapBbox, Road, RouteGuideTurnFact } from "@/lib/route-guide/types";

const SVG_W = 900;
const SVG_H = 500;
const PAD = 50;

const ROAD_STROKE_COLOR = "#b7b0a2";
const ROAD_STROKE_WIDTH = 1;
const ROUTE_STROKE_COLOR = "#1a4fa0";
const ROUTE_STROKE_WIDTH = 4;

const CIRCLED_DIGITS = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
];
function circledNumber(n: number): string {
  return CIRCLED_DIGITS[n - 1] ?? `(${n})`;
}

export interface RouteGuideMapProps {
  routeCoords: LatLng[];
  roads: Road[];
  bbox: MapBbox;
  turnFacts: RouteGuideTurnFact[];
  start: LatLng;
  goal: LatLng;
  startName?: string;
  goalName?: string;
}

export default function RouteGuideMap({
  routeCoords,
  roads,
  bbox,
  turnFacts,
  start,
  goal,
  startName,
  goalName,
}: RouteGuideMapProps) {
  // 座標変換の基準はbbox全体にする（ルートの点だけでなく周辺の道路もSVG内に収める）
  const minLat = bbox.south;
  const maxLat = bbox.north;
  const minLng = bbox.west;
  const maxLng = bbox.east;
  const innerW = SVG_W - PAD * 2;
  const innerH = SVG_H - PAD * 2;
  const scale = Math.min(innerW / (maxLng - minLng), innerH / (maxLat - minLat));
  const offX = PAD + (innerW - (maxLng - minLng) * scale) / 2;
  const offY = PAD + (innerH - (maxLat - minLat) * scale) / 2;

  function toXY(lat: number, lng: number) {
    return {
      x: offX + (lng - minLng) * scale,
      y: offY + (maxLat - lat) * scale,
    };
  }

  function toPathD(pts: LatLng[]): string {
    return pts
      .map((p, i) => {
        const { x, y } = toXY(p.lat, p.lng);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const startPt = toXY(start.lat, start.lng);
  const goalPt = toXY(goal.lat, goal.lng);

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      role="img"
      aria-label="ドコいく道案内マップ"
      className="w-full h-auto rounded border border-border bg-[#fffdf5]"
    >
      {/* 背景: 主要道路を細い灰色の線で描く（一番下のレイヤー） */}
      {roads.map((road, i) =>
        road.pts.length < 2 ? null : (
          <path
            key={`road-${road.id ?? i}`}
            d={toPathD(road.pts)}
            fill="none"
            stroke={ROAD_STROKE_COLOR}
            strokeWidth={ROAD_STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      )}

      {/* 正解ルートを太く目立つ色で重ねる */}
      <path
        d={toPathD(routeCoords)}
        fill="none"
        stroke={ROUTE_STROKE_COLOR}
        strokeWidth={ROUTE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 選ばれた目印 / 道の形表現（案内文のステップ番号と対応する丸番号バッジ付き） */}
      {turnFacts.map((turn, i) => {
        // 目印がある曲がり角は目印の座標に、無い曲がり角は曲がり角自体の座標に描く
        // hasLandmark===true のとき lat/lon は必ず数値（toTurnFacts側の不変条件）
        const { x, y } = turn.hasLandmark ? toXY(turn.lat as number, turn.lon as number) : toXY(turn.turnLat, turn.turnLng);
        const arrow = turn.modifier
          ? turn.modifier.includes("right")
            ? "→"
            : turn.modifier.includes("left")
              ? "←"
              : "↑"
          : null;

        return (
          <g key={`turn-${i}`}>
            {turn.hasLandmark ? (
              <>
                <circle
                  cx={x}
                  cy={y}
                  r={8}
                  stroke={turn.prominent ? "#a07d1e" : "#e67e22"}
                  fill={turn.prominent ? "#f1dfa0" : "#fdebd0"}
                  strokeWidth={2}
                />
                <text x={x + 11} y={y + 4} fontSize={11} fill={turn.prominent ? "#a07d1e" : "#e67e22"} fontWeight="bold">
                  {turn.display}
                </text>
              </>
            ) : (
              <>
                {/* 目印なし: 破線風の丸＋「道の形」の文言だけを置く */}
                <circle cx={x} cy={y} r={5} stroke="#888" fill="#eee" strokeWidth={1.5} strokeDasharray="2 2" />
                <text x={x + 9} y={y + 4} fontSize={11} fill="#666">
                  {turn.shapeText}
                </text>
              </>
            )}

            {/* 曲がり方向ラベル（left→←  right→→） */}
            {arrow && (
              <text x={x + 14} y={y - 12} fontSize={14} fill="#7f8c8d">
                {arrow}
              </text>
            )}

            {/* 案内文の「①②③…」と対応する番号バッジ */}
            <StepBadge x={x} y={y} stepNo={i + 1} />
          </g>
        );
      })}

      {/* 出発地・目的地ピン（目的地には最終ステップ番号のバッジを付け、文章の最終ステップと対応させる） */}
      <Pin x={startPt.x} y={startPt.y} label={`🚩 ${startName ?? "出発地"}`} />
      <Pin x={goalPt.x} y={goalPt.y} label={`🏁 ${goalName ?? "目的地"}`} stepNo={turnFacts.length + 1} />
    </svg>
  );
}

function StepBadge({ x, y, stepNo }: { x: number; y: number; stepNo: number }) {
  const bx = x - 10;
  const by = y - 10;
  return (
    <g>
      <circle cx={bx} cy={by} r={10} stroke="#123a80" fill="#1a4fa0" strokeWidth={1.5} />
      <text x={bx} y={by + 4} textAnchor="middle" fontSize={12} fontFamily="sans-serif" fill="#fff" fontWeight="bold">
        {circledNumber(stepNo)}
      </text>
    </g>
  );
}

function Pin({ x, y, label, stepNo }: { x: number; y: number; label: string; stepNo?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={7} stroke="#2980b9" fill="#d6eaf8" strokeWidth={2} />
      <text x={x + 10} y={y + 4} fontSize={13} fill="#1a252f" fontWeight="bold">
        {label}
      </text>
      {stepNo ? <StepBadge x={x} y={y} stepNo={stepNo} /> : null}
    </g>
  );
}
