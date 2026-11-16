import { NextRequest, NextResponse } from "next/server"
import { addDifficultWord, removeDifficultWord } from "@/lib/tools"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body as { action?: "add" | "remove" }

    if (action === "add") {
      const { key, word, surah, ayah, page } = body as {
        key?: string
        word?: string
        surah?: number
        ayah?: number
        page?: number
      }
      const result = await addDifficultWord({
        key: key ?? "",
        word: (word ?? "").trim(),
        surah: surah ?? 0,
        ayah: ayah ?? 0,
        page: page ?? 1,
      })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json(result)
    }

    if (action === "remove") {
      const { id } = body as { id?: number }
      if (!id) return NextResponse.json({ error: "معرّف مفقود" }, { status: 400 })
      return NextResponse.json(await removeDifficultWord(id))
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
  } catch (error) {
    console.error("POST /api/difficult error", error)
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء" }, { status: 500 })
  }
}
