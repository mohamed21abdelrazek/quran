"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  X,
  MapPin,
  Scale,
  Minus,
  Plus,
  Layers,
  Repeat,
  MousePointerClick,
  BookmarkCheck,
  Sparkles,
} from "lucide-react"
import { SURAHS, TOTAL_PAGES, pageToJuz, pagesLabel } from "@/lib/quran"
import { BISMILLAH, getPagePayload } from "@/lib/mushaf-data"
import type { AyahRef } from "@/lib/mushaf-data"
import type { AppState } from "@/lib/types"
import { cn } from "@/lib/utils"

// ==================== أنواع ====================

export interface WirdTarget {
  from: number
  to: number
  label: string
}

interface ViewProps {
  state: AppState
  wird: WirdTarget | null
  onCloseWird: () => void
}

// ==================== أدوات ====================

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
function arNum(n: number): string {
  return String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("")
}

/** تطبيع كلمة للمقارنة (بلا تشكيل) */
function plainWord(w: string): string {
  return w
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u06DF\u200C\u200D]/g, "")
    .replace(/\u0671/g, "\u0627")
    .replace(/[؟،.,!؛:]/g, "")
}

/** فروق الكلمات بين نصين — يُبرز ما ليس مشتركاً في الطرف الآخر */
function diffWords(focusText: string, otherText: string): { w: string; diff: boolean }[] {
  const A = focusText.split(/\s+/).filter(Boolean)
  const B = otherText.split(/\s+/).filter(Boolean)
  const na = A.map(plainWord)
  const nb = B.map(plainWord)
  const m = na.length,
    k = nb.length
  if (m === 0 || k === 0) return B.map((w) => ({ w, diff: true }))
  // LCS بمصفوفة كاملة للرجوع
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(k + 1))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = k - 1; j >= 0; j--) {
      dp[i][j] = na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const flags: boolean[] = new Array(k).fill(true)
  let i = 0,
    j = 0
  const inLcs = new Set<number>()
  while (i < m && j < k) {
    if (na[i] === nb[j]) {
      inLcs.add(j)
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }
  for (let x = 0; x < k; x++) flags[x] = !inLcs.has(x) && nb[x] !== "" // علامات الوقف وحدها ليست فرقاً
  return B.map((w, x) => ({ w, diff: flags[x] }))
}

// ==================== المكوّن ====================

// استمرارية بين إعادة التركيب: آخر صفحة وآخر حجم خط زارهما المستخدم
let lastPageVisited = 1
let lastFontScale = 1

export function MushafView({ state, wird, onCloseWird }: ViewProps) {
  const [page, setPage] = useState<number>(wird?.from ?? lastPageVisited)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [fontScale, setFontScale] = useState(lastFontScale)
  const topRef = useRef<HTMLDivElement>(null)

  // المصحف كامل داخل التطبيق — بلا أي طلب شبكة، يعمل أوفلاين
  const data = getPagePayload(page)

  // تمرير سلس لبداية القارئ عند تغيير الصفحة + تذكر آخر موضع
  useEffect(() => {
    lastPageVisited = page
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [page])

  // التنقل بلوحة المفاتيح (في الاتجاهين)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (focusKey) return
      if (e.key === "ArrowLeft" && page < TOTAL_PAGES) setPage((p) => p + 1)
      if (e.key === "ArrowRight" && page > 1) setPage((p) => p - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [page, focusKey])

  const surahName = (s: number) => SURAHS[s - 1]?.name ?? ""

  const memStrength = state.memorized.strengths[page - 1] ?? -1
  const isMemorized = memStrength >= 0

  // صفحات الوِرد (شارات)
  const wirdPages = useMemo(() => {
    if (!wird) return []
    const out: number[] = []
    for (let p = wird.from; p <= wird.to; p++) out.push(p)
    return out
  }, [wird])

  // آية التركيز + مجموعاتها
  const focus = useMemo(() => {
    if (!data || !focusKey) return null
    const ayah = data.ayahs.find((a) => a.key === focusKey) ?? null
    if (!ayah) return null
    const groups = data.mutashabihat.filter((g) => g.items.some((it) => it.key === focusKey))
    return { ayah, groups }
  }, [data, focusKey])

  if (!data) return null

  const jumpTo = (p: number) => {
    setFocusKey(null)
    if (p !== page) setPage(p)
  }

  const fontClass = fontScale === 3 ? "text-2xl sm:text-[1.7rem]" : fontScale === 2 ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"
  const applyFontScale = (f: number) => {
    lastFontScale = f
    setFontScale(f)
  }

  return (
    <div className="space-y-4">
      {/* شريط الوِرد */}
      {wird && (
        <Card className="animate-in fade-in-50 border-emerald-300/70 bg-gradient-to-bl from-emerald-800 via-emerald-700 to-teal-800 text-white shadow-md glow-emerald">
          <CardContent className="pattern-islamic-light space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-extrabold">وِرد اليوم — {wird.label}</p>
                  <p className="text-[11px] text-white/75">أنت الآن في صفحة {arNum(page)} من {arNum(TOTAL_PAGES)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {page < wird.to && (
                  <Button
                    size="sm"
                    className="h-8 bg-white/15 text-white hover:bg-white/25"
                    onClick={() => setPage((p) => Math.min(wird.to, p + 1))}
                  >
                    التالية في الوِرد
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                {page !== wird.from && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-white/30 bg-transparent text-white hover:bg-white/15"
                    onClick={() => setPage(wird.from)}
                  >
                    بداية الوِرد
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white/80 hover:bg-white/15 hover:text-white"
                  onClick={onCloseWird}
                  aria-label="إغلاق وضع الوِرد"
                  title="إغلاق وضع الوِرد"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {wirdPages.length <= 12 && (
              <div className="flex flex-wrap gap-1.5" dir="rtl">
                {wirdPages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={cn(
                      "min-w-9 rounded-lg px-2.5 py-1 text-xs font-extrabold tabular-nums transition-all",
                      p === page
                        ? "bg-white text-emerald-800 shadow"
                        : "bg-white/10 text-white/85 hover:bg-white/25"
                    )}
                    aria-label={`صفحة ${p}`}
                  >
                    {arNum(p)}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* أدوات التنقل */}
      <div ref={topRef} className="scroll-mt-36 space-y-3">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="space-y-3.5 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="الصفحة السابقة"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                  <div className="min-w-0 text-center">
                    <p className="text-sm font-extrabold tabular-nums">
                      صفحة {arNum(page)} <span className="text-muted-foreground">/ {arNum(TOTAL_PAGES)}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      الجزء {arNum(pageToJuz(page))} • {data?.surahLabel ?? "…"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    disabled={page >= TOTAL_PAGES}
                    onClick={() => setPage((p) => Math.min(TOTAL_PAGES, p + 1))}
                    aria-label="الصفحة التالية"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex items-center rounded-lg border border-border/70">
                  <button
                    type="button"
                    className="px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    disabled={fontScale <= 1}
                    onClick={() => applyFontScale(Math.max(1, fontScale - 1))}
                    aria-label="تصغير الخط"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="px-1 text-[10px] font-bold text-muted-foreground">الخط</span>
                  <button
                    type="button"
                    className="px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    disabled={fontScale >= 3}
                    onClick={() => applyFontScale(Math.min(3, fontScale + 1))}
                    aria-label="تكبير الخط"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <Select
                  value={String(page)}
                  onValueChange={(v) => setPage(Number(v))}
                >
                  <SelectTrigger className="h-9 w-40 shrink-0 text-xs sm:w-52" aria-label="الانتقال إلى سورة">
                    <SelectValue placeholder="انتقل إلى سورة" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {SURAHS.map((s) => (
                      <SelectItem key={s.n} value={String(s.page)} className="text-xs">
                        {s.name} <span className="text-muted-foreground">— ص {arNum(s.page)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Slider
                value={[page]}
                onValueChange={(v) => setPage(v[0])}
                min={1}
                max={TOTAL_PAGES}
                step={1}
                dir="ltr"
                className="flex-1"
                aria-label="شريط التنقل بين صفحات المصحف"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* صفحة المصحف — من البيانات المحلية مباشرة */}
      <Card
          className={cn(
            "animate-in fade-in-50 overflow-hidden border-2 shadow-md",
            wird && page >= wird.from && page <= wird.to
              ? "border-emerald-400/70 dark:border-emerald-600/60"
              : "border-gold/40 dark:border-gold/25"
          )}
        >
          <CardContent className="p-0">
            {/* ترويسة الصفحة */}
            <div className="border-b border-dashed border-gold/40 bg-gradient-to-b from-gold/10 to-transparent px-4 py-3 text-center dark:from-gold/5">
              <p className="text-xs font-extrabold text-muted-foreground">
                الجزء {arNum(data.juz)} • {data.surahLabel}
              </p>
            </div>

            {/* متن الصفحة */}
            <div className="pattern-islamic-light relative px-4 py-6 sm:px-8" dir="rtl">
              {data.sections.map((sec, si) => {
                const secAyahs = data.ayahs.filter((a) => a.s === sec.s && a.n >= sec.fromAyah && a.n <= sec.toAyah)
                return (
                  <section key={sec.s} aria-label={`سورة ${sec.name}`} className={cn(si > 0 && "mt-8")}>
                    {sec.startsHere ? (
                      <div className="mb-4 text-center">
                        <h3 className="font-quran text-2xl font-bold text-primary sm:text-3xl">
                          سُورَةُ {sec.name}
                        </h3>
                        <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                          <Badge variant="secondary" className="text-[10px]">{sec.type}</Badge>
                          <span>من آية {arNum(sec.fromAyah)} في هذه الصفحة</span>
                        </div>
                        {sec.showBismillah && (
                          <p className="font-quran mt-3 text-xl text-foreground/90 sm:text-2xl">{BISMILLAH}</p>
                        )}
                        <div className="mx-auto mt-4 h-px w-40 bg-gradient-to-l from-transparent via-gold/60 to-transparent" />
                      </div>
                    ) : (
                      <p className="mb-2 text-right text-[11px] font-bold text-muted-foreground/80">
                        تكملة سورة {sec.name}
                      </p>
                    )}

                    <p className={cn("font-quran text-right leading-[2.3] text-foreground", fontClass)}>
                      {secAyahs.map((a) => {
                        const gCount = a.groups.length
                        return (
                          <span key={a.key}>
                            {a.text}{" "}
                            <span
                              className="mx-0.5 inline-flex h-6 w-6 translate-y-0.5 items-center justify-center rounded-full border border-primary/25 bg-primary/10 align-middle text-[11px] font-bold text-primary tabular-nums"
                              title={`آية ${a.n}`}
                            >
                              {arNum(a.n)}
                            </span>
                            {gCount > 0 && (
                              <>
                                {" "}
                                <button
                                  type="button"
                                  onClick={() => setFocusKey(a.key)}
                                  className="mx-0.5 inline-flex translate-y-0.5 items-center gap-1 rounded-full border border-amber-400/50 bg-amber-50 px-2 py-0.5 align-middle text-[10px] font-bold text-amber-700 transition-all hover:bg-amber-100 hover:shadow-sm dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                                  title="اضغط لعرض الآيات المتشابهة مع الفرق"
                                >
                                  <Scale className="h-3 w-3" />
                                  متشابهات {arNum(gCount)}
                                </button>
                              </>
                            )}{" "}
                          </span>
                        )
                      })}
                    </p>
                  </section>
                )
              })}

              {/* ملخص المتشابهات في الصفحة */}
              {data.mutashabihat.length > 0 && (
                <div className="mt-8 rounded-xl border border-dashed border-amber-300/60 bg-amber-50/50 p-3 dark:border-amber-600/30 dark:bg-amber-950/20">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    <Layers className="h-3.5 w-3.5" />
                    في هذه الصفحة: {arNum(data.mutashabihat.length)} مجموعة متشابهات — اضغط زر «متشابهات» بجوار الآية
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.ayahs
                      .filter((a) => a.groups.length > 0)
                      .map((a) => (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => setFocusKey(a.key)}
                          className="rounded-md border border-amber-300/50 bg-white/70 px-2 py-0.5 text-[10px] font-bold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-600/30 dark:bg-black/20 dark:text-amber-300 dark:hover:bg-amber-900/40"
                        >
                          {surahName(a.s)} {arNum(a.n)}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* تذييل الصفحة */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-gold/40 bg-gradient-to-t from-gold/10 to-transparent px-4 py-3 text-[11px] dark:from-gold/5">
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold",
                isMemorized
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground"
              )}>
                <BookmarkCheck className="h-3.5 w-3.5" />
                {isMemorized
                  ? `محفوظة — قوتها ${arNum(memStrength)}/٥`
                  : "غير محفوظة بعد"}
              </span>
              <span className="text-muted-foreground">
                {pagesLabel(page, page)} • {data.ayahs.length} آية
              </span>
            </div>
          </CardContent>
        </Card>

      {/* تلميح استخدام */}
      {!wird && (
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <MousePointerClick className="h-3.5 w-3.5" />
          استخدم الأسهم يميناً ويساراً للتنقل — وزر «متشابهات» بجوار كل آية يعرض نظائرها مع إبراز الفرق
        </p>
      )}

      {/* نافذة المتشابهات */}
      <Dialog open={!!focusKey} onOpenChange={(o) => !o && setFocusKey(null)}>
        <DialogContent className="max-h-[88vh] sm:max-w-2xl" dir="rtl">
          {focus && (
            <>
              <DialogHeader className="text-right">
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    <Scale className="h-4 w-4" />
                  </span>
                  متشابهات الآية — {surahName(focus.ayah.s)} {arNum(focus.ayah.n)}
                  <span className="text-xs font-medium text-muted-foreground">
                    (ص {arNum(page)})
                  </span>
                </DialogTitle>
                <DialogDescription className="text-right">
                  راجع نظائر هذه الآية واحفظ الفرق بينها — الكلمات المظللة بالكهرماني هي موضع الاختلاف.
                </DialogDescription>
              </DialogHeader>

              <div className="scroll-thin max-h-[62vh] space-y-3 overflow-y-auto pl-1" dir="rtl">
                {/* نص الآية الأصلية */}
                <blockquote className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                  <p className="font-quran text-right text-lg leading-[2.1] text-foreground">
                    {focus.ayah.text}
                  </p>
                  <p className="mt-1 text-left text-[10px] font-bold text-primary">
                    {surahName(focus.ayah.s)} {arNum(focus.ayah.n)} — الآية الحالية
                  </p>
                </blockquote>

                {focus.groups.map((g) => {
                  const others = g.items.filter((it) => it.key !== focus.ayah.key)
                  if (g.identical) {
                    return (
                      <div
                        key={`g${g.id}`}
                        className="rounded-xl border border-emerald-300/60 bg-emerald-50/60 p-3 dark:border-emerald-700/40 dark:bg-emerald-950/25"
                      >
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                          <Repeat className="h-4 w-4" />
                          تتكرر حرفياً في {arNum(others.length)} مواضع أخرى
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {others.map((it) => (
                            <button
                              key={it.key}
                              type="button"
                              onClick={() => jumpTo(it.page)}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/60 bg-white/80 px-2.5 py-1.5 text-[11px] font-bold text-emerald-900 transition-all hover:border-emerald-400 hover:shadow-sm dark:border-emerald-700/40 dark:bg-black/25 dark:text-emerald-200"
                              title={`اذهب إلى صفحة ${it.page}`}
                            >
                              <MapPin className="h-3 w-3" />
                              {it.surah} {arNum(it.n)} — ص {arNum(it.page)}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-emerald-800/80 dark:text-emerald-200/70">
                          نفس النص حرفياً — انتبه ألا تخلط بين سياقها في كل سورة.
                        </p>
                      </div>
                    )
                  }

                  // بطاقات المتشابهات بفروق — مع دمج النصوص المكررة
                  const byText = new Map<string, AyahRef[]>()
                  for (const it of others) {
                    const list = byText.get(it.text) ?? []
                    list.push(it)
                    byText.set(it.text, list)
                  }
                  return (
                    <div key={`g${g.id}`} className="space-y-2.5">
                      {[...byText.entries()].map(([txt, items], idx) => {
                        const first = items[0]
                        const words = diffWords(focus.ayah.text, txt)
                        return (
                          <div
                            key={first.key + idx}
                            className="rounded-xl border border-amber-300/60 bg-amber-50/50 p-3 dark:border-amber-600/30 dark:bg-amber-950/20"
                          >
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900 dark:text-amber-200">
                                <Sparkles className="h-3.5 w-3.5" />
                                {items.length > 1
                                  ? `متشابهة في ${arNum(items.length)} مواضع بنص واحد`
                                  : `في ${first.surah} — الآية ${arNum(first.n)}`}
                              </p>
                              <button
                                type="button"
                                onClick={() => jumpTo(first.page)}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-300/70 bg-white/80 px-2 py-1 text-[10px] font-bold text-amber-800 transition-all hover:shadow-sm dark:border-amber-600/40 dark:bg-black/25 dark:text-amber-300"
                                title={`اذهب إلى صفحة ${first.page}`}
                              >
                                <MapPin className="h-3 w-3" />
                                ص {arNum(first.page)}
                              </button>
                            </div>
                            <p className="font-quran text-right text-lg leading-[2.1] text-foreground">
                              {words.map((wd, wi) => (
                                <span
                                  key={wi}
                                  className={cn(
                                    wd.diff &&
                                      "rounded bg-amber-200/80 px-0.5 decoration-amber-500 decoration-wavy underline-offset-4 dark:bg-amber-800/50"
                                  )}
                                >
                                  {wd.w}{" "}
                                </span>
                              ))}
                            </p>
                            {items.length > 1 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {items.map((it) => (
                                  <button
                                    key={it.key}
                                    type="button"
                                    onClick={() => jumpTo(it.page)}
                                    className="inline-flex items-center gap-1 rounded-md border border-amber-300/50 bg-white/70 px-2 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-600/30 dark:bg-black/20 dark:text-amber-300"
                                  >
                                    <MapPin className="h-2.5 w-2.5" />
                                    {it.surah} {arNum(it.n)}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
