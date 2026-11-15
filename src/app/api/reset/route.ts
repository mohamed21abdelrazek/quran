import { NextResponse } from "next/server"
import { resetAll } from "@/lib/engine"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const result = await resetAll()
    return NextResponse.json(result)
  } catch (error) {
    console.error("POST /api/reset error", error)
    return NextResponse.json({ error: "تعذر إعادة الضبط" }, { status: 500 })
  }
}
