import { NextRequest, NextResponse } from "next/server"
import { updateRanges } from "@/lib/engine"

export const dynamic = "force-dynamic"

function validateRanges(ranges: unknown): ranges is { from: number; to: number }[] {
    return (
        Array.isArray(ranges) &&
        ranges.every(
            (r) =>
                Number.isInteger(r?.from) &&
                Number.isInteger(r?.to) &&
                r.from >= 1 &&
                r.to <= 604 &&
                r.from <= r.to
        )
    )
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const add = (body?.add ?? []) as { from: number; to: number }[]
        const remove = (body?.remove ?? []) as { from: number; to: number }[]

        if (!validateRanges(add) || !validateRanges(remove)) {
            return NextResponse.json({ error: "نطاق صفحات غير صالح" }, { status: 400 })
        }

        const result = await updateRanges(add, remove)
        return NextResponse.json(result)
    } catch (error) {
        console.error("POST /api/ranges error", error)
        return NextResponse.json({ error: "تعذر تحديث الصفحات المحفوظة" }, { status: 500 })
    }
}
