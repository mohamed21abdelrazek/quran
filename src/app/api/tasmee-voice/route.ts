import { NextRequest, NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { getPagePayload } from "@/lib/mushaf-data"
import { gradeTasmee, type TasmeeResult } from "@/lib/tasmee"

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

interface ParsedWav {
  pcm: Buffer
  sampleRate: number
  bits: number
  channels: number
}

/** قراءة WAV عامة: يجد chunks fmt وdata أياً كان ترتيبها */
function parseWav(buf: Buffer): ParsedWav {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new VoiceError("صيغة الصوت غير مدعومة — سجّل من داخل التطبيق")
  }
  let off = 12
  let fmt: Buffer | null = null
  let pcm: Buffer | null = null
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === "fmt " && !fmt) fmt = buf.subarray(off + 8, off + 8 + Math.min(size, 16))
    else if (id === "data") {
      pcm = buf.subarray(off + 8, off + 8 + size)
      break
    }
    off += 8 + size + (size % 2)
  }
  if (!fmt || !pcm || pcm.length === 0) {
    throw new VoiceError("ملف صوتي تالف — أعد التسجيل")
  }
  const channels = fmt.readUInt16LE(2)
  const sampleRate = fmt.readUInt32LE(4)
  const bits = fmt.readUInt16LE(14)
  if (sampleRate === 0 || (bits !== 8 && bits !== 16 && bits !== 24 && bits !== 32)) {
    throw new VoiceError("ملف صوتي غير قياسي — أعد التسجيل")
  }
  return { pcm, sampleRate, bits, channels: channels || 1 }
}

/** تغليف PCM بترويسة WAV قياسية */
function wrapWav(pcm: Buffer, p: { sampleRate: number; bits: number; channels: number }): Buffer {
  const bytesPerFrame = (p.bits / 8) * p.channels
  const header = Buffer.alloc(44)
  header.write("RIFF", 0, "ascii")
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write("WAVE", 8, "ascii")
  header.write("fmt ", 12, "ascii")
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(p.channels, 22)
  header.writeUInt32LE(p.sampleRate, 24)
  header.writeUInt32LE(p.sampleRate * bytesPerFrame, 28)
  header.writeUInt16LE(bytesPerFrame, 32)
  header.writeUInt16LE(p.bits, 34)
  header.write("data", 36, "ascii")
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** تقسيم الصوت لمقاطع لا تتجاوز حد خدمة التفريغ */
function splitToSegments(p: ParsedWav, maxSeconds: number): Buffer[] {
  const bytesPerFrame = (p.bits / 8) * p.channels
  const maxBytes = Math.floor(p.sampleRate * maxSeconds) * bytesPerFrame
  if (p.pcm.length <= maxBytes) return [wrapWav(p.pcm, p)]
  const out: Buffer[] = []
  for (let off = 0; off < p.pcm.length; off += maxBytes) {
    const part = p.pcm.subarray(off, Math.min(off + maxBytes, p.pcm.length))
    out.push(wrapWav(part, p))
  }
  return out
}

class VoiceError extends Error {}

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
    let parsed: ParsedWav
    try {
      parsed = parseWav(raw)
    } catch (e) {
      const msg = e instanceof VoiceError ? e.message : "صيغة صوت غير مدعومة"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const segments = splitToSegments(parsed, SEGMENT_SECONDS)

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
