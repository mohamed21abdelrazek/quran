"use client"

// صفحة قابلة للإخفاء التدريجي — مشتركة بين التسميع الصوتي ووضع الإخفاء:
// أخفِ كلمة كلمة أو آية آية أو نسبة من الصفحة — والكلمة المخفية تُلمَح بضغطة

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
// ملاحظة: تُعاد تهيئة الحالة عبر key={page} من المكوّن الأب — بلا effects
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { EyeOff, Eye, Eraser } from "lucide-react"
import type { PagePayload } from "@/lib/mushaf-data"

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
function arNum(n: number): string {
  return String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("")
}

/** مدة لمحة الكلمة بالمللي ثانية */
export const PEEK_MS = 2200

interface Props {
  payload: PagePayload | null
  /** يحتاج عرض محتوى إضافي أسفل الصفحة (أزرار التقييم / المسجل) */
  children?: (ctx: { hiddenCount: number; total: number }) => ReactNode
  /** مرجع للتحكم من الخارج: إخفاء كامل فوري */
  apiRef?: React.MutableRefObject<{ hideAll: () => void; showAll: () => void } | null>
}

export function HideablePage({ payload, children, apiRef }: Props) {
  const [hiddenCount, setHiddenCount] = useState(0)
  const [peeked, setPeeked] = useState<Set<number>>(new Set())
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

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

  const clearAllPeeks = () => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current.clear()
  }

  // تنظيف عند الإلغاء
  useEffect(() => {
    return () => clearAllPeeks()
  }, [])

  // واجهة برمجية خارجية (إخفاء تلقائي عند بدء التسجيل مثلاً)
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      hideAll: () => {
        clearAllPeeks()
        setPeeked(new Set())
        setHiddenCount(structure?.total ?? 0)
      },
      showAll: () => {
        clearAllPeeks()
        setPeeked(new Set())
        setHiddenCount(0)
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, structure])

  if (!structure) return null
  const { ayahs, total } = structure

  const hideNextWord = () => setHiddenCount((h) => Math.min(total, h + 1))

  const hideNextAyah = () =>
    setHiddenCount((h) => {
      for (const ay of ayahs) {
        const end = ay.start + ay.words.length
        if (end > h) return end
      }
      return total
    })

  const hidePercent = (pct: number) => setHiddenCount(Math.round((total * pct) / 100))

  const showAll = () => {
    clearAllPeeks()
    setPeeked(new Set())
    setHiddenCount(0)
  }

  const onWordClick = (idx: number) => {
    if (idx >= hiddenCount) return
    setPeeked((prev) => new Set(prev).add(idx))
    const existing = timers.current.get(idx)
    if (existing) clearTimeout(existing)
    const t = setTimeout(() => {
      setPeeked((prev) => {
        const nx = new Set(prev)
        nx.delete(idx)
        return nx
      })
      timers.current.delete(idx)
    }, PEEK_MS)
    timers.current.set(idx, t)
  }

  const hiddenPct = total > 0 ? Math.round((hiddenCount / total) * 100) : 0

  return (
    <div className="space-y-4" dir="rtl">
      {/* أدوات الإخفاء */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={hideNextWord} disabled={hiddenCount >= total}>
          <EyeOff className="h-3.5 w-3.5" />
          كلمة
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={hideNextAyah} disabled={hiddenCount >= total}>
          <Eraser className="h-3.5 w-3.5" />
          آية
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
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-[11px]" onClick={showAll} disabled={hiddenCount === 0}>
          <Eye className="h-3.5 w-3.5" />
          أظهر الكل
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

      {/* متن الصفحة */}
      <div className="rounded-xl border-2 border-gold/40 bg-gradient-to-b from-gold/5 to-transparent p-4 shadow-inner dark:border-gold/25 sm:p-5">
        <div className="font-quran space-y-5 text-right text-xl leading-[2.4] text-foreground sm:text-[1.35rem]">
          {ayahs.map((ay) => (
            <span key={ay.key}>
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
              <span className="mx-1 inline-flex h-6 w-6 translate-y-0.5 items-center justify-center rounded-full border border-primary/25 bg-primary/10 align-middle text-[11px] font-bold text-primary">
                {arNum(ay.n)}
              </span>{" "}
            </span>
          ))}
        </div>
      </div>

      {children?.({ hiddenCount, total })}
    </div>
  )
}
