import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { getPagePayload } from "@/lib/mushaf-data"
import { gradeTasmee, type TasmeeResult } from "@/lib/tasmee"
import { parseWav, splitToSegments, VoiceError } from "@/lib/wav"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** حد أقصى لحجم الصوت بعد فك base64 — ٣٠MB يكفي نحو ١٥ دقيقة تسجيل WAV ١٦kHz */
const MAX_AUDIO_BYTES = 30 * 1024 * 1024
/** طول المقطع الواحد بالثواني — خدمة التفريغ تقبل حتى ٣٠ ثانية */
const SEGMENT_SECONDS = 25

interface VoiceBody {
  audioBase64?: string
  page?: number
}

/**
 * POST /api/tasmee-voice
 * الاستماع إلى التسميع الصوتي وتصحيحه كلمة كلمة:
 * ١) تقسيم التسجيل لمقاطع ≤ ٢٥ ثانية (حد خدمة التفريغ)
 * ٢) تفريغ كل مقطع ودمج النصوص
 * ٣) مطابقة النص مع صفحة المصحف بمحاذاة Needleman–Wunsch
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
    if ((audioBase64.length * 3) / 4 > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "التسجيل طويل جداً — سمّع نصف صفحة في كل مرة" }, { status: 413 })
    }

    const payload = getPagePayload(page)
    if (!payload) {
      return NextResponse.json({ error: "الصفحة خارج نطاق المصحف" }, { status: 404 })
    }
    const expectedText = payload.ayahs.map((a) => a.text).join(" ")

    // ١+٢) التقسيم والتفريغ
    const raw = Buffer.from(audioBase64, "base64")
    let segments: Buffer[]
    try {
      segments = splitToSegments(parseWav(raw), SEGMENT_SECONDS)
    } catch (e) {
      const msg = e instanceof VoiceError ? e.message : "صيغة صوت غير مدعومة"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const zai = await ZAI.create()
    const texts: string[] = []
    for (let i = 0; i < segments.length; i++) {
      const asr = await zai.audio.asr.create({ file_base64: segments[i].toString("base64") })
      const t = (asr.text ?? "").trim()
      if (t) texts.push(t)
    }
    const transcription = texts.join(" ").replace(/\s+/g, " ").trim()

    if (!transcription) {
      return NextResponse.json(
        { error: "لم نتعرّف على صوت في التسجيل — تحدث بوضوح قريباً من الميكروفون ثم أعد المحاولة" },
        { status: 422 },
      )
    }

    // ٣) التصحيح بنفس محرك التسميع الكتابي
    const result: TasmeeResult = gradeTasmee(expectedText, transcription)

    return NextResponse.json({ transcription, result, segments: segments.length })
  } catch (error) {
    console.error("POST /api/tasmee-voice error", error)
    return NextResponse.json(
      { error: "تعذّر تصحيح التسميع الصوتي — أعد المحاولة بعد قليل" },
      { status: 500 },
    )
  }
}
