import { NextRequest, NextResponse } from "next/server"
import { getPagePayload } from "@/lib/mushaf-data"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const n = Number(req.nextUrl.searchParams.get("n"))
  if (!Number.isInteger(n)) {
    return NextResponse.json({ error: "رقم صفحة غير صالح" }, { status: 400 })
  }
  const payload = getPagePayload(n)
  if (!payload) {
    return NextResponse.json({ error: "الصفحة خارج نطاق المصحف (1–604)" }, { status: 404 })
  }
  return NextResponse.json(payload)
}
