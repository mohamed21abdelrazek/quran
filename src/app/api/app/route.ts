import { NextResponse } from "next/server"
import { buildAppState } from "@/lib/engine"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const state = await buildAppState()
    return NextResponse.json(state)
  } catch (error) {
    console.error("GET /api/app error", error)
    return NextResponse.json({ error: "فشل تحميل حالة التطبيق" }, { status: 500 })
  }
}
