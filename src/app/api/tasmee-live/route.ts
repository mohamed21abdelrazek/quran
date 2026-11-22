import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { parseWav, wrapWav, VoiceError } from "@/lib/wav"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/** حد أقصى لحجم المقطع اللحظي — ٢٠ ثانية WAV ١٦kHz تكفي مقطع كلام واحد */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
/** المقطع الواحد لا يتجاوز هذا الطول (حد خدمة التفريغ ٣٠ ث) */
const SEGMENT_SECONDS = 25

interface LiveBody {
  audioBase64?: string
}

/**
 * POST /api/tasmee-live
 * التفريغ اللحظي لمقطع تلاوة (بلا تصحيح — المحاذاة تجري في العميل):
 * يستقبل مقطعاً صوتياً من التقاط لحظي (VAD) ويعيد النص المسموع فقط.
 * الناتج: { text }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LiveBody
    const { audioBase64 } = body

    if (!audioBase64 || typeof audioBase64 !== "string") {
      return NextResponse.json({ error: "لا يوجد مقطع صوتي" }, { status: 400 })
    }
    if ((audioBase64.length * 3) / 4 > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "المقطع طويل جداً" }, { status: 413 })
    }

    const raw = Buffer.from(audioBase64, "base64")
    let segments: Buffer[]
    try {
      const parsed = parseWav(raw)
      const bytesPerFrame = (parsed.bits / 8) * parsed.channels
      const maxBytes = Math.floor(parsed.sampleRate * SEGMENT_SECONDS) * bytesPerFrame
      if (parsed.pcm.length <= maxBytes) {
        segments = [wrapWav(parsed.pcm, parsed)]
      } else {
        segments = []
        for (let off = 0; off < parsed.pcm.length; off += maxBytes) {
          segments.push(wrapWav(parsed.pcm.subarray(off, Math.min(off + maxBytes, parsed.pcm.length)), parsed))
        }
      }
    } catch (e) {
      const msg = e instanceof VoiceError ? e.message : "صيغة صوت غير مدعومة"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const zai = await ZAI.create()
    const texts: string[] = []
    for (const seg of segments) {
      const asr = await zai.audio.asr.create({ file_base64: seg.toString("base64") })
      const t = (asr.text ?? "").trim()
      if (t) texts.push(t)
    }
    const text = texts.join(" ").replace(/\s+/g, " ").trim()

    // بلا نص: ليست خطأ — ربما سكوت أو ضجيج؛ يعيد نصاً فارغاً ويتابع العميل
    return NextResponse.json({ text })
  } catch (error) {
    console.error("POST /api/tasmee-live error", error)
    return NextResponse.json({ error: "تعذّر تفريغ المقطع — سيتابع الاستماع" }, { status: 500 })
  }
}
