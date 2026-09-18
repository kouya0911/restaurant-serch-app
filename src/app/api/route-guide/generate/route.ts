// src/app/api/route-guide/generate/route.ts
// 「ドコいく道案内」: 出発地・目的地の座標から、OSRM/Overpassでルート・目印データを組み立て、
// OpenAIで案内文を生成してまとめて返す。map/smart-landmarks.js + map/server.js 相当。

import { NextRequest, NextResponse } from "next/server";
import { buildRouteGuideData, toTurnFacts, LatLng } from "@/lib/route-guide";
import { generateGuidance } from "@/lib/route-guide/guidance";

function isLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.lat === "number" && typeof v.lng === "number" && Number.isFinite(v.lat) && Number.isFinite(v.lng);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const start = body?.start;
    const goal = body?.goal;
    const startName: string | undefined = typeof body?.startName === "string" ? body.startName : undefined;
    const goalName: string | undefined = typeof body?.goalName === "string" ? body.goalName : undefined;

    if (!isLatLng(start) || !isLatLng(goal)) {
      return NextResponse.json({ error: "start/goal の緯度経度（lat, lng）が必要です" }, { status: 400 });
    }

    const routeData = await buildRouteGuideData(start, goal);
    const turnFacts = toTurnFacts(routeData.selected);

    const guidanceResult = await generateGuidance({
      start: startName,
      goal: goalName,
      turnFacts,
      segments: routeData.segments,
    });

    if ("error" in guidanceResult) {
      console.error("[route-guide/generate] guidance error:", guidanceResult.error);
      return NextResponse.json({ error: guidanceResult.error }, { status: 502 });
    }

    return NextResponse.json({
      routeCoords: routeData.routeCoords,
      roads: routeData.roads,
      bbox: routeData.bbox,
      turnFacts,
      guidance: guidanceResult.data,
    });
  } catch (err: any) {
    console.error("[route-guide/generate] unexpected error:", err.message || err);
    return NextResponse.json({ error: err.message || "予期せぬエラーが発生しました" }, { status: 500 });
  }
}
