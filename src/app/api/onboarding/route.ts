import { NextRequest, NextResponse } from "next/server"
import { applyOnboarding } from "@/lib/engine"
import { MAX_CAPACITY, MAX_UNIT_SIZE, type Intensity } from "@/lib/content"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, ranges, baseline, dailyCapacity, unitSize, intensity, maxGapDays, autoAdjust } = body as {
      name?: string
      ranges?: { from: number; to: number }[]
      baseline?: number
      dailyCapacity?: number
      unitSize?: number
      intensity?: Intensity
      maxGapDays?: number
      autoAdjust?: boolean
    }

    if (!ranges || ranges.length === 0) {
      return NextResponse.json({ error: "اختر صفحاتك المحفوظة أولاً" }, { status: 400 })
    }
    for (const r of ranges) {
      if (!Number.isInteger(r?.from) || !Number.isInteger(r?.to) || r.from < 1 || r.to > 604 || r.from > r.to) {
        return NextResponse.json({ error: "نطاق صفحات غير صالح" }, { status: 400 })
      }
    }

    const result = await applyOnboarding({
      name: (name ?? "").toString().slice(0, 40),
      ranges,
      baseline: Math.max(0, Math.min(4, Number(baseline ?? 0))),
      dailyCapacity: Math.max(1, Math.min(MAX_CAPACITY, Number(dailyCapacity ?? 3))),
      unitSize: Math.max(1, Math.min(MAX_UNIT_SIZE, Number(unitSize ?? 1))),
      intensity: (intensity ?? "balanced") as Intensity,
      maxGapDays: Math.max(3, Math.min(30, Number(maxGapDays ?? 10))),
      autoAdjust: autoAdjust !== false,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("POST /api/onboarding error", error)
    return NextResponse.json({ error: "تعذر إنشاء الخطة" }, { status: 500 })
  }
}
