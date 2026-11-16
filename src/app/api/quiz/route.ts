import { NextRequest, NextResponse } from "next/server"
import { logQuiz } from "@/lib/tools"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { kind, score, correct, total, detail } = body as {
      kind?: string
      score?: number
      correct?: number
      total?: number
      detail?: string
    }
    if (!kind || typeof score !== "number" || typeof correct !== "number" || typeof total !== "number") {
      return NextResponse.json({ error: "بيانات الجلسة ناقصة" }, { status: 400 })
    }
    return NextResponse.json(
      await logQuiz({ kind, score, correct, total, detail: detail ?? "" }),
    )
  } catch (error) {
    console.error("POST /api/quiz error", error)
    return NextResponse.json({ error: "تعذر تسجيل الجلسة" }, { status: 500 })
  }
}
