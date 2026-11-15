import { NextRequest, NextResponse } from "next/server"
import { completeTask, snoozeTask } from "@/lib/engine"
import type { Quality } from "@/lib/content"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { taskId, action, quality } = body as {
      taskId?: number
      action?: "complete" | "snooze"
      quality?: Quality
    }

    if (!taskId || !action) {
      return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 })
    }

    if (action === "complete") {
      const q: Quality = quality === "perfect" || quality === "good" || quality === "hard" ? quality : "good"
      const result = await completeTask(taskId, q)
      return NextResponse.json(result)
    }

    if (action === "snooze") {
      const result = await snoozeTask(taskId)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
  } catch (error) {
    console.error("POST /api/task error", error)
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء" }, { status: 500 })
  }
}
