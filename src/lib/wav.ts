// أدوات WAV على الخادم — قراءة عامة وتغليف وتقسيم
// مشتركة بين التسميع الصوتي (دفعة واحدة) والترتيل اللحظي (مقاطع متتابعة)

export class VoiceError extends Error {}

export interface ParsedWav {
  pcm: Buffer
  sampleRate: number
  bits: number
  channels: number
}

/** قراءة WAV عامة: يجد chunks(fmt) وdata أياً كان ترتيبها */
export function parseWav(buf: Buffer): ParsedWav {
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
export function wrapWav(pcm: Buffer, p: { sampleRate: number; bits: number; channels: number }): Buffer {
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
export function splitToSegments(p: ParsedWav, maxSeconds: number): Buffer[] {
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
