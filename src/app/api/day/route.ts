import { NextRequest, NextResponse } from "next/server"
import { cannotToday } from "@/lib/engine"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.action !== "cannot") {
      return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
    }
    const result = await cannotToday()
    return NextResponse.json(result)
  } catch (error) {
    console.error("POST /api/day error", error)
    return NextResponse.json({ error: "تعذر إغلاق ورد اليوم" }, { status: 500 })
  }
}
