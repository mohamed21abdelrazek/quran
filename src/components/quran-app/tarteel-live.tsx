"use client"

// وضع ترتيل اللحظي — «سمّع واكشف»:
// يستمع لتلاوتك مقطعاً مقطعاً (كشف كلام تلقائي) ويكشف الكلمات كلما صحّت،
// ينبّه فوراً عند الخطأ (وميض أحمر + اهتزاز + لمحة الكلمة المنتظرة)،
// ويعلّم الكلمات القافزة — كما يفعل ترتيل
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { LiveMatcher, type LiveSummary, type LiveWordState } from "@/lib/live-match"
import { startLiveCapture, type LiveCaptureHandle } from "@/lib/live-capture"
import { detectSpeechEngine, startSpeech, type SpeechHandle } from "@/lib/speech"
import { formatSeconds } from "@/lib/voice"
import type { PagePayload } from "@/lib/mushaf-data"
import { SURAHS } from "@/lib/quran"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  Mic,
  Square,
  Loader2,
  RefreshCw,
  Radio,
  Info,
  Tag,
  BookOpen,
  Sparkles,
  Ear,
  TriangleAlert,
  CheckCheck,
  ListChecks,
} from "lucide-react"

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
function arNum(n: number): string {
  return String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("")
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* تجاهل */
  }
}

/** عوامل أعمدة مؤشر الصوت الحي */
const LEVEL_BARS = [0.55, 0.8, 1, 0.7, 0.9, 0.6, 0.75]

export interface HardWordItem {
  key: string
  word: string
  s: number
  n: number
}

interface Props {
  page: number
  payload: PagePayload | null
  /** تسجيل الجلسة في التقدم */
  onLog: (score: number, detail: string) => Promise<void>
  /** إضافة كلمات للقائمة الصعبة */
  onAddHardWords: (items: HardWordItem[]) => Promise<void>
  openMushaf: (page: number, label: string) => void
  savingHard?: boolean
}

export function TarteelLive({ page, payload, onLog, onAddHardWords, openMushaf, savingHard }: Props) {
  const { toast } = useToast()

  // بنية الصفحة: كلمات مسطّحة بفهارس عامة مع آياتها
  const structure = useMemo(() => {
    if (!payload) return null
    const ayahs: { key: string; s: number; n: number; words: string[]; start: number }[] = []
    let acc = 0
    for (const a of payload.ayahs) {
      const words = a.text.split(/\s+/).filter(Boolean)
      ayahs.push({ key: a.key, s: a.s, n: a.n, words, start: acc })
      acc += words.length
    }
    return { ayahs, total: acc }
  }, [payload])

  const matcherRef = useRef<LiveMatcher | null>(null)
  const captureRef = useRef<LiveCaptureHandle | null>(null)
  // محرك التعرّف داخل الجهاز (تطبيق الجوال / المتصفحات الداعمة) — بلا خادم
  const speechRef = useRef<SpeechHandle | null>(null)
  const engineRef = useRef<"device" | "server">("server")
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const peekTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorShownRef = useRef(false)

  const [phase, setPhase] = useState<"idle" | "listening" | "done">("idle")
  const [states, setStates] = useState<LiveWordState[]>([])
  const [pointer, setPointer] = useState(0)
  const [peeked, setPeeked] = useState<Set<number>>(new Set())
  const [alertIdx, setAlertIdx] = useState<number | null>(null)
  const [level, setLevel] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [busy, setBusy] = useState(0)
  const [tail, setTail] = useState("")
  const [seconds, setSeconds] = useState(0)
  const [summary, setSummary] = useState<LiveSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  // تنظيف شامل عند الإلغاء
  useEffect(() => {
    return () => {
      speechRef.current?.abort()
      speechRef.current = null
      captureRef.current?.stop()
      captureRef.current = null
      if (timerRef.current) clearInterval(timerRef.current)
      peekTimers.current.forEach((t) => clearTimeout(t))
      peekTimers.current.clear()
      if (alertTimer.current) clearTimeout(alertTimer.current)
    }
  }, [])

  const peek = (idx: number, ms = 2200) => {
    setPeeked((prev) => new Set(prev).add(idx))
    const existing = peekTimers.current.get(idx)
    if (existing) clearTimeout(existing)
    const t = setTimeout(() => {
      setPeeked((prev) => {
        const nx = new Set(prev)
        nx.delete(idx)
        return nx
      })
      peekTimers.current.delete(idx)
    }, ms)
    peekTimers.current.set(idx, t)
  }

  const applyFeed = (text: string) => {
    const m = matcherRef.current
    if (!m) return
    setTail(text)
    const r = m.feed(text)
    if (r.changed) {
      setStates(m.getStates())
      setPointer(m.pointer)
    }
    if (r.alert) {
      setAlertIdx(r.alertWord)
      if (r.alertWord != null) peek(r.alertWord, 3200)
      vibrate([120, 60, 120])
      if (alertTimer.current) clearTimeout(alertTimer.current)
      alertTimer.current = setTimeout(() => setAlertIdx(null), 3000)
    }
    if (r.completed) {
      // اكتملت الصفحة — أوقف الاستماع وأظهر النتيجة
      window.setTimeout(() => finishListening(), 400)
    }
  }

  const enqueueSegment = (b64: string) => {
    // معالجة المقاطع بترتيب وصولها الصوتي (سلسلة وعود)
    chainRef.current = chainRef.current.then(async () => {
      setBusy((b) => b + 1)
      try {
        const res = await fetch("/api/tasmee-live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64: b64 }),
        })
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
        if (!res.ok) throw new Error(data.error ?? "تعذّر التفريغ")
        if (data.text) applyFeed(data.text)
      } catch {
        if (!errorShownRef.current) {
          errorShownRef.current = true
          toast({
            title: "تعذّر فهم مقطع",
            description: "أكمل تلاوتك — نتابع الاستماع للمقاطع القادمة",
            variant: "destructive",
          })
          window.setTimeout(() => (errorShownRef.current = false), 8000)
        }
      } finally {
        setBusy((b) => b - 1)
      }
    })
  }

  const startListening = async () => {
    if (!structure || !payload) return
    setError(null)
    const expectedText = payload.ayahs.map((a) => a.text).join(" ")
    const m = new LiveMatcher(expectedText)
    matcherRef.current = m
    setStates(m.getStates())
    setPointer(m.pointer)
    setPeeked(new Set())
    setAlertIdx(null)
    setTail("")
    setSummary(null)
    setSeconds(0)
    setLevel(0)
    try {
      if (detectSpeechEngine() === "server") {
        // مسار الخادم (نسخة الموقع على متصفحات بلا دعم محلي)
        engineRef.current = "server"
        const handle = await startLiveCapture({
          onSegment: enqueueSegment,
          onLevel: setLevel,
          onSpeechChange: setSpeaking,
        })
        captureRef.current = handle
      } else {
        // مسار الجهاز: تفريغ داخل الجهاز — بلا خادم إطلاقاً
        engineRef.current = "device"
        const handle = await startSpeech({
          onPartial: (text) => setTail(text),
          onFinal: (text) => applyFeed(text),
          onSpeakingChange: setSpeaking,
          onError: (msg) => {
            if (!errorShownRef.current) {
              errorShownRef.current = true
              toast({ title: "انقطع الاستماع", description: msg, variant: "destructive" })
              window.setTimeout(() => (errorShownRef.current = false), 8000)
            }
          },
        })
        speechRef.current = handle
      }
      setPhase("listening")
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذّر بدء الاستماع"
      setError(msg)
    }
  }

  const finishListening = () => {
    if (phase !== "listening") return
    const speech = speechRef.current
    speechRef.current = null
    captureRef.current?.stop()
    captureRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    // انتظر آخر ما سُمع (الجهاز يسلّم الجلسة الأخيرة عبر onFinal) ثم لخّص
    chainRef.current = chainRef.current
      .then(async () => {
        if (speech) {
          try {
            await speech.stop()
          } catch {
            /* تجاهل */
          }
        }
      })
      .then(() => {
        const m = matcherRef.current
        const s = m ? m.summary() : null
        setSummary(s)
        setPhase("done")
        setLevel(0)
        if (s) {
          vibrate([100, 60, 100])
          void onLog(s.score, `ترتيل لحظي صفحة ${page}`)
          if (s.score === 100) {
            toast({ title: "ما شاء الله! صفحة كاملة بلا خطأ", description: "تقبل الله — واصل" })
          }
        }
      })
  }

  const resetSession = () => {
    speechRef.current?.abort()
    speechRef.current = null
    captureRef.current?.stop()
    captureRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    peekTimers.current.forEach((t) => clearTimeout(t))
    peekTimers.current.clear()
    matcherRef.current = null
    setPhase("idle")
    setStates([])
    setPeeked(new Set())
    setAlertIdx(null)
    setTail("")
    setSummary(null)
    setError(null)
    setSeconds(0)
    setBusy(0)
  }

  if (!structure) return null
  const { ayahs } = structure

  const hardItemsFromMistakes = (): HardWordItem[] => {
    if (!summary) return []
    const out: HardWordItem[] = []
    const seen = new Set<string>()
    for (const mk of summary.mistakes) {
      for (const ay of ayahs) {
        if (mk.index >= ay.start && mk.index < ay.start + ay.words.length) {
          const word = ay.words[mk.index - ay.start]
          const id = `${ay.key}:${word}`
          if (!seen.has(id)) {
            seen.add(id)
            out.push({ key: ay.key, word, s: ay.s, n: ay.n })
          }
          break
        }
      }
    }
    return out
  }

  const progressPct =
    summary && summary.totalReal > 0
      ? Math.round(((summary.totalReal - summary.pending) / summary.totalReal) * 100)
      : 0

  return (
    <div className="space-y-4" dir="rtl">
      {/* شرح الوضع */}
      <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-[11px] leading-6 text-muted-foreground">
          <span className="font-bold text-foreground">الترتيل اللحظي</span> — اضغط الميكروفون واقرأ من حفظك: الكلمات
          مخفية وتنكشف واحدة واحدة كلما صحّ لفظك. عند تكرار الخطأ يومض الموضع بالأحمر ونلمّح لك الكلمة المنتظرة — تماماً
          كما يصحّح لك الشيخ لحظة بلحظة.
        </p>
      </div>

      {/* منطقة التحكم */}
      {!summary ? (
        <div className="flex flex-col items-center gap-3 py-3">
          {phase === "listening" ? (
            <>
              <button
                type="button"
                onClick={finishListening}
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                aria-label="إنهاء التسميع وعرض النتيجة"
              >
                <span className={cn("absolute inset-0 rounded-full bg-red-500/40", speaking && "animate-ping")} />
                <Square className="h-8 w-8 fill-current" />
              </button>
              <p className="flex items-center gap-2 text-base font-extrabold tabular-nums text-red-700 dark:text-red-400">
                <Radio className="h-4 w-4 animate-pulse" />
                يستمع… {formatSeconds(seconds)}
              </p>
              {/* مؤشر الصوت الحي — من ميكروفونك مباشرة (أو نبض حي في مسار الجهاز) */}
              <div className="flex h-10 items-end gap-1" aria-hidden>
                {engineRef.current === "server"
                  ? LEVEL_BARS.map((f, i) => (
                      <span
                        key={i}
                        className="w-1.5 rounded-full bg-emerald-500 transition-[height] duration-100"
                        style={{ height: `${Math.max(4, Math.min(40, 6 + level * f * 44))}px` }}
                      />
                    ))
                  : LEVEL_BARS.map((_, i) => (
                      <span key={i} className="h-10">
                        <span
                          className={cn("eq-bar block w-1.5 rounded-full bg-emerald-500", speaking && "eq-on")}
                          style={{ animationDelay: `${i * 120}ms` }}
                        />
                      </span>
                    ))}
              </div>
              <p className="text-[11px] leading-5 text-muted-foreground">
                {busy > 0 ? (
                  <span className="inline-flex items-center gap-1 font-bold text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    يفهم ما تسمع…
                  </span>
                ) : speaking ? (
                  "تكلّم — نتابع كلماتك…"
                ) : (
                  "ابدأ التلاوة من أول الصفحة"
                )}
              </p>
              {tail && (
                <p className="max-w-full truncate rounded-lg bg-muted/60 px-2.5 py-1 text-[10px] text-muted-foreground">
                  سمعنا: <span className="font-quran">{tail}</span>
                </p>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startListening}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label="بدء التسميع اللحظي"
              >
                <Mic className="h-8 w-8" />
              </button>
              <p className="text-base font-extrabold">سمّع واكشف</p>
              <p className="text-[11px] leading-5 text-muted-foreground">
                اقرأ صفحة {arNum(page)} من حفظك — سنكشف الكلمات وراء صوتك
              </p>
            </>
          )}
          {error && (
            <p className="rounded-xl border border-red-300/70 bg-red-50 p-3 text-center text-xs font-bold leading-6 text-red-700 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}
        </div>
      ) : (
        /* نتيجة الجلسة */
        <div className="space-y-3 rounded-xl border border-emerald-300/60 bg-emerald-50/50 p-4 dark:border-emerald-600/30 dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-lg font-extrabold text-emerald-800 dark:text-emerald-200">
              <Sparkles className="h-5 w-5" />
              درجة الجلسة {arNum(summary.score)}٪
            </p>
            <div className="flex flex-wrap gap-1.5 text-[10px] font-extrabold">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                <CheckCheck className="h-3 w-3" /> {arNum(summary.matched)} صحيحة
              </span>
              {summary.near > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  {arNum(summary.near)} قريبة
                </span>
              )}
              {summary.skipped > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-1 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                  {arNum(summary.skipped)} قفزة
                </span>
              )}
              {summary.pending > 0 && (
                <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                  {arNum(summary.pending)} لم تُسمع
                </span>
              )}
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>

          {summary.mistakes.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1 text-[11px] font-extrabold text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                مواضع تحتاج مراجعة ({arNum(summary.mistakes.length)})
              </p>
              <div className="scroll-thin flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {summary.mistakes.slice(0, 20).map((mk, i) => {
                  const ay = ayahs.find((a) => mk.index >= a.start && mk.index < a.start + a.words.length)
                  return (
                    <span
                      key={i}
                      className={cn(
                        "rounded-lg border px-2 py-1 text-[11px] font-bold",
                        mk.kind === "near"
                          ? "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-600/40 dark:bg-amber-950/30 dark:text-amber-300"
                          : "border-orange-300/70 bg-orange-50 text-orange-800 dark:border-orange-600/40 dark:bg-orange-950/30 dark:text-orange-300",
                      )}
                      title={mk.kind === "near" ? `سمعنا: ${mk.heard}` : "قفزت أثناء التلاوة"}
                    >
                      <span className="font-quran">{mk.expected}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {ay ? `${SURAHS[ay.s - 1]?.name} ${arNum(ay.n)}` : ""}
                      </span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {summary.mistakes.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                disabled={savingHard}
                onClick={() => void onAddHardWords(hardItemsFromMistakes())}
              >
                {savingHard ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
                أضف مواضع المراجعة للقائمة الصعبة
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => openMushaf(page, "مراجعة التلاوة")}>
              <BookOpen className="h-3.5 w-3.5" />
              افتح في المصحف
            </Button>
            <Button size="sm" className="ml-auto h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={resetSession}>
              <RefreshCw className="h-3.5 w-3.5" />
              جلسة جديدة
            </Button>
          </div>
        </div>
      )}

      {/* متن الصفحة — الإخفاء والكشف الحي */}
      <div className="rounded-xl border-2 border-gold/40 bg-gradient-to-b from-gold/5 to-transparent p-4 shadow-inner dark:border-gold/25 sm:p-5">
        <div className="font-quran space-y-5 text-right text-xl leading-[2.4] text-foreground sm:text-[1.35rem]">
          {ayahs.map((ay) => (
            <span key={ay.key}>
              {ay.words.map((w, wi) => {
                const gIdx = ay.start + wi
                const st = states[gIdx] ?? "pending"
                const isPeeked = peeked.has(gIdx)
                const revealed = phase === "done" || phase === "idle" || st !== "pending" || isPeeked
                const isCurrent = phase === "listening" && gIdx === pointer
                const isAlert = alertIdx === gIdx
                const clickable = phase === "listening" && st === "pending" && !isPeeked
                return (
                  <span key={gIdx}>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={clickable ? () => peek(gIdx) : undefined}
                      className={cn(
                        "rounded px-0.5 transition-all duration-300",
                        !revealed && "cursor-pointer bg-muted/90 text-transparent decoration-dotted decoration-2 underline-offset-4 select-none hover:bg-muted",
                        revealed && st === "matched" && "font-bold text-emerald-700 dark:text-emerald-300",
                        revealed && st === "near" && "text-amber-700 underline decoration-wavy decoration-amber-500 underline-offset-4 dark:text-amber-300",
                        revealed && st === "skipped" &&
                          "text-orange-600 underline decoration-dashed decoration-orange-500 underline-offset-4 dark:text-orange-400",
                        revealed && st === "pending" && "text-foreground",
                        isCurrent && !isAlert && "ring-2 ring-emerald-400/80",
                        isAlert && "animate-pulse bg-red-100 font-bold text-red-700 ring-2 ring-red-500 dark:bg-red-900/50 dark:text-red-200",
                      )}
                      title={
                        st === "skipped"
                          ? "قُفزت أثناء التلاوة"
                          : st === "near"
                            ? "سمعت قريبة منها — راجعها"
                            : clickable
                              ? "كلمة مخفية — اضغط لتلمحها"
                              : undefined
                      }
                      aria-label={clickable ? "كلمة مخفية — اضغط لتلمحها" : undefined}
                    >
                      {w}
                    </button>{" "}
                  </span>
                )
              })}
              <span className="mx-1 inline-flex h-6 w-6 translate-y-0.5 items-center justify-center rounded-full border border-primary/25 bg-primary/10 align-middle text-[11px] font-bold text-primary">
                {arNum(ay.n)}
              </span>{" "}
            </span>
          ))}
        </div>

        {phase === "listening" && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-bold text-muted-foreground">
            <Ear className="h-3.5 w-3.5" />
            الكلمة المحاطة بالإطار الأخضر هي المنتظرة — اضغط أي كلمة مخفية لتلمحها
          </p>
        )}
        {phase === "listening" && alertIdx != null && (
          <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-[11px] font-extrabold text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <TriangleAlert className="h-3.5 w-3.5" />
            يبدو أن الكلمة المظللة بالأحمر خطأ — أعدها صحيحة
          </p>
        )}
      </div>
    </div>
  )
}
