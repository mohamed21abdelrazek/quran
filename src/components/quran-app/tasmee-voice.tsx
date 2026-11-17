"use client"

// التسميع الصوتي: سجّل تلاوتك من الحفظ — نخفي الصفحة عنك ونستمع ثم نصحّح كلمة كلمة
// (الإخفاء التدريجي متاح هنا أيضاً: كلمة/آية/نسبة — والإخفاء الكامل تلقائي عند التسجيل)

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { TasmeeResultView } from "./tasmee-result-view"
import { HideablePage } from "./hideable-page"
import { createVoiceRecorder, formatSeconds, MicDeniedError } from "@/lib/voice"
import type { TasmeeResult } from "@/lib/tasmee"
import type { PagePayload } from "@/lib/mushaf-data"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  Mic,
  Square,
  Loader2,
  RefreshCw,
  Tag,
  AudioLines,
  Info,
} from "lucide-react"

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
function arNum(n: number): string {
  return String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("")
}

interface Props {
  page: number
  payload: PagePayload | null
  /** إضافة الكلمات الخاطئة للقائمة الصعبة */
  onAddMistakes: (r: TasmeeResult) => void
  /** تسجيل الجلسة في التقدم */
  onLog: (r: TasmeeResult, detail: string) => Promise<void>
  savingHard?: boolean
}

export function TasmeeVoice({ page, payload, onAddMistakes, onLog, savingHard }: Props) {
  const { toast } = useToast()
  const recorderRef = useRef<ReturnType<typeof createVoiceRecorder> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideApiRef = useRef<{ hideAll: () => void; showAll: () => void } | null>(null)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<TasmeeResult | null>(null)
  const [transcription, setTranscription] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      recorderRef.current?.dispose()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // جلسة جديدة عند تغيير الصفحة — المكوّن نفسه يُعاد تركيبه من الأب (key)
  useEffect(() => {
    resetSession()
  }, [page])

  const resetSession = () => {
    recorderRef.current?.dispose()
    recorderRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setRecording(false)
    setSeconds(0)
    setSending(false)
    setResult(null)
    setTranscription("")
    setError(null)
  }

  const startRecording = async () => {
    setError(null)
    try {
      const rec = createVoiceRecorder()
      await rec.start()
      recorderRef.current = rec
      // إخفاء الصفحة كاملة — التسميع من الحفظ لا من النظر
      hideApiRef.current?.hideAll()
      setSeconds(0)
      setRecording(true)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch (e) {
      const msg = e instanceof MicDeniedError ? e.message : e instanceof Error ? e.message : "تعذّر بدء التسجيل"
      setError(msg)
    }
  }

  const stopAndSend = async () => {
    const rec = recorderRef.current
    if (!rec) return
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setRecording(false)
    setSending(true)
    try {
      const base64 = await rec.stop()
      recorderRef.current = null
      if (base64.length < 2000) {
        throw new Error("التسجيل قصير جداً — اضغط زر التسجيل ثم اقرأ الصفحة كاملة")
      }
      const res = await fetch("/api/tasmee-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, page }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        transcription?: string
        result?: TasmeeResult
        error?: string
      }
      if (!res.ok || !data.result) {
        throw new Error(data.error ?? "تعذّر تصحيح التسميع")
      }
      setResult(data.result)
      setTranscription(data.transcription ?? "")
      void onLog(data.result, `تسميع صوتي صفحة ${page}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذّر إرسال التسجيل"
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* شرح الوضع */}
      <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-[11px] leading-6 text-muted-foreground">
          اضغط <span className="font-bold text-foreground">«ابدأ التلاوة»</span> — ستُخفى الصفحة كاملة فوراً — ثم سمّعها
          من حفظك بصوتك المعتاد في التلاوة. عند الإيقاف نستمع إلى تلاوتك ونصحّحها كلمة كلمة: الصحيح بالأخضر، والقريب
          بالكهرماني، والخطأ بالأحمر مع الصواب. يمكنك أيضاً الإخفاء التدريجي (كلمة/آية) قبل التسجيل إن أردت التدرّب.
        </p>
      </div>

      <HideablePage key={page} payload={payload} apiRef={hideApiRef}>
        {() => (
          <div className="space-y-4">
            {!result ? (
              <div className="space-y-4">
                {/* زر التسجيل */}
                <div className="flex flex-col items-center gap-4 py-4">
                  {recording ? (
                    <>
                      <button
                        type="button"
                        onClick={stopAndSend}
                        className="relative flex h-24 w-24 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        aria-label="إيقاف التسجيل وتصحيح التسميع"
                      >
                        <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" />
                        <Square className="h-9 w-9 fill-current" />
                      </button>
                      <div className="text-center">
                        <p className="flex items-center justify-center gap-2 text-lg font-extrabold tabular-nums text-red-700 dark:text-red-400">
                          <AudioLines className="h-5 w-5" />
                          جارٍ التسجيل… {formatSeconds(seconds)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">سمّع الصفحة كاملة ثم اضغط الإيقاف</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={startRecording}
                        disabled={sending}
                        className={cn(
                          "flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60",
                          sending && "animate-pulse",
                        )}
                        aria-label="بدء تسجيل التلاوة"
                      >
                        {sending ? <Loader2 className="h-9 w-9 animate-spin" /> : <Mic className="h-9 w-9" />}
                      </button>
                      <div className="text-center">
                        <p className="text-base font-extrabold">
                          {sending ? "نستمع إلى تلاوتك ونصحّحها…" : "ابدأ التلاوة"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {sending ? "قد يستغرق هذا لحظات — لا تغلق الصفحة" : `سمّع صفحة ${arNum(page)} من حفظك بلا نظر`}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {error && (
                  <p className="rounded-xl border border-red-300/70 bg-red-50 p-3 text-center text-xs font-bold leading-6 text-red-700 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <TasmeeResultView result={result} transcription={transcription} />

                {/* أزرار ما بعد التصحيح */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {(result.counts.wrong > 0 || result.counts.missing > 0 || result.counts.near > 0) && (
                      <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => onAddMistakes(result)} disabled={savingHard}>
                        {savingHard ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
                        أضف الخاطئة للقائمة الصعبة
                      </Button>
                    )}
                  </div>
                  <Button size="sm" className="h-9 gap-1.5" onClick={resetSession}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    تسميع جديد
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </HideablePage>
    </div>
  )
}
