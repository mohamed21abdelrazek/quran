// الالتقاط اللحظي للتلاوة — بث الميكروفون مع كشف نشاط الصوت (VAD):
// يقسّم الكلام لمقاطع تلقائياً عند سكوت ١.٢ ثانية (أو ١٢ ثانية قصوى)
// ويسلّم كل مقطع WAV ١٦kHz أحادي base64 فور جاهزيته — لتغذيته للتفريغ اللحظي

import { MicDeniedError } from "./voice"

export interface LiveCaptureHandle {
  /** إيقاف الاستماع — يسلّم المقطع الجاري إن وُجد ثم يحرر الميكروفون */
  stop: () => void
}

export interface LiveCaptureOptions {
  /** مقطع كلام جاهز: WAV base64 + مدته بالثواني */
  onSegment: (wavBase64: string, durationSec: number) => void
  /** مستوى الصوت اللحظي ٠..١ (نحو كل ٨٥ مللي) */
  onLevel?: (level: number) => void
  /** تغيّر حالة الكلام: يتكلم / سكت */
  onSpeechChange?: (speaking: boolean) => void
}

/** أقصى طول للمقطع الواحد قبل إجبار إغلاقه */
const MAX_SEGMENT_SEC = 12
/** سكوت يُغلق المقطع بعده */
const SILENCE_CLOSE_MS = 1200
/** احتياطي ما قبل بدء الكلام (لأول حرف) */
const PRE_ROLL_SEC = 0.35
/** أدنى طول لمقطع يُسلَّم */
const MIN_SEGMENT_SEC = 0.4

export function startLiveCapture(opts: LiveCaptureOptions): Promise<LiveCaptureHandle> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("متصفحك لا يدعم الالتقاط الصوتي المباشر"))
  }
  if (typeof AudioContext === "undefined") {
    return Promise.reject(new Error("متصفحك لا يدعم معالجة الصوت المباشرة"))
  }

  return new Promise((resolve, reject) => {
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let node: ScriptProcessorNode | null = null
    let src: MediaStreamAudioSourceNode | null = null
    let stopped = false

    const cleanup = () => {
      try {
        node?.disconnect()
        src?.disconnect()
      } catch {
        /* تجاهل */
      }
      node = null
      src = null
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined)
      ctx = null
    }

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        // نطلب ١٦kHz مباشرة إن أمكن — وإلا نعيد التقطيع لاحقاً
        try {
          ctx = new AudioContext({ sampleRate: 16000 })
        } catch {
          ctx = new AudioContext()
        }
        src = ctx.createMediaStreamSource(s)
        node = ctx.createScriptProcessor(4096, 1, 1)

        const ctxRate = ctx.sampleRate
        // ---- حالة كشف الكلام ----
        let inSpeech = false
        let speechBuf: Float32Array[] = []
        let speechLen = 0
        let silenceMs = 0
        let noiseFloor = 0.005
        let levelSmooth = 0
        // حلقة احتياطية لما قبل الكلام (آخر ٣٥٠ مللي)
        const preCap = Math.max(1, Math.round(PRE_ROLL_SEC * ctxRate))
        const preBuf = new Float32Array(preCap)
        let prePos = 0

        const threshold = () => Math.max(noiseFloor * 2.5, 0.009)

        const closeSegment = (force: boolean) => {
          if (!inSpeech) return
          const totalSamples = speechLen
          inSpeech = false
          speechLen = 0
          const dur = totalSamples / ctxRate
          const buf = speechBuf
          speechBuf = []
          if (!force && dur < MIN_SEGMENT_SEC) return
          if (totalSamples <= 0) return
          // دمج القطع
          const pcm = new Float32Array(totalSamples)
          let off = 0
          for (const c of buf) {
            pcm.set(c.subarray(0, Math.min(c.length, totalSamples - off)), off)
            off += c.length
          }
          const wavB64 = encodeSegment(pcm, ctxRate)
          opts.onSpeechChange?.(false)
          if (wavB64) opts.onSegment(wavB64, dur)
        }

        node.onaudioprocess = (ev) => {
          if (stopped) return
          const input = ev.inputBuffer.getChannelData(0)
          const blockMs = (input.length / ctxRate) * 1000

          // مستوى الصوت (RMS)
          let sum = 0
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
          const rms = Math.sqrt(sum / input.length)
          levelSmooth = rms > levelSmooth ? levelSmooth * 0.4 + rms * 0.6 : levelSmooth * 0.85 + rms * 0.15
          opts.onLevel?.(Math.min(1, levelSmooth / 0.25))

          if (!inSpeech) {
            // تحديث أرضية الضجيج بالسكوت
            if (rms < noiseFloor * 1.8) noiseFloor = noiseFloor * 0.97 + rms * 0.03
            // تدوير الحلقة الاحتياطية
            for (let i = 0; i < input.length; i++) {
              preBuf[prePos] = input[i]
              prePos = (prePos + 1) % preCap
            }
            if (rms > threshold()) {
              // بدء كلام: الاحتياط بترتيبه + هذه الكتلة
              inSpeech = true
              silenceMs = 0
              const pre = new Float32Array(preCap)
              for (let i = 0; i < preCap; i++) pre[i] = preBuf[(prePos + i) % preCap]
              speechBuf = [pre, new Float32Array(input)]
              speechLen = pre.length + input.length
              opts.onSpeechChange?.(true)
            }
          } else {
            speechBuf.push(new Float32Array(input))
            speechLen += input.length
            if (rms > threshold()) {
              silenceMs = 0
            } else {
              silenceMs += blockMs
            }
            const dur = speechLen / ctxRate
            if (silenceMs >= SILENCE_CLOSE_MS && dur >= MIN_SEGMENT_SEC) {
              closeSegment(false)
            } else if (dur >= MAX_SEGMENT_SEC) {
              closeSegment(true)
            }
          }
        }

        // توصيل عبر عقدة صامتة (بعض المتصفحات تتطلب وصلاً للوجهة)
        const mute = ctx.createGain()
        mute.gain.value = 0
        src.connect(node)
        node.connect(mute)
        mute.connect(ctx.destination)

        resolve({
          stop() {
            if (stopped) return
            stopped = true
            closeSegment(true)
            cleanup()
          },
        })
      })
      .catch((e: unknown) => {
        cleanup()
        if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
          reject(new MicDeniedError())
        } else {
          reject(new Error("تعذّر فتح الميكروفون — تحقق من توصيله"))
        }
      })
  })
}

/** تحويل PCM عائم إلى WAV ١٦kHz أحادي base64 (مع إعادة التقطيع عند الحاجة) */
function encodeSegment(pcm: Float32Array, srcRate: number): string | null {
  if (pcm.length === 0) return null
  const targetRate = 16000
  let out: Float32Array
  if (Math.abs(srcRate - targetRate) < 1) {
    out = pcm
  } else {
    const ratio = srcRate / targetRate
    const length = Math.max(1, Math.floor(pcm.length / ratio))
    out = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      const pos = i * ratio
      const i0 = Math.floor(pos)
      const i1 = Math.min(pcm.length - 1, i0 + 1)
      const t = pos - i0
      out[i] = pcm[i0] * (1 - t) + pcm[i1] * t
    }
  }
  const bytesPerSample = 2
  const data = new Int16Array(out.length)
  for (let i = 0; i < out.length; i++) {
    const s = Math.max(-1, Math.min(1, out[i]))
    data[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const wav = new ArrayBuffer(44 + data.length * bytesPerSample)
  const view = new DataView(wav)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, "RIFF")
  view.setUint32(4, 36 + data.length * bytesPerSample, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // أحادي
  view.setUint32(24, targetRate, true)
  view.setUint32(28, targetRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeStr(36, "data")
  view.setUint32(40, data.length * bytesPerSample, true)
  new Int16Array(wav, 44).set(data)
  // ترميز base64 بدفعات
  const bytes = new Uint8Array(wav)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
