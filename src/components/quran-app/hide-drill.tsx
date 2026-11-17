"use client"

// التسميع بالإخفاء التدريجي: أخفِ الكلمات والآيات تدريجياً حتى تتلو الصفحة كاملة من حفظك
// الكلمة المخفية تظهر كفراغ — اضغطها إن تعثرت لتلمحها لحظة ثم تعود مخفية

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { fireConfetti } from "@/hooks/use-app"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  EyeOff,
  Eye,
  Eraser,
  RefreshCw,
  Loader2,
  ChevronRight,
  BookOpen,
  Sparkles,
  Check,
  HelpCircle,
} from "lucide-react"
import type { PagePayload } from "@/lib/mushaf-data"

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
function arNum(n: number): string {
  return String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("")
}

interface Props {
  page: number
  payload: PagePayload | null
  /** تسجيل الجلسة في التقدم */
  onLog: (kind: "hide", score: number, detail: string) => Promise<void>
  /** الانتقال إلى المصحف */
  openMushaf: (page: number, label: string) => void
}

/** نافذة اللمح بالمللي ثانية */
const PEEK_MS = 2200

export function HideDrill({ page, payload, onLog, openMushaf }: Props) {
  const { toast } = useToast()
  // عدد الكلمات المخفية من بداية الصفحة (إخفاء تدريجي متتابع)
  const [hiddenCount, setHiddenCount] = useState(0)
  // فهارس الكلمات الملتمحة الآن (تظهر مؤقتاً)
  const [peeked, setPeeked] = useState<Set<number>>(new Set())
  const [logging, setLogging] = useState(false)
  const [logged, setLogged] = useState(false)
  const peekTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  // بنية الصفحة: آيات بكلماتها وفهارسها التراكمية
  const structure = useMemo(() => {
    if (!payload) return null
    const ayahs: { key: string; n: number; words: string[]; start: number }[] = []
    let acc = 0
    for (const a of payload.ayahs) {
      const words = a.text.split(/\s+/).filter(Boolean)
      ayahs.push({ key: a.key, n: a.n, words, start: acc })
      acc += words.length
    }
    return { ayahs, total: acc }
  }, [payload])

  // جلسة جديدة عند تغيير الصفحة
  useEffect(() => {
    setHiddenCount(0)
    setPeeked(new Set())
    setLogged(false)
    peekTimers.current.forEach((t) => clearTimeout(t))
    peekTimers.current.clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // تنظيف المؤقتات عند الإلغاء
  useEffect(() => {
    const timers = peekTimers.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  if (!structure) return null
  const { ayahs, total } = structure

  /** إخفاء كلمة تالية */
  const hideNextWord = () => {
    setHiddenCount((h) => Math.min(total, h + 1))
  }

  /** إخفاء الآية التالية كاملة (أول آية ما زال فيها كلمات ظاهرة) */
  const hideNextAyah = () => {
    setHiddenCount((h) => {
      for (const ay of ayahs) {
        const end = ay.start + ay.words.length
        if (end > h) return end
      }
      return total
    })
  }

  /** إخفاء نسبة من الصفحة */
  const hidePercent = (pct: number) => {
    setHiddenCount(Math.round((total * pct) / 100))
  }

  const showAll = () => {
    setHiddenCount(0)
    setPeeked(new Set())
  }

  const onWordClick = (idx: number) => {
    if (idx >= hiddenCount) return
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
    }, PEEK_MS)
    peekTimers.current.set(idx, t)
  }

  /** تسجيل الجلسة بتقدير المستخدم لإتقانه */
  const logSession = async (score: number, label: string) => {
    if (logging) return
    setLogging(true)
    try {
      await onLog("hide", score, `إخفاء تدريجي صفحة ${page}`)
      setLogged(true)
      if (score >= 100) fireConfetti()
      toast({
        title: score >= 100 ? "تقبل الله! أتقنتها" : "سُجّلت الجلسة",
        description: `${label} — صفحة ${arNum(page)}`,
      })
    } catch {
      toast({ title: "تعذر تسجيل الجلسة", variant: "destructive" })
    } finally {
      setLogging(false)
    }
  }

  const hiddenPct = total > 0 ? Math.round((hiddenCount / total) * 100) : 0

  return (
    <div className="space-y-4" dir="rtl">
      {/* شرح الوضع */}
      <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-[11px] leading-6 text-muted-foreground">
          طريقة الحفّاظ في التثبيت: اقرأ الصفحة ثم أخفِ <span className="font-bold text-foreground">كلمة كلمة</span> أو{" "}
          <span className="font-bold text-foreground">آية آية</span> حتى تختفي الصفحة كلها وأنت تتلوها من حفظك. إن
          تعثرت في كلمة اضغط فراغها لتلمحها لحظة ثم تعود مخفية.
        </p>
      </div>

      {/* أدوات التحكم */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={hideNextWord} disabled={hiddenCount >= total}>
          <EyeOff className="h-3.5 w-3.5" />
          أخفِ كلمة
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={hideNextAyah} disabled={hiddenCount >= total}>
          <Eraser className="h-3.5 w-3.5" />
          أخفِ آية
        </Button>
        <div className="flex items-center overflow-hidden rounded-lg border border-border/70">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => hidePercent(p)}
              className={cn(
                "border-l border-border/50 px-2.5 py-1.5 text-[11px] font-extrabold transition-colors first:border-l-0",
                hiddenPct === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              title={`إخفاء ${p}٪ من الصفحة`}
            >
              {arNum(p)}٪
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-[11px]" onClick={showAll}>
          <Eye className="h-3.5 w-3.5" />
          أظهر الكل
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1 text-[11px]"
          onClick={() => openMushaf(page, "مراجعة قبل الإخفاء")}
        >
          <BookOpen className="h-3.5 w-3.5" />
          راجع في المصحف
        </Button>
      </div>

      {/* شريط تقدم الإخفاء */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
          <span>
            {arNum(hiddenCount)} من {arNum(total)} كلمة مخفية
          </span>
          <span className="tabular-nums">{arNum(hiddenPct)}٪</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${hiddenPct}%` }} />
        </div>
      </div>

      {/* متن الصفحة — كلماتها قابلة للإخفاء */}
      <div className="rounded-xl border-2 border-gold/40 bg-gradient-to-b from-gold/5 to-transparent p-4 shadow-inner dark:border-gold/25 sm:p-5">
        <div className="font-quran space-y-5 text-right text-xl leading-[2.4] text-foreground sm:text-[1.35rem]">
          {ayahs.map((ay) => {
            const fullyHidden = ay.start + ay.words.length <= hiddenCount
            return (
              <span key={ay.key} className={cn("inline", fullyHidden && "opacity-90")}>
                {ay.words.map((w, wi) => {
                  const gIdx = ay.start + wi
                  const isHidden = gIdx < hiddenCount
                  const isPeeked = peeked.has(gIdx)
                  return (
                    <span key={gIdx}>
                      <button
                        type="button"
                        onClick={() => onWordClick(gIdx)}
                        disabled={!isHidden}
                        className={cn(
                          "transition-all duration-300",
                          isHidden
                            ? isPeeked
                              ? "rounded bg-amber-200/80 px-0.5 text-foreground dark:bg-amber-700/50"
                              : "cursor-pointer rounded bg-muted/90 px-0.5 text-transparent decoration-dotted decoration-2 underline-offset-4 select-none hover:bg-muted"
                            : "cursor-default",
                        )}
                        title={isHidden && !isPeeked ? "اضغط لتلمح الكلمة" : undefined}
                        aria-label={isHidden && !isPeeked ? "كلمة مخفية — اضغط لتلمحها" : undefined}
                      >
                        {w}
                      </button>{" "}
                    </span>
                  )
                })}
                {/* رقم الآية */}
                <span className="mx-1 inline-flex h-6 w-6 translate-y-0.5 items-center justify-center rounded-full border border-primary/25 bg-primary/10 align-middle text-[11px] font-bold text-primary">
                  {arNum(ay.n)}
                </span>{" "}
              </span>
            )
          })}
        </div>
      </div>

      {/* تسجيل الجلسة */}
      <div className="rounded-xl border border-border/70 bg-card/70 p-3">
        {!logged ? (
          <>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              أتممت تسميعها بالإخفاء؟ قيّم نفسك بصدق:
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="sm"
                className="h-9 gap-1 bg-emerald-600 text-[11px] font-extrabold hover:bg-emerald-700"
                onClick={() => logSession(100, "أتقنتها كاملة")}
                disabled={logging || hiddenCount === 0}
              >
                {logging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                أتقنتها
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1 border-amber-400/60 text-[11px] font-extrabold text-amber-700 hover:bg-amber-50 dark:text-amber-300"
                onClick={() => logSession(75, "جيد مع تردد بسيط")}
                disabled={logging || hiddenCount === 0}
              >
                جيد
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1 border-red-300/60 text-[11px] font-extrabold text-red-700 hover:bg-red-50 dark:text-red-300"
                onClick={() => logSession(50, "أحتاج مراجعة")}
                disabled={logging || hiddenCount === 0}
              >
                أحتاج مراجعة
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <Check className="h-4 w-4" />
              سُجّلت جلستك — أعد الإخفاء من جديد أو غيّر الصفحة
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-[11px]"
              onClick={() => {
                setHiddenCount(0)
                setLogged(false)
                setPeeked(new Set())
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              جلسة جديدة
            </Button>
          </div>
        )}
        {hiddenCount === 0 && !logged && (
          <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
            <ChevronRight className="h-3 w-3" />
            ابدأ بإخفاء كلمة أو آية — الأزرار أعلاه
          </p>
        )}
      </div>
    </div>
  )
}
