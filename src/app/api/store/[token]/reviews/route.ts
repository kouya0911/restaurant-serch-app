import { NextResponse } from "next/server"
import { getStoreReviews } from "@/lib/store/reviews"

// 店長ページが5秒ごとに呼ぶレビューAPI。ログイン不要(middleware で /api/store/ ごと除外済み)。
// トークンを知っている人だけが結果を得られ、無効なトークンは 404。
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const result = await getStoreReviews(token)

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 500, headers: NO_STORE })
  }
  if (!result.data) {
    return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE })
  }
  return NextResponse.json(result.data, { headers: NO_STORE })
}
