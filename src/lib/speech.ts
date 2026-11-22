// التعرّف على الكلام داخل الجهاز نفسه — بلا أي خادم:
// ١) تطبيق أندرويد (Capacitor): إضافة SpeechRecognition عبر خدمة التعرف على
//    الكلام في النظام (تعمل مع اتصال بالإنترنت، وبعض الأجهزة الحديثة أوفلاين)
// ٢) المتصفحات الداعمة لـ Web Speech API (كروم/إيدج/سفاري): تفريغ مباشر
// ٣) إن لم يتوفر أيٌّ منهما: يعيد "server" فيعتمد المُستخدِم على مسار
//    التسجيل + الخادم (نسخة الموقع فقط — تطبيق الجوال لا يحتاجه)
//
// ملاحظة أندرويد: خدمة التعرف توقف الجلسة بعد كل جملة — لذا نعيد تشغيلها
// تلقائياً (سلسلة جلسات) مع مراقب يحرس من التوقف الصامت، ونتائج كل جلسة
// تُدمج في نص واحد متتابع.

export type SpeechEngine = "native" | "web" | "server"

/** واجهة إضافة Capacitor كما تُسجَّل على الجسر (بلا حاجة لحزمة npm في الويب) */
interface NativeSpeechPlugin {
  available(): Promise<{ available: boolean }>
  start(options?: {
    language?: string
    maxResults?: number
    prompt?: string
    popup?: boolean
    partialResults?: boolean
  }): Promise<{ matches?: string[] }>
  stop(): Promise<void>
  isListening(): Promise<{ listening: boolean }>
  checkPermissions(): Promise<{ speechRecognition?: string }>
  requestPermissions(): Promise<{ speechRecognition?: string }>
  addListener(
    event: "partialResults",
    cb: (data: { matches: string[] }) => void,
  ): Promise<{ remove: () => void }>
  addListener(
    event: "listeningState",
    cb: (data: { status: "started" | "stopped" }) => void,
  ): Promise<{ remove: () => void }>
  removeAllListeners?(): Promise<void>
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  Plugins?: { SpeechRecognition?: NativeSpeechPlugin; Preferences?: unknown }
}

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null
  const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor
  return cap ?? null
}

/** أفضل محرك متاح الآن */
export function detectSpeechEngine(): SpeechEngine {
  if (typeof window === "undefined") return "server"
  const cap = capacitor()
  if (cap?.isNativePlatform?.() && cap.Plugins?.SpeechRecognition) return "native"
  const w = window as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  if (w.SpeechRecognition || w.webkitSpeechRecognition) return "web"
  return "server"
}

export interface SpeechCallbacks {
  /** النص اللحظي الكامل (كل ما سُمع حتى الآن) */
  onPartial?: (text: string) => void
  /** مقطع اكتمل اعتماده (جملة/جلسة) — يُبنى عليه النص الكامل */
  onFinal?: (text: string) => void
  /** يتكلم الآن / سكت */
  onSpeakingChange?: (speaking: boolean) => void
  /** خطأ قاتل في المحرك (رسالة عربية) */
  onError?: (message: string) => void
}

export interface SpeechHandle {
  /** إيقاف الاستماع وإرجاع النص الكامل المعتمد */
  stop: () => Promise<string>
  /** إلغاء فوري بلا انتظار */
  abort: () => void
  engine: SpeechEngine
}

/** بدء الاستماع بأفضل محرك متاح — يرفع خطأً عربياً واضحاً إن تعذّر */
export async function startSpeech(cb: SpeechCallbacks): Promise<SpeechHandle> {
  const engine = detectSpeechEngine()
  if (engine === "native") return startNative(cb)
  if (engine === "web") return startWeb(cb)
  throw new Error("لا يوجد محرك تعرّف على الكلام على هذا الجهاز")
}

// ==================== ١) تطبيق أندرويد — سلسلة جلسات متواصلة ====================

const RESTART_DELAY_MS = 450
/** لا نشكو للمستخدم إلا بعد هذا العدد من الإخفاقات المتتالية بلا أي كلام */
const SILENT_FAILURE_LIMIT = 40

async function startNative(cb: SpeechCallbacks): Promise<SpeechHandle> {
  const cap = capacitor()
  const SR = cap?.Plugins?.SpeechRecognition
  if (!SR) throw new Error("خدمة التعرف على الكلام غير مثبتة في التطبيق")

  const availability = await SR.available().catch(() => ({ available: false }))
  if (!availability.available) {
    throw new Error("خدمة التعرف على الكلام غير متاحة على هذا الجهاز — تأكد من وجود تطبيق Google وتحديثه")
  }

  const perm = await SR.requestPermissions().catch(() => null)
  const p = perm?.speechRecognition
  if (p && p !== "granted") {
    throw new Error("رُفض إذن الميكروفون — اسمح للتطبيق بالميكروفون من إعدادات النظام")
  }

  let stopped = false
  let starting = false
  let finalText = ""
  let sessionText = ""
  let restartTimer: ReturnType<typeof setTimeout> | null = null
  let watchdog: ReturnType<typeof setInterval> | null = null
  let lastActivity = Date.now()
  let silentFailures = 0
  let complained = false

  const emitPartial = () => cb.onPartial?.(`${finalText} ${sessionText}`.trim())

  const commitSession = () => {
    const t = sessionText.trim()
    sessionText = ""
    if (t) {
      finalText = `${finalText} ${t}`.trim()
      cb.onFinal?.(t)
    }
  }

  const cleanupTimers = () => {
    if (restartTimer) clearTimeout(restartTimer)
    restartTimer = null
    if (watchdog) clearInterval(watchdog)
    watchdog = null
  }

  const startSession = async (): Promise<void> => {
    if (stopped || starting) return
    starting = true
    lastActivity = Date.now()
    try {
      const res = await SR.start({ language: "ar-SA", partialResults: true, popup: false })
      lastActivity = Date.now()
      silentFailures = 0
      // بعض مسارات الإصدار تعيد النتيجة النهائية في وعد البدء نفسه
      const m = res?.matches
      if (Array.isArray(m) && m.length > 0) {
        const t = m.join(" ").trim()
        if (t && !finalText.includes(t)) {
          finalText = `${finalText} ${t}`.trim()
          cb.onFinal?.(t)
        }
      }
    } catch (e) {
      lastActivity = Date.now()
      silentFailures++
      // أخطاء متكررة بصمت (سكوت/انشغال/شبكة مؤقتة) — نحاول ثانية بهدوء
      if (!stopped && silentFailures < SILENT_FAILURE_LIMIT) {
        restartTimer = setTimeout(() => void startSession(), 900)
      } else if (!stopped && !complained) {
        complained = true
        const msg = e instanceof Error ? e.message : String(e)
        cb.onError?.(
          /network|timeout|server/i.test(msg)
            ? "تعذّر الوصول لخدمة التعرف على الكلام — تحقق من اتصالك بالإنترنت ثم أعد المحاولة"
            : "تعذّرت الاستماع — أعد المحاولة بعد لحظات",
        )
      }
    } finally {
      starting = false
    }
  }

  const hPartial = await SR.addListener("partialResults", (d) => {
    lastActivity = Date.now()
    const matches = d?.matches
    if (Array.isArray(matches) && matches.length > 0) {
      sessionText = matches.join(" ").trim()
      emitPartial()
      cb.onSpeakingChange?.(true)
    }
  })

  const hState = await SR.addListener("listeningState", (d) => {
    lastActivity = Date.now()
    if (d?.status === "started") {
      cb.onSpeakingChange?.(true)
    } else if (d?.status === "stopped") {
      commitSession()
      emitPartial()
      cb.onSpeakingChange?.(false)
      if (!stopped) {
        restartTimer = setTimeout(() => void startSession(), RESTART_DELAY_MS)
      }
    }
  })

  // مراقب: إن صمتت الجلسة طويلاً (خطأ لم يُبلَّغ) نعيد التشغيل بأنفسنا
  watchdog = setInterval(() => {
    if (stopped || starting) return
    const idle = Date.now() - lastActivity
    if (idle > 12000) {
      lastActivity = Date.now()
      void (async () => {
        try {
          const { listening } = await SR.isListening()
          if (!listening) await startSession()
        } catch {
          /* تجاهل */
        }
      })()
    }
  }, 4000)

  await startSession()

  const detach = () => {
    cleanupTimers()
    try {
      hPartial.remove()
      hState.remove()
    } catch {
      try {
        void SR.removeAllListeners?.()
      } catch {
        /* تجاهل */
      }
    }
  }

  return {
    engine: "native",
    async stop() {
      if (stopped) return finalText
      stopped = true
      try {
        await SR.stop()
      } catch {
        /* تجاهل */
      }
      commitSession()
      emitPartial()
      detach()
      return finalText
    },
    abort() {
      stopped = true
      try {
        void SR.stop()
      } catch {
        /* تجاهل */
      }
      detach()
    },
  }
}

// ==================== ٢) المتصفح — Web Speech API ====================

interface WebSpeechResult {
  transcript: string
  isFinal: boolean
}
interface WebSpeechEvent {
  resultIndex: number
  results: { length: number; [i: number]: WebSpeechResult }
}
interface WebSpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: WebSpeechEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
}
type WebSpeechCtor = new () => WebSpeechRecognition

function startWeb(cb: SpeechCallbacks): SpeechHandle {
  const w = window as { SpeechRecognition?: WebSpeechCtor; webkitSpeechRecognition?: WebSpeechCtor }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) throw new Error("متصفحك لا يدعم التعرف على الكلام")

  const rec = new Ctor()
  rec.lang = "ar-SA"
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1

  let stopped = false
  let finals = ""
  let interim = ""

  const emitPartial = () => cb.onPartial?.(`${finals} ${interim}`.trim())

  rec.onresult = (ev) => {
    interim = ""
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]
      const t = r.transcript.trim()
      if (r.isFinal) {
        if (t) {
          finals = `${finals} ${t}`.trim()
          cb.onFinal?.(t)
        }
      } else {
        interim += ` ${t}`
      }
    }
    emitPartial()
  }
  rec.onspeechstart = () => cb.onSpeakingChange?.(true)
  rec.onspeechend = () => cb.onSpeakingChange?.(false)
  rec.onerror = (e) => {
    // "no-speech" و"aborted" شائعان وبلا ضرر — البقية تُبلَّغ
    if (stopped || e.error === "no-speech" || e.error === "aborted") return
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      stopped = true
      cb.onError?.("رُفض إذن الميكروفون — اسمح به من إعدادات المتصفح ثم أعد المحاولة")
    } else if (e.error === "network") {
      cb.onError?.("تعذّر الوصول لخدمة التعرف على الكلام — تحقق من اتصالك بالإنترنت")
    }
  }
  rec.onend = () => {
    // كروم يوقف نفسه بعد كل جملة — نعيد التشغيل حتى يطلب المستخدم الإيقاف
    if (!stopped) {
      try {
        rec.start()
      } catch {
        /* بدأ للتو — تجاهل */
      }
    }
  }

  try {
    rec.start()
  } catch {
    /* قد يكون بدأ بالفعل */
  }

  return {
    engine: "web",
    stop() {
      stopped = true
      try {
        rec.stop()
      } catch {
        /* تجاهل */
      }
      const out = `${finals} ${interim}`.trim()
      return Promise.resolve(out)
    },
    abort() {
      stopped = true
      try {
        rec.abort()
      } catch {
        /* تجاهل */
      }
    },
  }
}
