"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ProgressRing } from "./progress-ring"
import { fireConfetti } from "@/hooks/use-app"
import { getPagePayload, getNextAyahText } from "@/lib/mushaf-data"
import { SURAHS, pageToJuz, pagesLabel, TOTAL_PAGES } from "@/lib/quran"
import { gradeTasmee, normalizeWord, VERDICT_CLASS, type TasmeeResult, type AlignOp } from "@/lib/tasmee"
import type { AppState } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import {
  GraduationCap,
  PenLine,
  Tag,
  Trash2,
  MapPin,
  Sparkles,
  Check,
  X,
  RefreshCw,
  Loader2,
  ListChecks,
  Star,
  Target,
  ChevronLeft,
  Eye,
  BookOpen,
  AlertTriangle,
  Layers,
} from "lucide-react"

// ==================== أنواع ====================

interface ViewProps {
  state: AppState
  load: () => Promise<void>
  action: (url: string, body: unknown) => Promise<Record<string, unknown>>
  /** الانتقال إلى صفحة في المصحف */
  openMushaf: (page: number, label: string) => void
}

type CardKind = "next" | "surah" | "complete"

interface QuizCard {
  kind: CardKind
  key: string
  s: number
  n: number
  page: number
  text: string
  surah: string
  // لبطاقة «من أي سورة؟»
  options?: string[]
  correctOption?: string
  // لبطاقتي «ما بعدها؟» و«أكملها»
  answerText?: string
  answerAt?: string
  headText?: string // الجزء الظاهر من الآية (للإكمال)
}

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
function arNum(n: number): string {
  return String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("")
}

const SESSION_SIZE = 10

// ==================== توليد البطاقات ====================

/** اختيار صفحة مرجّح: الضعيفة أحق بالتدريب */
function pickWeightedPage(strengths: number[]): number | null {
  const pages: number[] = []
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const st = strengths[p - 1]
    if (st < 0) continue
    const weight = st <= 2 ? 3 : 1
    for (let w = 0; w < weight; w++) pages.push(p)
  }
  if (pages.length === 0) return null
  return pages[Math.floor(Math.random() * pages.length)]
}

/** خيارات خاطئة ذكية لبطاقة «من أي سورة؟» — نظائر المتشابهات أولاً */
function wrongSurahOptions(card: { s: number; key: string; page: number }, need: number): string[] {
  const payload = getPagePayload(card.page)
  const names = new Set<string>()
  if (payload) {
    for (const g of payload.mutashabihat) {
      if (!g.items.some((it) => it.key === card.key)) continue
      for (const it of g.items) {
        if (it.s !== card.s) names.add(it.surah)
      }
    }
  }
  // استكمال عشوائي من سور قريبة (نفس الجزء غالباً)
  const juz = pageToJuz(card.page)
  const pool = SURAHS.filter((x) => x.n !== card.s && !names.has(x.name))
  const near = pool.filter((x) => Math.abs(pageToJuz(x.page) - juz) <= 2)
  const rest = near.length >= need ? near : pool
  while (names.size < need && rest.length > 0) {
    const i = Math.floor(Math.random() * rest.length)
    names.add(rest[i].name)
    rest.splice(i, 1)
  }
  return [...names].slice(0, need)
}

function buildCard(strengths: number[], avoidKeys: Set<string>): QuizCard | null {
  for (let attempt = 0; attempt < 12; attempt++) {
    const page = pickWeightedPage(strengths)
    if (!page) return null
    const payload = getPagePayload(page)
    if (!payload || payload.ayahs.length === 0) continue
    const ayah = payload.ayahs[Math.floor(Math.random() * payload.ayahs.length)]
    if (!ayah || avoidKeys.has(ayah.key)) continue
    const kinds: CardKind[] = ["next", "surah", "complete"]
    const kind = kinds[Math.floor(Math.random() * kinds.length)]

    if (kind === "next") {
      const answer = getNextAyahText(ayah.key)
      if (!answer) continue
      const [as, an] = ayah.key.split(":").map(Number)
      const nextKey = getNextAyahText(`${as}:${an + 1}`) ? `${as}:${an + 1}` : `${as + 1}:1`
      const np = getPagePayload(page) // نفس الصفحة غالباً؛ الموقع الدقيق من الآية التالية عبر نفس الصفحة أو التالية
      void np
      return {
        kind,
        key: ayah.key,
        s: ayah.s,
        n: ayah.n,
        page,
        text: ayah.text,
        surah: SURAHS[ayah.s - 1]?.name ?? "",
        answerText: answer,
        answerAt: nextKey,
      }
    }

    if (kind === "complete") {
      const words = ayah.text.split(/\s+/).filter(Boolean)
      if (words.length < 4) continue // قصيرة جداً على الإكمال
      const hideCount = Math.min(Math.ceil(words.length / 2), 6)
      const headText = words.slice(0, words.length - hideCount).join(" ")
      return {
        kind,
        key: ayah.key,
        s: ayah.s,
        n: ayah.n,
        page,
        text: ayah.text,
        surah: SURAHS[ayah.s - 1]?.name ?? "",
        headText,
        answerText: words.slice(words.length - hideCount).join(" "),
        answerAt: ayah.key,
      }
    }

    // بطاقة السور
    const correctName = SURAHS[ayah.s - 1]?.name ?? ""
    if (!correctName) continue
    const wrongs = wrongSurahOptions({ s: ayah.s, key: ayah.key, page }, 3)
    if (wrongs.length < 3) continue
    const options = [correctName, ...wrongs]
    // خلط
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[options[i], options[j]] = [options[j], options[i]]
    }
    return {
      kind,
      key: ayah.key,
      s: ayah.s,
      n: ayah.n,
      page,
      text: ayah.text,
      surah: correctName,
      options,
      correctOption: correctName,
    }
  }
  return null
}

function buildCards(strengths: number[], count: number): QuizCard[] {
  const out: QuizCard[] = []
  const used = new Set<string>()
  let guard = 0
  while (out.length < count && guard < count * 6) {
    guard++
    const c = buildCard(strengths, used)
    if (!c) break
    used.add(c.key)
    out.push(c)
  }
  return out
}

// ==================== ربط كلمات النتيجة بآياتها ====================

interface AyahSpan {
  key: string
  s: number
  n: number
  start: number // فهرس أول كلمة
  len: number
}

function ayahSpansOf(page: number): { spans: AyahSpan[]; ayahByKey: Map<string, { s: number; n: number; text: string; surah: string }> } {
  const payload = getPagePayload(page)
  const spans: AyahSpan[] = []
  const map = new Map<string, { s: number; n: number; text: string; surah: string }>()
  if (!payload) return { spans, ayahByKey: map }
  let acc = 0
  for (const a of payload.ayahs) {
    const len = a.text.split(/\s+/).filter(Boolean).length
    spans.push({ key: a.key, s: a.s, n: a.n, start: acc, len })
    map.set(a.key, { s: a.s, n: a.n, text: a.text, surah: SURAHS[a.s - 1]?.name ?? "" })
    acc += len
  }
  return { spans, ayahByKey: map }
}

// ==================== المكوّن ====================

export function TestView({ state, load, action, openMushaf }: ViewProps) {
  const { toast } = useToast()
  const [tab, setTab] = useState<"cards" | "tasmee" | "hard">("cards")

  // ---- جلسة البطاقات ----
  const [cards, setCards] = useState<QuizCard[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [marks, setMarks] = useState<boolean[]>([])
  const [finishing, setFinishing] = useState(false)
  const [done, setDone] = useState<{ score: number; correct: number } | null>(null)

  const memorizedCount = state.memorized.total

  const startSession = () => {
    if (memorizedCount === 0) {
      toast({
        title: "لا صفحات محفوظة بعد",
        description: "سجّل صفحاتك المحفوظة من تبويب «خطتي» أولاً ثم اختبر نفسك",
      })
      return
    }
    const built = buildCards(state.memorized.strengths, SESSION_SIZE)
    if (built.length === 0) {
      toast({ title: "تعذر توليد البطاقات", description: "جرّب مرة أخرى بعد قليل", variant: "destructive" })
      return
    }
    setCards(built)
    setIdx(0)
    setRevealed(false)
    setPicked(null)
    setMarks([])
    setDone(null)
  }

  const current = cards && idx < cards.length ? cards[idx] : null
  const isLast = cards ? idx >= cards.length - 1 : false

  /** تسجيل إجابة البطاقة الحالية ثم التقديم */
  const advance = (correct: boolean) => {
    if (!cards) return
    const nextMarks = [...marks, correct]
    setMarks(nextMarks)
    setRevealed(false)
    setPicked(null)
    if (idx + 1 >= cards.length) {
      finishSession(nextMarks)
    } else {
      setIdx(idx + 1)
    }
  }

  const finishSession = async (nextMarks: boolean[]) => {
    const total = nextMarks.length
    const correct = nextMarks.filter(Boolean).length
    const score = total > 0 ? Math.round((100 * correct) / total) : 0
    setFinishing(true)
    try {
      await action("/api/quiz", { kind: "cards", score, correct, total, detail: `بطاقات ×${total}` })
      setDone({ score, correct })
      if (score === 100) fireConfetti()
      toast({
        title: score === 100 ? "تقبل الله! درجة كاملة" : "انتهت الجلسة",
        description: `أجبت ${arNum(correct)} من ${arNum(total)} — ${arNum(score)}٪`,
      })
      await load()
    } catch {
      toast({ title: "تعذر تسجيل الجلسة", variant: "destructive" })
    } finally {
      setFinishing(false)
    }
  }

  // ---- التسميع ----
  const [source, setSource] = useState<"wird" | "weak" | "pick">("wird")
  const [pickPage, setPickPage] = useState<number | null>(null)
  const [tasmeeInput, setTasmeeInput] = useState("")
  const [result, setResult] = useState<TasmeeResult | null>(null)
  const [savingHard, setSavingHard] = useState(false)

  const tasmeePage = useMemo<number | null>(() => {
    if (memorizedCount === 0) return null
    if (source === "pick") return pickPage
    if (source === "wird") {
      const pending = state.plan?.tasks.filter((t) => t.status === "pending") ?? []
      if (pending.length > 0) {
        const t = pending[0]
        const pages: number[] = []
        for (let p = t.pageFrom; p <= t.pageTo; p++) pages.push(p)
        return pages[Math.floor(Math.random() * pages.length)] ?? null
      }
      return null
    }
    // صفحة ضعيفة: الأعلى خطورة، وإلا أول محفوظة
    if (state.attention.length > 0) return state.attention[0].page
    const strengths = state.memorized.strengths
    for (let p = 1; p <= TOTAL_PAGES; p++) if (strengths[p - 1] >= 0) return p
    return null
  }, [source, pickPage, memorizedCount, state.plan, state.attention, state.memorized.strengths])

  const expectedText = useMemo(() => {
    if (!tasmeePage) return ""
    const payload = getPagePayload(tasmeePage)
    return payload ? payload.ayahs.map((a) => a.text).join(" ") : ""
  }, [tasmeePage])

  // إعادة الجلسة عند تغيير المصدر
  useEffect(() => {
    setTasmeeInput("")
    setResult(null)
  }, [source, pickPage])

  const payloadOfTasmee = tasmeePage ? getPagePayload(tasmeePage) : null
  const spansInfo = useMemo(() => (tasmeePage ? ayahSpansOf(tasmeePage) : null), [tasmeePage])

  const correctTasmee = () => {
    if (!expectedText || !tasmeeInput.trim()) {
      toast({ title: "اكتب شيئاً أولاً", description: "سمّع ما تحفظه من هذه الصفحة ثم صحّح" })
      return
    }
    const r = gradeTasmee(expectedText, tasmeeInput)
    setResult(r)
    return r
  }

  const logTasmee = async (r: TasmeeResult) => {
    try {
      await action("/api/quiz", {
        kind: "tasmee",
        score: r.score,
        correct: r.counts.ok,
        total: r.expectedCount,
        detail: tasmeePage ? `تسميع صفحة ${tasmeePage}` : "تسميع",
      })
      if (r.score === 100) fireConfetti()
      toast({
        title: r.score >= 85 ? "ما شاء الله! تسميع متقن" : "سُجّل التسميع",
        description: `الدرجة ${arNum(r.score)}٪ — ${arNum(r.counts.ok)} صحيحة من ${arNum(r.expectedCount)}`,
      })
      await load()
    } catch {
      toast({ title: "تعذر تسجيل التسميع", variant: "destructive" })
    }
  }

  const onCorrect = () => {
    const r = correctTasmee()
    if (r) void logTasmee(r)
  }

  /** إضافة كل الكلمات الخاطئة/الساقطة للقائمة الصعبة */
  const addMistakesToHard = async () => {
    if (!result || !spansInfo || !tasmeePage) return
    setSavingHard(true)
    let added = 0
    let expIdx = 0
    const seen = new Set<string>()
    for (const op of result.ops) {
      if (op.type === "extra") continue
      const span = spansInfo.spans.find((sp) => expIdx >= sp.start && expIdx < sp.start + sp.len)
      expIdx++
      if (!span) continue
      if (op.type === "wrong" || op.type === "missing") {
        const word = op.expected ?? ""
        if (!word || seen.has(`${span.key}:${word}`)) continue
        seen.add(`${span.key}:${word}`)
        try {
          await action("/api/difficult", {
            action: "add",
            key: span.key,
            word,
            surah: span.s,
            ayah: span.n,
            page: tasmeePage,
          })
          added++
        } catch {
          /* نتابع البقية */
        }
      }
    }
    setSavingHard(false)
    if (added > 0) {
      toast({ title: "أُضيفت للقائمة الصعبة", description: `${arNum(added)} كلمة ستراها في «قائمتي الصعبة»` })
      await load()
    } else {
      toast({ title: "لا كلمات خاطئة لإضافتها" })
    }
  }

  // ---- القائمة الصعبة ----
  const difficult = state.tools?.difficult ?? []
  const [selectedHard, setSelectedHard] = useState<number | null>(null)
  const [removing, setRemoving] = useState(false)

  const removeHard = async (id: number) => {
    setRemoving(true)
    try {
      await action("/api/difficult", { action: "remove", id })
      await load()
    } catch {
      toast({ title: "تعذر الحذف", variant: "destructive" })
    } finally {
      setRemoving(false)
    }
  }

  // الآية المختارة في القائمة الصعبة
  const hardSelected = useMemo(() => {
    if (selectedHard == null) return null
    const d = difficult.find((x) => x.id === selectedHard)
    if (!d) return null
    const payload = getPagePayload(d.page)
    const ayah = payload?.ayahs.find((a) => a.key === d.key) ?? null
    if (!ayah) return null
    const target = normalizeWord(d.word)
    const words = ayah.text.split(/\s+/).filter(Boolean)
    return { d, ayah, words, target }
  }, [selectedHard, difficult])

  // ==================== العرض ====================

  const quizStats = state.tools?.quiz

  return (
    <div className="space-y-5">
      {/* رأس القسم */}
      <Card className="overflow-hidden border-0 bg-gradient-to-bl from-teal-800 via-emerald-800 to-emerald-900 text-white glow-emerald">
        <CardContent className="pattern-islamic-light space-y-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-extrabold">
                <GraduationCap className="h-7 w-7" />
                اختبرني
              </h2>
              <p className="mt-1 text-xs text-white/75 sm:text-sm">
                بطاقات مراجعة وتسميع كتابي يصحّح حفظك كلمة كلمة — كما تسمّع لشيخك
              </p>
            </div>
            {quizStats && quizStats.totalSessions > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                  <Star className="h-3.5 w-3.5 text-amber-300" />
                  أفضل درجة {arNum(quizStats.bestScore)}٪
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                  <Target className="h-3.5 w-3.5 text-amber-300" />
                  متوسط {arNum(quizStats.avgScore)}٪
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                  <ListChecks className="h-3.5 w-3.5 text-amber-300" />
                  {arNum(quizStats.totalSessions)} جلسة
                </span>
              </div>
            )}
          </div>

          {/* مفاتيح الأوضاع */}
          <div className="flex items-center gap-1 rounded-xl bg-black/25 p-1" role="group" aria-label="أوضاع الاختبار">
            {(
              [
                ["cards", Layers, "بطاقات"],
                ["tasmee", PenLine, "تسميع كتابي"],
                ["hard", Tag, `قائمتي الصعبة${difficult.length > 0 ? ` (${arNum(difficult.length)})` : ""}`],
              ] as const
            ).map(([t, Icon, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-extrabold transition-all sm:text-sm",
                  tab === t ? "bg-white text-emerald-900 shadow" : "text-white/80 hover:bg-white/15",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ============ وضع البطاقات ============ */}
      {tab === "cards" && (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-6">
            {memorizedCount === 0 ? (
              <div className="space-y-3 py-8 text-center">
                <p className="text-3xl">📖</p>
                <p className="text-sm font-bold">لا صفحات محفوظة بعد</p>
                <p className="mx-auto max-w-sm text-xs leading-6 text-muted-foreground">
                  سجّل صفحاتك المحفوظة من تبويب «خطتي» (تحرير الصفحات المحفوظة) ثم عُد هنا لاختبار نفسك ببطاقات
                  «ما بعدها؟» و«من أي سورة؟» و«أكمل الآية».
                </p>
              </div>
            ) : !cards ? (
              <div className="space-y-4 py-6 text-center">
                <p className="text-sm leading-7 text-muted-foreground">
                  جلسة من {arNum(SESSION_SIZE)} بطاقات: <span className="font-bold text-foreground">ما بعد الآية؟</span> —{" "}
                  <span className="font-bold text-foreground">من أي سورة؟</span> —{" "}
                  <span className="font-bold text-foreground">أكمل الآية</span>
                  <br />
                  البطاقات تُسحب من صفحاتك المحفوظة، والضعيفة أولى بالتدريب.
                </p>
                <Button size="lg" className="h-11 gap-2" onClick={startSession}>
                  <Sparkles className="h-4 w-4" />
                  ابدأ الجلسة
                </Button>
              </div>
            ) : done ? (
              /* نتيجة الجلسة */
              <div className="space-y-4 text-center">
                <ProgressRing value={done.correct} max={marks.length} size={120} label={`${done.score}٪`} sublabel="درجة الجلسة" />
                <p className="text-sm font-bold">
                  {done.score === 100
                    ? "درجة كاملة — تقبل الله!"
                    : done.score >= 70
                      ? "أحسنت — واصل التدريب"
                      : "لا بأس — التكرار يعلّم الحفّاظ"}
                </p>
                {marks.some((m) => !m) && (
                  <div className="space-y-2 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-right dark:border-amber-600/30 dark:bg-amber-950/20" dir="rtl">
                    <p className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="ml-1 inline h-3.5 w-3.5" />
                      راجع هذه الآيات:
                    </p>
                    {cards.map((c, i) =>
                      marks[i] ? null : (
                        <div key={c.key + i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/50 bg-white/70 p-2 dark:border-amber-600/30 dark:bg-black/25">
                          <p className="text-xs font-bold">
                            {c.surah} {arNum(c.n)} <span className="text-muted-foreground">— ص {arNum(c.page)}</span>
                          </p>
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => openMushaf(c.page, `مراجعة ${c.surah} ${arNum(c.n)}`)}>
                            <MapPin className="h-3 w-3" />
                            افتح في المصحف
                          </Button>
                        </div>
                      ),
                    )}
                  </div>
                )}
                <Button variant="outline" className="h-10 gap-2" onClick={startSession}>
                  <RefreshCw className="h-4 w-4" />
                  جلسة جديدة
                </Button>
              </div>
            ) : current ? (
              /* بطاقة جارية */
              <div className="space-y-4" dir="rtl">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="gap-1 border text-[10px]">
                    بطاقة {arNum(idx + 1)} من {arNum(cards.length)}
                  </Badge>
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    {current.kind === "next" ? "ما بعد الآية؟" : current.kind === "surah" ? "من أي سورة؟" : "أكمل الآية"}
                  </Badge>
                </div>

                {/* نص الآية */}
                <blockquote className="rounded-xl border border-gold/40 bg-primary/5 p-4 text-center">
                  {current.kind === "complete" ? (
                    <p className="font-quran text-xl leading-[2.2] text-foreground sm:text-2xl">
                      {current.headText}{" "}
                      <span className="text-muted-foreground">… {revealed ? current.answerText : "؟"}</span>
                    </p>
                  ) : (
                    <p className="font-quran text-xl leading-[2.2] text-foreground sm:text-2xl">{current.text}</p>
                  )}
                  <p className="mt-2 text-[11px] font-bold text-muted-foreground">
                    {current.kind === "next"
                      ? "ما الآية التي تليها؟"
                      : current.kind === "complete"
                        ? "أكمل الآية من حفظك"
                        : "من أي سورة هذه الآية؟"}
                  </p>
                </blockquote>

                {/* أزرار حسب النوع */}
                {current.kind === "surah" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {current.options?.map((opt) => {
                      const isCorrect = revealed && opt === current.correctOption
                      const isWrongPick = revealed && opt === picked && opt !== current.correctOption
                      return (
                        <Button
                          key={opt}
                          variant="outline"
                          disabled={revealed}
                          className={cn(
                            "h-11 text-sm font-extrabold",
                            isCorrect && "border-emerald-500 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
                            isWrongPick && "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
                          )}
                          onClick={() => {
                            setPicked(opt)
                            setRevealed(true)
                            advance(opt === current.correctOption)
                          }}
                        >
                          {isCorrect && <Check className="h-4 w-4" />}
                          {isWrongPick && <X className="h-4 w-4" />}
                          {opt}
                        </Button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {!revealed ? (
                      <Button className="h-11 w-full gap-2 text-sm font-extrabold" onClick={() => setRevealed(true)}>
                        <Eye className="h-4 w-4" />
                        أظهر الإجابة
                      </Button>
                    ) : (
                      <>
                        <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/70 p-3 dark:border-emerald-700/40 dark:bg-emerald-950/25">
                          <p className="font-quran text-lg leading-[2.1] text-foreground">
                            {current.kind === "complete" ? current.answerText : current.answerText}
                          </p>
                          <p className="mt-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                            {current.kind === "next" ? "الآية التالية" : "تكملة الآية"} — {current.answerAt}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            className="h-11 gap-2 bg-emerald-600 text-sm font-extrabold hover:bg-emerald-700"
                            disabled={finishing}
                            onClick={() => advance(true)}
                          >
                            <Check className="h-4 w-4" />
                            أصبت
                          </Button>
                          <Button
                            variant="outline"
                            className="h-11 gap-2 border-red-300 text-sm font-extrabold text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-950/40"
                            disabled={finishing}
                            onClick={() => advance(false)}
                          >
                            <X className="h-4 w-4" />
                            أخطأت
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {finishing && (
                  <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    نحفظ نتيجتك…
                  </p>
                )}

                {!isLast && revealed && current.kind !== "surah" && null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* ============ وضع التسميع ============ */}
      {tab === "tasmee" && (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-6" dir="rtl">
            {memorizedCount === 0 ? (
              <p className="py-6 text-center text-sm leading-7 text-muted-foreground">
                سجّل صفحاتك المحفوظة أولاً من تبويب «خطتي» ثم عُد للتسميع.
              </p>
            ) : (
              <>
                {/* اختيار المصدر */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ["wird", "من ورد اليوم"],
                      ["weak", "صفحة ضعيفة"],
                      ["pick", "أختار صفحة"],
                    ] as const
                  ).map(([src, label]) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setSource(src)}
                      aria-pressed={source === src}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-extrabold transition-all",
                        source === src
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border/70 text-muted-foreground hover:border-primary/50 hover:text-primary",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                  {source === "pick" && (
                    <Select value={pickPage ? String(pickPage) : undefined} onValueChange={(v) => setPickPage(Number(v))}>
                      <SelectTrigger className="h-9 w-44 text-xs" aria-label="اختيار صفحة التسميع">
                        <SelectValue placeholder="اختر صفحة محفوظة" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1)
                          .filter((p) => state.memorized.strengths[p - 1] >= 0)
                          .map((p) => (
                            <SelectItem key={p} value={String(p)} className="text-xs">
                              صفحة {arNum(p)} — {pagesLabel(p, p)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {!tasmeePage || !expectedText ? (
                  <p className="py-6 text-center text-sm leading-7 text-muted-foreground">
                    {source === "wird"
                      ? "لا مهام مراجعة معلّقة اليوم — جرّب «صفحة ضعيفة» أو اختر صفحة بنفسك."
                      : source === "weak"
                        ? "لا صفحات تحتاج انتباهاً الآن — اختر صفحة بنفسك."
                        : "اختر صفحة محفوظة لتسمّعها."}
                  </p>
                ) : (
                  <>
                    {/* معلومات النطاق */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
                      <div>
                        <p className="text-sm font-extrabold">
                          سمّع صفحة {arNum(tasmeePage)}
                          <span className="text-muted-foreground"> — {payloadOfTasmee?.surahLabel ?? ""}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          الجزء {arNum(pageToJuz(tasmeePage))} • {pagesLabel(tasmeePage, tasmeePage)} — اكتب ما تحفظه
                          بلا تشكيل، والصحيح يفهم قصدك
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openMushaf(tasmeePage, "تسميع")}>
                        <BookOpen className="h-3.5 w-3.5" />
                        افتح في المصحف
                      </Button>
                    </div>

                    {/* مربع الكتابة */}
                    {!result && (
                      <div className="space-y-3">
                        <textarea
                          value={tasmeeInput}
                          onChange={(e) => setTasmeeInput(e.target.value)}
                          dir="rtl"
                          rows={6}
                          placeholder="اكتب آيات هذه الصفحة من حفظك… مثال: الحمد لله رب العالمين"
                          className="font-quran w-full rounded-xl border border-border/70 bg-background p-4 text-lg leading-[2.2] text-foreground shadow-inner outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60"
                          aria-label="مربع التسميع من الحفظ"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-muted-foreground">
                            {tasmeeInput.trim() ? `${arNum(tasmeeInput.trim().split(/\s+/).length)} كلمة` : "التسميع كتابة كما تقرأ على شيخك"}
                          </p>
                          <Button className="h-10 gap-2" onClick={onCorrect} disabled={!tasmeeInput.trim()}>
                            <PenLine className="h-4 w-4" />
                            صحّح تسميعي
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* النتيجة */}
                    {result && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-center gap-4">
                          <ProgressRing
                            value={result.score}
                            max={100}
                            size={110}
                            label={`${arNum(result.score)}٪`}
                            sublabel="درجة التسميع"
                          />
                          <div className="space-y-1.5 text-xs">
                            <p className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
                              <Check className="h-4 w-4" /> {arNum(result.counts.ok)} صحيحة
                            </p>
                            {result.counts.near > 0 && (
                              <p className="text-amber-700 dark:text-amber-300">{arNum(result.counts.near)} قريبة — راجعها</p>
                            )}
                            {result.counts.wrong > 0 && (
                              <p className="text-red-700 dark:text-red-400">{arNum(result.counts.wrong)} كلمة مكان أخرى</p>
                            )}
                            {result.counts.missing > 0 && (
                              <p className="text-red-500">{arNum(result.counts.missing)} ساقطة</p>
                            )}
                            {result.counts.extra > 0 && (
                              <p className="text-amber-600 dark:text-amber-400">{arNum(result.counts.extra)} زائدة</p>
                            )}
                          </div>
                        </div>

                        {/* السطر المصحّح */}
                        <div className="scroll-thin max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-border/70 bg-muted/40 p-3" dir="rtl">
                          {(() => {
                            let expIdx = 0
                            return result.ops.map((op: AlignOp, i: number) => {
                              let node: React.ReactNode = null
                              if (op.type === "ok") {
                                node = (
                                  <span key={i} className={cn("font-quran text-lg", VERDICT_CLASS.ok)}>
                                    {op.expected}{" "}
                                  </span>
                                )
                              } else if (op.type === "near") {
                                node = (
                                  <span key={i} className={cn("font-quran text-lg", VERDICT_CLASS.near)} title={`قريبة (${Math.round((op.sim ?? 0) * 100)}٪) — الصواب: ${op.expected}`}>
                                    {op.user}{" "}
                                    <sup className="text-[10px]">({op.expected})</sup>{" "}
                                  </span>
                                )
                              } else if (op.type === "wrong") {
                                node = (
                                  <span key={i} className="font-quran text-lg">
                                    <span className="text-red-700 dark:text-red-400">{op.user}</span>
                                    <sup className="text-[10px] text-emerald-700 dark:text-emerald-300"> الصواب: {op.expected}</sup>{" "}
                                  </span>
                                )
                              } else if (op.type === "missing") {
                                node = (
                                  <span key={i} className={cn("font-quran text-lg", VERDICT_CLASS.missing)} title="ساقطة من التسميع">
                                    [{op.expected}]{" "}
                                  </span>
                                )
                              } else {
                                node = (
                                  <span key={i} className={cn("font-quran text-lg", VERDICT_CLASS.extra)} title="كلمة زائدة ليست في الآية">
                                    {op.user}{" "}
                                  </span>
                                )
                              }
                              if (op.type !== "extra") expIdx++
                              return node
                            })
                          })()}
                        </div>

                        {/* أزرار ما بعد التصحيح */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-2">
                            {(result.counts.wrong > 0 || result.counts.missing > 0 || result.counts.near > 0) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-9 gap-1.5"
                                onClick={addMistakesToHard}
                                disabled={savingHard}
                              >
                                {savingHard ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
                                أضف الخاطئة للقائمة الصعبة
                              </Button>
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="h-9 gap-1.5"
                            onClick={() => {
                              setResult(null)
                              setTasmeeInput("")
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            تسميع جديد
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============ القائمة الصعبة ============ */}
      {tab === "hard" && (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-6" dir="rtl">
            {difficult.length === 0 ? (
              <div className="space-y-3 py-8 text-center">
                <p className="text-3xl">🏷️</p>
                <p className="text-sm font-bold">قائمتك الصعبة فارغة</p>
                <p className="mx-auto max-w-md text-xs leading-6 text-muted-foreground">
                  أثناء القراءة: اضغط الآية في المصحف ثم اضغط الكلمة الصعبة. أو بعد أي تسميع: زر «أضف الخاطئة
                  للقائمة الصعبة». ستجدها هنا لمراجعتها.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs leading-6 text-muted-foreground">
                  <Tag className="ml-1 inline h-3.5 w-3.5" />
                  اضغط كلمة لرؤية آيتها كاملة — الكلمة صعبة عليك فثبّتها بالمراجعة.
                </p>
                <div className="scroll-thin flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                  {difficult.map((d) => {
                    const surahName = SURAHS[d.surah - 1]?.name ?? ""
                    return (
                      <div key={d.id} className="inline-flex items-center gap-1 rounded-lg border border-red-300/60 bg-red-50/70 px-2 py-1 dark:border-red-500/30 dark:bg-red-950/25">
                        <button
                          type="button"
                          onClick={() => setSelectedHard(selectedHard === d.id ? null : d.id)}
                          className={cn(
                            "font-quran rounded px-1 text-sm font-bold text-red-700 hover:bg-red-100/70 dark:text-red-300 dark:hover:bg-red-900/40",
                            selectedHard === d.id && "bg-red-200/80 dark:bg-red-900/60",
                          )}
                          title={`${surahName} ${arNum(d.ayah)} — ص ${arNum(d.page)}`}
                        >
                          {d.word}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeHard(d.id)}
                          disabled={removing}
                          className="text-red-400 transition-colors hover:text-red-600"
                          aria-label={`حذف كلمة ${d.word}`}
                          title="حذف من القائمة"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* آية الكلمة المختارة */}
                {hardSelected && (
                  <div className="space-y-2.5 rounded-xl border border-red-300/60 bg-red-50/50 p-3 dark:border-red-500/30 dark:bg-red-950/20">
                    <p className="text-xs font-extrabold text-red-800 dark:text-red-200">
                      {SURAHS[hardSelected.d.surah - 1]?.name} {arNum(hardSelected.d.ayah)} — ص {arNum(hardSelected.d.page)}
                    </p>
                    <p className="font-quran text-right text-lg leading-[2.2] text-foreground">
                      {hardSelected.words.map((w, wi) => {
                        const isTarget = normalizeWord(w) === hardSelected.target
                        return (
                          <span
                            key={wi}
                            className={cn(
                              isTarget &&
                                "rounded bg-red-200/80 px-0.5 font-bold text-red-700 underline decoration-red-500 decoration-wavy underline-offset-4 dark:bg-red-800/50 dark:text-red-200",
                            )}
                          >
                            {w}{" "}
                          </span>
                        )
                      })}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      onClick={() => openMushaf(hardSelected.d.page, `${SURAHS[hardSelected.d.surah - 1]?.name} ${arNum(hardSelected.d.ayah)}`)}
                    >
                      <MapPin className="h-3 w-3" />
                      افتح في المصحف
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* آخر الجلسات */}
      {quizStats && quizStats.recent.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="space-y-2.5 p-4" dir="rtl">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-muted-foreground">
              <ChevronLeft className="h-3.5 w-3.5" />
              آخر جلساتك
            </p>
            <div className="scroll-thin flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {quizStats.recent.map((q) => (
                <Badge
                  key={q.id}
                  variant={q.score >= 85 ? "default" : "secondary"}
                  className={cn(
                    "gap-1 border text-[10px]",
                    q.score >= 85
                      ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-600/30 dark:bg-amber-950/30 dark:text-amber-300",
                  )}
                >
                  {q.kind === "cards" ? "بطاقات" : "تسميع"} {arNum(q.score)}٪
                  <span className="text-muted-foreground">
                    ({arNum(q.correct)}/{arNum(q.total)})
                  </span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
