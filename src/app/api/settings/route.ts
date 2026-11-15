import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getProfile } from "@/lib/engine"
import { MAX_CAPACITY, MAX_UNIT_SIZE, type Intensity } from "@/lib/content"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, dailyCapacity, unitSize, intensity, maxGapDays, autoAdjust, timezone } = body as {
      name?: string
      dailyCapacity?: number
      unitSize?: number
      intensity?: Intensity
      maxGapDays?: number
      autoAdjust?: boolean
      timezone?: string
    }

    const data: Record<string, string | number | boolean> = {}
    if (typeof name === "string") data.name = name.slice(0, 40)
    if (dailyCapacity !== undefined) data.dailyCapacity = Math.max(1, Math.min(MAX_CAPACITY, Number(dailyCapacity)))
    if (unitSize !== undefined) data.unitSize = Math.max(1, Math.min(MAX_UNIT_SIZE, Number(unitSize)))
    if (intensity === "relaxed" || intensity === "balanced" || intensity === "intensive") {
      data.intensity = intensity
    }
    if (maxGapDays !== undefined) data.maxGapDays = Math.max(3, Math.min(30, Number(maxGapDays)))
    if (autoAdjust !== undefined) data.autoAdjust = Boolean(autoAdjust)
    if (typeof timezone === "string" && timezone.length < 60) {
      // التحقق من صلاحية المنطقة الزمنية
      try {
        new Intl.DateTimeFormat("en-CA", { timeZone: timezone })
        data.timezone = timezone
      } catch {
        // تجاهل المنطقة غير الصالحة
      }
    }

    await getProfile()
    if (Object.keys(data).length > 0) {
      await db.profile.update({ where: { id: 1 }, data })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("POST /api/settings error", error)
    return NextResponse.json({ error: "تعذر حفظ الإعدادات" }, { status: 500 })
  }
}
