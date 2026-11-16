import { NextRequest, NextResponse } from "next/server"
import { toggleBookmark } from "@/lib/tools"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { page } = body as { page?: number }
    if (!page) return NextResponse.json({ error: "رقم صفحة مفقود" }, { status: 400 })
    return NextResponse.json(await toggleBookmark(page))
  } catch (error) {
    console.error("POST /api/bookmarks error", error)
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء" }, { status: 500 })
  }
}
