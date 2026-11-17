// أدوات التسجيل الصوتي للتسميع: تسجيل + مؤقت + تحويل إلى WAV ١٦kHz أحادي
// (التفريغ الصوتي يقبل WAV بأي معدل، لكن ١٦kHz أحادي أصغر حجماً وأدق للكلام)

export interface VoiceRecorder {
  /** بدء التسجيل — يرفض إذا الميكروفون مرفوض أو لا يوجد دعم */
  start: () => Promise<void>
  /** إيقاف التسجيل وإرجاع الصوت WAV بصيغة base64 (بلا ترويسة data:) */
  stop: () => Promise<string>
  /** هل يوجد تسجيل جارٍ؟ */
  active: () => boolean
  /** تحرير الموارد (استدعِ عند إلغاء المكوّن) */
  dispose: () => void
}

export class MicDeniedError extends Error {
  constructor() {
    super("رُفض الوصول إلى الميكروفون — اسمح به من إعدادات المتصفح ثم أعد المحاولة")
    this.name = "MicDeniedError"
  }
}

export function createVoiceRecorder(): VoiceRecorder {
  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let stream: MediaStream | null = null
  let active = false

  const ensureSupport = () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("متصفحك لا يدعم التسجيل الصوتي — جرّب Chrome أو Safari حديثاً")
    }
  }

  return {
    async start() {
      ensureSupport()
      if (active) return
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch (e: unknown) {
        if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
          throw new MicDeniedError()
        }
        throw new Error("تعذّر فتح الميكروفون — تحقق من توصيله")
      }
      // صيغة افتراضية آمنة (webm/opus أو mp4 على سفاري) — تُفكّ وتُعاد ترميزها WAV لاحقاً
      chunks = []
      mediaRecorder = new MediaRecorder(stream)
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data)
      }
      mediaRecorder.start(500)
      active = true
    },

    stop() {
      return new Promise<string>((resolve, reject) => {
        if (!mediaRecorder || !active) {
          reject(new Error("لا يوجد تسجيل جارٍ"))
          return
        }
        const mr = mediaRecorder
        mr.onstop = async () => {
          active = false
          try {
            const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" })
            chunks = []
            const base64 = await blobToWavBase64(blob)
            resolve(base64)
          } catch (e) {
            reject(e instanceof Error ? e : new Error("تعذّر تجهيز التسجيل"))
          } finally {
            stream?.getTracks().forEach((t) => t.stop())
            stream = null
            mediaRecorder = null
          }
        }
        mr.stop()
      })
    },

    active: () => active,

    dispose() {
      try {
        if (mediaRecorder && active) mediaRecorder.stop()
      } catch {
        /* تجاهل */
      }
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      mediaRecorder = null
      active = false
    },
  }
}

/** فك الصوت المسجّل وإعادة ترميزه WAV PCM ١٦kHz أحادي ثم ترميزه base64 */
async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0))
    const wav = encodeWav16kMono(decoded)
    return arrayBufferToBase64(wav)
  } finally {
    void audioCtx.close()
  }
}

/** إعادة تقطيع الصوت إلى ١٦kHz أحادي ثم تغليفه بترويسة WAV */
function encodeWav16kMono(buffer: AudioBuffer): ArrayBuffer {
  const targetRate = 16000
  const length = Math.max(1, Math.round((buffer.duration * targetRate) | 0))
  // خلط القنوات إلى أحادية
  const mono = new Float32Array(length)
  const channels = Math.min(2, buffer.numberOfChannels)
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch)
    // أخذ عينات بخطوة (قد يكون معدل المصدر مختلفاً) — تقريب خطي
    const ratio = data.length / length
    for (let i = 0; i < length; i++) {
      const idx = Math.min(data.length - 1, Math.round(i * ratio))
      mono[i] += data[idx] / channels
    }
  }
  const bytesPerSample = 2
  const dataArray = new Int16Array(mono.length)
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]))
    dataArray[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const wav = new ArrayBuffer(44 + dataArray.length * bytesPerSample)
  const view = new DataView(wav)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, "RIFF")
  view.setUint32(4, 36 + dataArray.length * bytesPerSample, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // أحادي
  view.setUint32(24, targetRate, true)
  view.setUint32(28, targetRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true) // بتات
  writeStr(36, "data")
  view.setUint32(40, dataArray.length * bytesPerSample, true)
  new Int16Array(wav, 44).set(dataArray)
  return wav
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** صيغة mm:ss للمؤقت */
export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, "0")}`
}
