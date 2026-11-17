import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { getPagePayload } from "@/lib/mushaf-data"
import { gradeTasmee, type TasmeeResult } from "@/lib/tasmee"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/** حد أقصى لحجم الصوت بعد فك base64 — ٣٠MB يكفي نحو ١٥ دقيقة تسجيل */
const MAX_AUDIO_BYTES = 30 * 1024 * 1024

interface VoiceBody {
  audioBase64?: string
  page?: number
}

/**
 * POST /api/tasmee-voice
 * الاستماع إلى التسميع الصوتي وتصحيحه كلمة كلمة:
 * ١) تفريغ الصوت عبر ASR
 * ٢) مطابقته مع نص الصفحة بمحاذاة Needleman–Wunsch
 * الناتج: { transcription, result } — نفس بنية التسميع الكتابي
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VoiceBody
    const { audioBase64, page } = body

    if (!audioBase64 || typeof audioBase64 !== "string") {
      return NextResponse.json({ error: "لا يوجد تسجيل صوتي" }, { status: 400 })
    }
    if (!Number.isInteger(page) || page < 1 || page > 604) {
      return NextResponse.json({ error: "رقم صفحة غير صالح" }, { status: 400 })
    }
    // تقدير الحجم الخام من طول base64 (¾ تقريباً)
    if ((audioBase64.length * 3) / 4 > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "التسجيل طويل جداً — سمّع نصف صفحة في كل مرة" }, { status: 413 })
    }

    const payload = getPagePayload(page)
    if (!payload) {
      return NextResponse.json({ error: "الصفحة خارج نطاق المصحف" }, { status: 404 })
    }
    const expectedText = payload.ayahs.map((a) => a.text).join(" ")

    // ١) التفريغ الصوتي
    const zai = await ZAI.create()
    const asr = await zai.audio.asr.create({ file_base64: audioBase64 })
    const transcription = (asr.text ?? "").trim()

    if (!transcription) {
      return NextResponse.json(
        { error: "لم نتعرّف على صوت في التسجيل — تحدث بوضوح قريباً من الميكروفون ثم أعد المحاولة" },
        { status: 422 },
      )
    }

    // ٢) التصحيح بنفس محرك التسميع الكتابي
    const result: TasmeeResult = gradeTasmee(expectedText, transcription)

    return NextResponse.json({ transcription, result })
  } catch (error) {
    console.error("POST /api/tasmee-voice error", error)
    return NextResponse.json(
      { error: "تعذّر تصحيح التسميع الصوتي — أعد المحاولة بعد قليل" },
      { status: 500 },
    )
  }
}
