// src/lib/route-guide/constants.ts
// map/smart-landmarks.js の CONFIG / 各種辞書をそのまま移植

export const TURN_RADIUS_M = 100; // 曲がり角の目印を探す半径（メートル）

// 徒歩圏専用サービスとしての上限（メートル）。これを超えるルートは
// OSRM/Overpass/OpenAIを呼ばず、その場で優しいメッセージを返して打ち切る。
export const MAX_ROUTE_DISTANCE_M = 3000;

// 目印候補として拾うタグ種別
export const LANDMARK_TAG_KEYS = ["amenity", "shop", "leisure", "natural", "historic", "tourism"];

export const BBOX_MARGIN = 0.0015; // 描画範囲の余白（度）

// 背景道路として描画するhighwayクラス
export const ROAD_CLASSES = ["primary", "secondary", "tertiary", "residential"];

export const SKIP_TYPES = new Set(["depart", "arrive", "new name", "notification", "continue"]);

// 「誰でも分かる目立つ目印」= 多少遠くても(半径内なら)優先するkind
export const PROMINENT_KINDS = new Set([
  "amenity=school",
  "amenity=community_centre",
  "leisure=park",
  "highway=bus_stop",
  "bridge",
  "shop=supermarket",
  "shop=department_store",
  "shop=mall",
  "shop=doityourself",
]);

// kind(内部分類) → 日本語の一般名
export const GENERIC_LABELS: Record<string, string> = {
  "amenity=parking": "駐車場",
  "amenity=bench": "ベンチ",
  "amenity=bicycle_rental": "レンタサイクル",
  "amenity=school": "学校",
  "amenity=kindergarten": "保育園",
  "amenity=community_centre": "公民館",
  "amenity=pharmacy": "薬局",
  "shop=convenience": "コンビニ",
  "shop=supermarket": "スーパー",
  "shop=department_store": "デパート",
  "shop=mall": "ショッピングモール",
  "shop=doityourself": "ホームセンター",
  "highway=bus_stop": "バス停",
  "highway=traffic_signals": "信号",
  "leisure=park": "公園",
  bridge: "橋",
};

// OSRMのmaneuver.modifier → 日本語の方向
export const MANEUVER_MODIFIER_JA: Record<string, string> = {
  left: "左",
  right: "右",
  "slight left": "斜め左",
  "slight right": "斜め右",
  "sharp left": "急に左",
  "sharp right": "急に右",
  straight: "直進",
  uturn: "Uターン",
};
