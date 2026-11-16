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
  Play,
  Square,
  Loader2,
  Headphones,
  Sun,
  ScrollText,
  MoonStar,
  GraduationCap,
  Bookmark,
  BookMarked,
  BookOpenText,
  Landmark,
  Tag,
  AlertTriangle,
} from "lucide-react"
import { SURAHS, TOTAL_PAGES, pageToJuz, pagesLabel } from "@/lib/quran"
import { BISMILLAH, getNextAyahText, getPagePayload } from "@/lib/mushaf-data"
import type { AyahRef } from "@/lib/mushaf-data"
import { getTafsir, getAsbab } from "@/lib/tafsir"
import type { AppState } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useAyahAudio } from "@/hooks/use-ayah-audio"
import { QARIS } from "@/lib/audio"
import { useToast } from "@/hooks/use-toast"

// ==================== أنواع ====================

export interface WirdTarget {
  from: number
  to: number
  label: string
  /** زيارة صفحة بلا وِرد — من قسم اختبرني */
  visit?: boolean
}

interface ViewProps {
  state: AppState
  wird: WirdTarget | null
  onCloseWird: () => void
  /** إجراء مع قائمة انتظار أوفلاين — للعلامات المرجعية والكلمات الصعبة */
  action: (url: string, body: unknown) => Promise<Record<string, unknown>>
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

/** تقسيم أعضاء مجموعة إلى مقاطع: آيات متتالية في نفس السورة = مقطع واحد */
function passagesOf(items: AyahRef[]): AyahRef[][] {
  const sorted = [...items].sort((a, b) => a.s - b.s || a.n - b.n)
  const out: AyahRef[][] = []
  for (const it of sorted) {
    const last = out[out.length - 1]
    if (last && last[0].s === it.s && last[last.length - 1].n === it.n - 1) last.push(it)
    else out.push([it])
  }
  return out
}

/** أول كلمات من الآية التالية — «السياق» الذي يميّز نهايات المتشابهات */
function continuationOf(passage: AyahRef[], gCtx: boolean) {
  if (!gCtx) return null
  const next = getNextAyahText(passage[passage.length - 1].key)
  if (!next) return null
  const words = next.split(/\s+/).slice(0, 7).join(" ")
  return (
    <p className="mt-1.5 rounded-md border border-teal-300/40 bg-teal-100/50 px-2 py-1 text-[11px] leading-5 text-teal-800 dark:border-teal-700/40 dark:bg-teal-950/40 dark:text-teal-200">
      <span className="font-bold">السياق بعده: </span>
      <span className="font-quran">{words}…</span>
    </p>
  )
}

// ==================== أنماط القراءة ====================

type ReadingMode = "light" | "sepia" | "night"
const MODE_LS_KEY = "wardi:readingMode"
const LASTREAD_LS_KEY = "wardi:lastRead"

const MODES: Record<
  ReadingMode,
  {
    pageBg: string
    headerBorder: string
    headerBg: string
    headerText: string
    body: string
    suraTitle: string
    bism: string
    meta: string
    circle: string
    badge: string
    footerBorder: string
    footerBg: string
    summaryBox: string
    summaryChip: string
    summaryText: string
    playing: string
  }
> = {
  light: {
    pageBg: "pattern-islamic-light",
    headerBorder: "border-gold/40",
    headerBg: "bg-gradient-to-b from-gold/10 to-transparent dark:from-gold/5",
    headerText: "text-muted-foreground",
    body: "text-foreground",
    suraTitle: "text-primary",
    bism: "text-foreground/90",
    meta: "text-muted-foreground",
    circle: "border-primary/25 bg-primary/10 text-primary",
    badge: "",
    footerBorder: "border-gold/40",
    footerBg: "bg-gradient-to-t from-gold/10 to-transparent dark:from-gold/5",
    summaryBox: "border-amber-300/60 bg-amber-50/50 dark:border-amber-600/30 dark:bg-amber-950/20",
    summaryChip:
      "border-amber-300/50 bg-white/70 text-amber-800 hover:bg-amber-100 dark:border-amber-600/30 dark:bg-black/20 dark:text-amber-300 dark:hover:bg-amber-900/40",
    summaryText: "text-amber-800 dark:text-amber-300",
    playing: "bg-emerald-200/70 dark:bg-emerald-800/50",
  },
  sepia: {
    pageBg: "pattern-islamic-light bg-[#f3ead8]",
    headerBorder: "border-[#c9b283]/60",
    headerBg: "bg-gradient-to-b from-[#eadfc4] to-transparent",
    headerText: "text-[#8a7a5f]",
    body: "text-[#3f3423]",
    suraTitle: "text-[#7a5c2e]",
    bism: "text-[#5f4d2e]",
    meta: "text-[#8a7a5f]",
    circle: "border-[#b08d57]/50 bg-[#b08d57]/15 text-[#7a5c2e]",
    badge: "border-[#c9b283]/50 bg-[#b08d57]/10 text-[#7a5c2e]",
    footerBorder: "border-[#c9b283]/60",
    footerBg: "bg-gradient-to-t from-[#eadfc4] to-transparent",
    summaryBox: "border-[#c9b283]/60 bg-[#ece1c6]/60",
    summaryChip: "border-[#c9b283]/50 bg-[#f3ead8]/80 text-[#6b5730] hover:bg-[#eadfc4]",
    summaryText: "text-[#7a5c2e]",
    playing: "bg-[#d9ca9e]/70",
  },
  night: {
    pageBg: "pattern-islamic-light bg-[#0f1613]",
    headerBorder: "border-emerald-800/50",
    headerBg: "bg-gradient-to-b from-emerald-950/60 to-transparent",
    headerText: "text-emerald-200/70",
    body: "text-[#e9e6da]",
    suraTitle: "text-emerald-300",
    bism: "text-emerald-100/90",
    meta: "text-emerald-200/60",
    circle: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    badge: "border-emerald-700/50 bg-emerald-900/40 text-emerald-300",
    footerBorder: "border-emerald-800/50",
    footerBg: "bg-gradient-to-t from-emerald-950/60 to-transparent",
    summaryBox: "border-emerald-800/50 bg-emerald-950/40",
    summaryChip: "border-emerald-700/50 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-800/60",
    summaryText: "text-emerald-200/80",
    playing: "bg-emerald-400/25",
  },
}

// ==================== المكوّن ====================

// استمرارية بين إعادة التركيب: آخر صفحة وآخر حجم خط زارهما المستخدم
let lastPageVisited = 1
let lastFontScale = 1

export function MushafView({ state, wird, onCloseWird, action }: ViewProps) {
  const [page, setPage] = useState<number>(wird?.from ?? lastPageVisited)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [fontScale, setFontScale] = useState(lastFontScale)
  const [mode, setMode] = useState<ReadingMode>("light")
  // بطاقة الآية: التفسير وأسباب النزول وتعليم الكلمات الصعبة
  const [cardKey, setCardKey] = useState<string | null>(null)
  const [cardData, setCardData] = useState<
    { tafsir: string | null; asbab: string[] | null; loading: boolean } | null
  >(null)
  // العلامات المرجعية — نسخة محلية تُحدّث تفاؤلياً
  const [bookmarks, setBookmarks] = useState<number[]>([])
  const [markBusy, setMarkBusy] = useState(false)
  // كلمات أُضيفت للقائمة الصعبة في هذه الجلسة (عرض فوري)
  const [addedHard, setAddedHard] = useState<Set<string>>(new Set())

  // المصحف كامل داخل التطبيق — بلا أي طلب شبكة، يعمل أوفلاين
  // (قبل كل التأثيرات: تقييم مصفوفات الاعتماديات في نفس الاستدعاء)
  const data = getPagePayload(page)

  const topRef = useRef<HTMLDivElement>(null)
  const restoredRef = useRef(false)
  const audio = useAyahAudio()
  const { toast } = useToast()

  // مزامنة العلامات والصعبة من حالة التطبيق
  useEffect(() => {
    setBookmarks(state.tools?.bookmarks ?? [])
  }, [state.tools?.bookmarks])

  useEffect(() => {
    setAddedHard(new Set((state.tools?.difficult ?? []).map((d) => `${d.key}:${d.word}`)))
  }, [state.tools?.difficult])

  // جلب التفسير وأسباب النزول عند فتح بطاقة الآية
  useEffect(() => {
    if (!cardKey || !data) return
    const ayah = data.ayahs.find((a) => a.key === cardKey)
    if (!ayah) return
    let cancelled = false
    setCardData({ tafsir: null, asbab: null, loading: true })
    Promise.all([getTafsir(ayah.s, ayah.n), getAsbab(ayah.s, ayah.n)]).then(([t, ab]) => {
      if (!cancelled) setCardData({ tafsir: t, asbab: ab, loading: false })
    })
    return () => {
      cancelled = true
    }
  }, [cardKey, data])

  // استرجاع التفضيلات + آخر موضع قراءة — إطاراً واحداً بعد التركيب
  // (نداء من نظام خارجي: بلا تعارض hydration ولا setState متزامن داخل التأثير)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const m = localStorage.getItem(MODE_LS_KEY)
        if (m === "light" || m === "sepia" || m === "night") setMode(m)
        if (!wird) {
          const last = Number(localStorage.getItem(LASTREAD_LS_KEY))
          if (last >= 1 && last <= TOTAL_PAGES) setPage(last)
        }
      } catch {
        /* تجاهل */
      }
      // اكتمل الاسترجاع — من الآن يجوز الكتابة والتمرير
      restoredRef.current = true
      topRef.current?.scrollIntoView({ behavior: "auto", block: "start" })
    })
    return () => cancelAnimationFrame(raf)
  }, [wird])

  // تمرير سلس + تذكر آخر موضع — بعد اكتمال الاسترجاع فقط
  // (حتى لا تدهس الكتابةُ القيمةَ المحفوظة قبل قراءتها)
  useEffect(() => {
    if (!restoredRef.current) return
    lastPageVisited = page
    try {
      localStorage.setItem(LASTREAD_LS_KEY, String(page))
    } catch {
      /* تجاهل */
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [page])

  // إشعار عند تعذر التلاوة
  useEffect(() => {
    if (audio.error) {
      toast({ title: "تعذر تشغيل التلاوة", description: audio.error, variant: "destructive" })
    }
  }, [audio.error, toast])

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

  // آية التركيز + مجموعاتها (خبرة الحفّاظ أولاً ثم المتطابقات فالمتشابهات)
  const focus = useMemo(() => {
    if (!data || !focusKey) return null
    const ayah = data.ayahs.find((a) => a.key === focusKey) ?? null
    if (!ayah) return null
    const groups = data.mutashabihat
      .filter((g) => g.items.some((it) => it.key === focusKey))
      .sort(
        (a, b) =>
          Number(b.curated) - Number(a.curated) ||
          Number(b.identical) - Number(a.identical) ||
          b.items.length - a.items.length,
      )
    return { ayah, groups }
  }, [data, focusKey])

  if (!data) return null

  const jumpTo = (p: number) => {
    setFocusKey(null)
    if (p !== page) setPage(p)
  }

  /** تبديل علامة مرجعية للصفحة الحالية — تحديث تفاؤلي فوري */
  const toggleMark = async () => {
    if (markBusy) return
    setMarkBusy(true)
    const marked = bookmarks.includes(page)
    // تفاؤلي: أعد القائمة فوراً، وتراجع عند الفشل
    setBookmarks((prev) => (marked ? prev.filter((p) => p !== page) : [...prev, page].sort((a, b) => a - b)))
    try {
      const res = await action("/api/bookmarks", { page })
      if (res.queued) {
        toast({ title: "حُفظت أوفلاين", description: "العلامة ستُرسل تلقائياً فور عودة الاتصال" })
      } else {
        toast({
          title: marked ? "أزلنا العلامة" : "أُضيفت علامة",
          description: marked ? `صفحة ${arNum(page)} بلا علامة الآن` : `صارت صفحة ${arNum(page)} ضمن علاماتك`,
        })
      }
    } catch {
      setBookmarks((prev) => (marked ? [...prev, page].sort((a, b) => a - b) : prev.filter((p) => p !== page)))
      toast({ title: "تعذر حفظ العلامة", variant: "destructive" })
    } finally {
      setMarkBusy(false)
    }
  }

  /** تعليم كلمة داخل آية كصعبة — من بطاقة الآية */
  const markWord = async (key: string, word: string, s: number, n: number, pg: number) => {
    if (addedHard.has(`${key}:${word}`)) return
    setAddedHard((prev) => new Set(prev).add(`${key}:${word}`))
    try {
      const res = await action("/api/difficult", { action: "add", key, word, surah: s, ayah: n, page: pg })
      if (!res.queued) {
        toast({ title: "أُضيفت للقائمة الصعبة", description: "ستراها في تبويب «اختبرني» لمراجعتها" })
      }
    } catch {
      setAddedHard((prev) => {
        const nx = new Set(prev)
        nx.delete(`${key}:${word}`)
        return nx
      })
      toast({ title: "تعذر الحفظ", variant: "destructive" })
    }
  }

  const fontClass = fontScale === 3 ? "text-2xl sm:text-[1.7rem]" : fontScale === 2 ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"
  const applyFontScale = (f: number) => {
    lastFontScale = f
    setFontScale(f)
  }
  const applyMode = (m: ReadingMode) => {
    setMode(m)
    try {
      localStorage.setItem(MODE_LS_KEY, m)
    } catch {
      /* تجاهل */
    }
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
                  <p className="text-sm font-extrabold">{wird.visit ? "مراجعة سريعة" : "وِرد اليوم"} — {wird.label}</p>
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
                <Button
                  variant="outline"
                  size="icon"
                  className={cn("h-9 w-9 shrink-0", bookmarks.includes(page) && "border-primary/50 text-primary")}
                  onClick={toggleMark}
                  disabled={markBusy}
                  aria-pressed={bookmarks.includes(page)}
                  aria-label={bookmarks.includes(page) ? "إزالة علامة هذه الصفحة" : "وضع علامة على هذه الصفحة"}
                  title={bookmarks.includes(page) ? "إزالة علامة الصفحة" : "علّم هذه الصفحة"}
                >
                  <Bookmark className={cn("h-5 w-5", bookmarks.includes(page) && "fill-primary text-primary")} />
                </Button>
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

            {/* علاماتي المرجعية */}
            {bookmarks.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5" dir="rtl">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                  <BookMarked className="h-3.5 w-3.5" />
                  علاماتي:
                </span>
                <div className="scroll-thin flex max-w-full flex-wrap gap-1.5">
                  {bookmarks.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={cn(
                        "min-w-8 rounded-md border px-2 py-0.5 text-[11px] font-extrabold tabular-nums transition-all",
                        p === page
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/70 bg-muted/60 text-foreground hover:border-primary/50 hover:text-primary",
                      )}
                      title={`اذهب إلى صفحة ${p}`}
                    >
                      {arNum(p)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* التلاوة + نمط القراءة */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={audio.seqPlaying ? "default" : "outline"}
                  className={cn("h-8 gap-1.5", audio.seqPlaying && "bg-emerald-600 hover:bg-emerald-700")}
                  onClick={() => audio.togglePage(data.ayahs.map((a) => ({ key: a.key, s: a.s, n: a.n })))}
                >
                  {audio.seqPlaying ? <Square className="h-3.5 w-3.5 fill-current" /> : <Headphones className="h-3.5 w-3.5" />}
                  {audio.seqPlaying ? "إيقاف" : "استمع للصفحة"}
                </Button>
                <Select value={audio.qariId} onValueChange={audio.changeQari}>
                  <SelectTrigger className="h-8 w-36 text-[11px]" aria-label="اختيار القارئ">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {QARIS.map((q) => (
                      <SelectItem key={q.id} value={q.id} className="text-xs">
                        {q.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {audio.playingKey && (
                  <span className="hidden items-center gap-1 text-[10px] font-bold text-emerald-700 sm:inline-flex dark:text-emerald-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {audio.buffering ? "جارٍ التحميل…" : "تلاوة جارية"}
                  </span>
                )}
              </div>

              <div className="flex items-center rounded-lg border border-border/70 p-0.5" role="group" aria-label="نمط القراءة">
                {(
                  [
                    ["light", Sun, "عادي"],
                    ["sepia", ScrollText, "ورقي"],
                    ["night", MoonStar, "ليلي"],
                  ] as const
                ).map(([m, Icon, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => applyMode(m)}
                    aria-pressed={mode === m}
                    title={`نمط ${label}`}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-all",
                      mode === m
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] leading-4 text-muted-foreground">
              التلاوة تحتاج اتصالاً أول مرة، ثم تُحفظ تلقائياً وتعمل دون إنترنت.
            </p>
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
          <div
            className={cn(
              "border-b border-dashed px-4 py-3 text-center transition-colors",
              MODES[mode].headerBorder,
              MODES[mode].headerBg
            )}
          >
            <p className={cn("text-xs font-extrabold", MODES[mode].headerText)}>
              الجزء {arNum(data.juz)} • {data.surahLabel}
            </p>
          </div>

          {/* متن الصفحة */}
          <div className={cn("relative px-4 py-6 transition-colors sm:px-8", MODES[mode].pageBg)} dir="rtl">
            {data.sections.map((sec, si) => {
              const secAyahs = data.ayahs.filter((a) => a.s === sec.s && a.n >= sec.fromAyah && a.n <= sec.toAyah)
              return (
                <section key={sec.s} aria-label={`سورة ${sec.name}`} className={cn(si > 0 && "mt-8")}>
                  {sec.startsHere ? (
                    <div className="mb-4 text-center">
                      <h3 className={cn("font-quran text-2xl font-bold sm:text-3xl", MODES[mode].suraTitle)}>
                        سُورَةُ {sec.name}
                      </h3>
                      <div className={cn("mt-1.5 flex items-center justify-center gap-2 text-[11px]", MODES[mode].meta)}>
                        <Badge variant="secondary" className={cn("border text-[10px]", MODES[mode].badge)}>
                          {sec.type}
                        </Badge>
                        <span>من آية {arNum(sec.fromAyah)} في هذه الصفحة</span>
                      </div>
                      {sec.showBismillah && (
                        <p className={cn("font-quran mt-3 text-xl sm:text-2xl", MODES[mode].bism)}>{BISMILLAH}</p>
                      )}
                      <div className="mx-auto mt-4 h-px w-40 bg-gradient-to-l from-transparent via-gold/60 to-transparent" />
                    </div>
                  ) : (
                    <p className={cn("mb-2 text-right text-[11px] font-bold", MODES[mode].meta)}>
                      تكملة سورة {sec.name}
                    </p>
                  )}

                  <p className={cn("font-quran text-right leading-[2.3]", MODES[mode].body, fontClass)}>
                    {secAyahs.map((a) => {
                      const gCount = a.groups.length
                      const isPlaying = audio.playingKey === a.key
                      return (
                        <span
                          key={a.key}
                          className={cn(isPlaying && ["rounded-lg px-1 transition-colors", MODES[mode].playing])}
                        >
                          <button
                            type="button"
                            onClick={() => setCardKey(a.key)}
                            className={cn(
                              "font-quran cursor-pointer underline decoration-gold/50 decoration-dotted underline-offset-8 transition-colors hover:decoration-gold",
                              MODES[mode].body,
                            )}
                            title="بطاقة الآية: التفسير وأسباب النزول والكلمات الصعبة"
                          >
                            {a.text}
                          </button>{" "}
                          <span
                            className={cn(
                              "mx-0.5 inline-flex h-6 w-6 translate-y-0.5 items-center justify-center rounded-full align-middle text-[11px] font-bold tabular-nums",
                              MODES[mode].circle
                            )}
                            title={`آية ${a.n}`}
                          >
                            {arNum(a.n)}
                          </span>{" "}
                          <button
                            type="button"
                            onClick={() => audio.playAyah({ key: a.key, s: a.s, n: a.n })}
                            className={cn(
                              "mx-0.5 inline-flex h-6 w-6 translate-y-0.5 items-center justify-center rounded-full align-middle transition-all",
                              isPlaying
                                ? "border border-emerald-500 bg-emerald-600 text-white shadow-sm"
                                : "border border-emerald-400/50 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:shadow-sm dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                            )}
                            title={isPlaying ? "إيقاف التلاوة" : "استمع لهذه الآية"}
                            aria-label={isPlaying ? "إيقاف تلاوة الآية" : "تلاوة الآية"}
                          >
                            {isPlaying && audio.buffering ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isPlaying ? (
                              <Square className="h-3 w-3 fill-current" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                          </button>
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
              <div className={cn("mt-8 rounded-xl border border-dashed p-3", MODES[mode].summaryBox)}>
                <p className={cn("mb-2 flex items-center gap-1.5 text-[11px] font-bold", MODES[mode].summaryText)}>
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
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[10px] font-bold transition-colors",
                          MODES[mode].summaryChip
                        )}
                      >
                        {surahName(a.s)} {arNum(a.n)}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* تذييل الصفحة */}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 border-t border-dashed px-4 py-3 text-[11px] transition-colors",
              MODES[mode].footerBorder,
              MODES[mode].footerBg
            )}
          >
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold",
                isMemorized
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              {isMemorized
                ? `محفوظة — قوتها ${arNum(memStrength)}/٥`
                : "غير محفوظة بعد"}
            </span>
            <span className={cn("text-muted-foreground", MODES[mode].meta)}>
              {pagesLabel(page, page)} • {data.ayahs.length} آية
            </span>
          </div>
        </CardContent>
      </Card>

      {/* تلميح استخدام */}
      {!wird && (
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] leading-5 text-muted-foreground">
          <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
          استخدم الأسهم للتنقل — اضغط على آية لتفسيرها وأسباب نزولها، وزر «متشابهات» يعرض نظائرها مع إبراز الفرق
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
                  <span className="text-xs font-medium text-muted-foreground">(ص {arNum(page)})</span>
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

                  // ==== من خبرة الحفّاظ (منسّقة يدوياً لإدراك العاصم) ====
                  if (g.curated) {
                    const passages = passagesOf(g.items)
                    const origin = passages.find((p) => p.some((x) => x.key === focus.ayah.key)) ?? passages[0]
                    const otherPassages = passages.filter((p) => p !== origin)
                    const originText = origin.map((x) => x.text).join(" ")
                    const originLabel =
                      origin.length > 1
                        ? `المقطع الأصلي — ${origin[0].surah} ${arNum(origin[0].n)}-${arNum(origin[origin.length - 1].n)}`
                        : `الآية الحالية في ${origin[0].surah} ${arNum(origin[0].n)}`
                    return (
                      <div
                        key={`g${g.id}`}
                        className="space-y-2.5 rounded-xl border border-teal-300/60 bg-teal-50/50 p-3 dark:border-teal-700/40 dark:bg-teal-950/25"
                      >
                        <p className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold text-teal-800 dark:text-teal-300">
                          <GraduationCap className="h-4 w-4" />
                          من خبرة الحفّاظ
                          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-900/50 dark:text-teal-300">
                            مواضع يخطئ فيها الحفّاظ عادةً
                          </span>
                          {g.ctx && (
                            <span className="rounded-full border border-teal-300/60 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:border-teal-700/50 dark:text-teal-300">
                              مع تكملة السياق
                            </span>
                          )}
                        </p>

                        {/* المقطع الأصلي */}
                        <div className="rounded-lg border border-teal-400/50 bg-white/70 p-2.5 dark:bg-black/25">
                          <p className="mb-1 text-[10px] font-bold text-teal-700 dark:text-teal-300">{originLabel}</p>
                          <p className="font-quran text-right text-lg leading-[2.1] text-foreground">{originText}</p>
                          {continuationOf(origin, g.ctx)}
                        </div>

                        {/* النظائر مع إبراز الفرق */}
                        {otherPassages.map((p, pi) => {
                          const txt = p.map((x) => x.text).join(" ")
                          const words = diffWords(originText, txt)
                          const label =
                            p.length > 1
                              ? `مقطع — ${p[0].surah} ${arNum(p[0].n)}-${arNum(p[p.length - 1].n)}`
                              : `في ${p[0].surah} — الآية ${arNum(p[0].n)}`
                          return (
                            <div
                              key={p[0].key + pi}
                              className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-2.5 dark:border-amber-600/30 dark:bg-amber-950/20"
                            >
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-extrabold text-amber-900 dark:text-amber-200">{label}</p>
                                <button
                                  type="button"
                                  onClick={() => jumpTo(p[0].page)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300/70 bg-white/80 px-2 py-1 text-[10px] font-bold text-amber-800 transition-all hover:shadow-sm dark:border-amber-600/40 dark:bg-black/25 dark:text-amber-300"
                                  title={`اذهب إلى صفحة ${p[0].page}`}
                                >
                                  <MapPin className="h-3 w-3" />
                                  ص {arNum(p[0].page)}
                                </button>
                              </div>
                              <p className="font-quran text-right text-lg leading-[2.1] text-foreground">
                                {words.map((wd, wi) => (
                                  <span
                                    key={wi}
                                    className={cn(
                                      wd.diff &&
                                        "rounded bg-amber-200/80 px-0.5 underline decoration-amber-500 decoration-wavy underline-offset-4 dark:bg-amber-800/50"
                                    )}
                                  >
                                    {wd.w}{" "}
                                  </span>
                                ))}
                              </p>
                              {continuationOf(p, g.ctx)}
                            </div>
                          )
                        })}
                      </div>
                    )
                  }

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
                                      "rounded bg-amber-200/80 px-0.5 underline decoration-amber-500 decoration-wavy underline-offset-4 dark:bg-amber-800/50"
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

      {/* بطاقة الآية: تفسير + أسباب نزول + كلمات صعبة */}
      <Dialog open={!!cardKey} onOpenChange={(o) => !o && setCardKey(null)}>
        <DialogContent className="max-h-[88vh] sm:max-w-2xl" dir="rtl">
          {(() => {
            const ayah = data.ayahs.find((a) => a.key === cardKey)
            if (!ayah) return null
            const words = ayah.text.split(/\s+/).filter(Boolean)
            const gCount = ayah.groups.length
            return (
              <>
                <DialogHeader className="text-right">
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <BookOpenText className="h-4 w-4" />
                    </span>
                    {surahName(ayah.s)} {arNum(ayah.n)}
                    <span className="text-xs font-medium text-muted-foreground">(ص {arNum(page)})</span>
                  </DialogTitle>
                  <DialogDescription className="text-right">
                    التفسير الميسّر وأسباب النزول — واضغط أي كلمة صعبة لتعليمها في قائمتك.
                  </DialogDescription>
                </DialogHeader>

                <div className="scroll-thin space-y-4 overflow-y-auto pl-1" dir="rtl">
                  {/* نص الآية */}
                  <blockquote className="rounded-xl border border-gold/40 bg-primary/5 p-3">
                    <p className="font-quran text-right text-xl leading-[2.2] text-foreground">{ayah.text}</p>
                  </blockquote>

                  {/* التفسير الميسّر */}
                  <div className="rounded-xl border border-border/70 bg-muted/40 p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-primary">
                      <BookOpenText className="h-4 w-4" />
                      التفسير الميسّر
                    </p>
                    {cardData?.loading ? (
                      <div className="space-y-2">
                        <div className="h-3 w-full animate-pulse rounded bg-muted" />
                        <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                      </div>
                    ) : cardData?.tafsir ? (
                      <p className="text-sm leading-7 text-foreground">{cardData.tafsir}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">لا يوجد تفسير مُسجّل لهذه الآية.</p>
                    )}
                  </div>

                  {/* أسباب النزول */}
                  {cardData && !cardData.loading && cardData.asbab && (
                    <div className="space-y-2.5 rounded-xl border border-teal-300/60 bg-teal-50/50 p-3 dark:border-teal-700/40 dark:bg-teal-950/25">
                      <p className="flex items-center gap-1.5 text-xs font-extrabold text-teal-800 dark:text-teal-300">
                        <Landmark className="h-4 w-4" />
                        أسباب النزول
                      </p>
                      {cardData.asbab.map((o, i) => (
                        <p key={i} className="text-sm leading-7 text-foreground/90">
                          {o}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* كلمات الآية — تعليم الصعبة */}
                  <div className="rounded-xl border border-border/70 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-muted-foreground">
                      <Tag className="h-4 w-4" />
                      كلمة صعبة؟ اضغطها لتضيفها لقائمتك
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {words.map((w, wi) => {
                        const hard = addedHard.has(`${ayah.key}:${w}`)
                        return (
                          <button
                            key={wi}
                            type="button"
                            disabled={hard}
                            onClick={() => markWord(ayah.key, w, ayah.s, ayah.n, page)}
                            className={cn(
                              "font-quran rounded-md border px-2 py-1 text-sm transition-all",
                              hard
                                ? "border-red-300/70 bg-red-50 text-red-600 line-through dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-400"
                                : "border-border/70 bg-background hover:border-red-400/60 hover:text-red-600 dark:hover:border-red-500/40",
                            )}
                            title={hard ? "معلّمة كصعبة" : "علّمها كصعبة"}
                          >
                            {w}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* أزرار */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      onClick={() => audio.playAyah({ key: ayah.key, s: ayah.s, n: ayah.n })}
                    >
                      {audio.playingKey === ayah.key ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5" />}
                      استمع للآية
                    </Button>
                    {gCount > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        onClick={() => {
                          setCardKey(null)
                          setFocusKey(ayah.key)
                        }}
                      >
                        <Scale className="h-3.5 w-3.5" />
                        متشابهاتها ({arNum(gCount)})
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
