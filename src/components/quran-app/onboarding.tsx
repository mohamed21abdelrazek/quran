"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { PageGrid } from "./page-grid"
import { Logo } from "./logo"
import { BASELINE_META, INTENSITY_META, type Intensity } from "@/lib/content"
import { formatDays, formatPages, pagesToRanges } from "@/lib/format"
import { juzPageRange } from "@/lib/quran"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import {
  BookOpen,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  Brain,
  Target,
  Wand2,
  HeartHandshake,
  ShieldCheck,
  Check,
} from "lucide-react"

const STEPS = ["مرحباً", "حفظك", "خطتك", "ابدأ"]

export function OnboardingView({ onComplete }: { onComplete: () => void }) {
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [rangeFrom, setRangeFrom] = useState("")
  const [rangeTo, setRangeTo] = useState("")
  const [baseline, setBaseline] = useState<"weak" | "medium" | "strong">("medium")
  const [capacity, setCapacity] = useState(3)
  const [unitSize, setUnitSize] = useState(1)
  const [intensity, setIntensity] = useState<Intensity>("balanced")
  const [autoAdjust, setAutoAdjust] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const totalSelected = selected.size
  // هدف عدم النسيان: كل الحفظ يُراجع كل 10 أيام
  const suggestedCapacity = totalSelected > 0 ? Math.ceil(totalSelected / 10) : 0
  const meetsTarget = capacity >= suggestedCapacity
  const firstPassDays = Math.ceil(totalSelected / capacity)
  const sliderMax = Math.max(10, suggestedCapacity, capacity)

  const togglePage = (page: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(page)) next.delete(page)
      else next.add(page)
      return next
    })
  }

  const toggleJuz = (juz: number) => {
    const { from, to } = juzPageRange(juz)
    const allIn = Array.from({ length: to - from + 1 }, (_, i) => from + i).every((p) => selected.has(p))
    setSelected((prev) => {
      const next = new Set(prev)
      for (let p = from; p <= to; p++) {
        if (allIn) next.delete(p)
        else next.add(p)
      }
      return next
    })
  }

  const addRange = () => {
    const from = parseInt(rangeFrom, 10)
    const to = parseInt(rangeTo, 10)
    if (!from || !to || from < 1 || to > 604 || from > to) {
      toast({ title: "مدى غير صالح", description: "أدخل أرقام صفحات صحيحة بين 1 و 604" })
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      for (let p = from; p <= to; p++) next.add(p)
      return next
    })
    setRangeFrom("")
    setRangeTo("")
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ranges: pagesToRanges([...selected]),
          baseline: BASELINE_META[baseline].strength,
          dailyCapacity: capacity,
          unitSize,
          intensity,
          autoAdjust,
        }),
      })
      if (!res.ok) throw new Error()
      toast({ title: "تقبل الله منك!", description: "جهزنا لك خطة اليوم — انطلق" })
      onComplete()
    } catch {
      toast({ title: "حدث خطأ", description: "تعذر إنشاء الخطة، حاول مرة أخرى" })
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background pattern-islamic">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:py-12">
        {/* الترويسة */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground glow-emerald">
            <Logo className="h-10 w-10" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">وِردي</h1>
          <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
            رفيقك الذكي في مراجعة القرآن الكريم — خطة تتكيف مع قدرتك كل يوم، فلا تنسى القديم أبداً
          </p>
        </div>

        {/* مؤشر الخطوات */}
        <div className="mb-8 flex items-center justify-center gap-2" aria-label={`الخطوة ${step + 1} من 4`}>
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors",
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : i < step
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
                <span className="hidden sm:inline">{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn("h-0.5 w-4 rounded-full sm:w-8", i < step ? "bg-primary/40" : "bg-muted")} />}
            </div>
          ))}
        </div>

        {/* الخطوة 0: الترحيب */}
        {step === 0 && (
          <Card className="animate-in fade-in-50 border-border/60 shadow-sm">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="space-y-3">
                <h2 className="text-xl font-bold sm:text-2xl">أهلاً بك في رحلة لا تُنسى</h2>
                <p className="leading-7 text-muted-foreground">
                  سيساعدك وِردي على مراجعة حفظك بطريقة علمية (التكرار المتباعد)، بمتابعة يومية تخبرك: ماذا تراجع اليوم؟ وماذا
                  راجعتَ؟ وإذا انشغلت يوماً — يعيد ترتيب خطتك تلقائياً بما يناسب قدرتك.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: Brain, title: "خطة تتكيف معك", desc: "تراقب أداءك وتعدل السعة يومياً" },
                  { icon: CalendarCheck2, title: "ورد يومي واضح", desc: "تعرف بالضبط ماذا تراجع كل يوم" },
                  { icon: HeartHandshake, title: "لا تنسى القديم", desc: "كل صفحة تعود إليك قبل أن تُنسى" },
                ].map((f) => (
                  <div key={f.title} className="rounded-xl border border-border/60 bg-secondary/40 p-4">
                    <f.icon className="mb-2 h-6 w-6 text-primary" />
                    <p className="text-sm font-bold">{f.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{f.desc}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">ما اسمك؟ (اختياري)</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اكتب اسمك ليخاطبك وِردي به"
                  maxLength={40}
                />
              </div>
              <Button size="lg" className="w-full text-base" onClick={() => setStep(1)}>
                <Sparkles className="h-5 w-5" />
                لنبدأ — حدد حفظك
              </Button>
            </CardContent>
          </Card>
        )}

        {/* الخطوة 1: الصفحات المحفوظة */}
        {step === 1 && (
          <Card className="animate-in fade-in-50 border-border/60 shadow-sm">
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="space-y-1">
                <h2 className="text-xl font-bold sm:text-2xl">ما الذي تحفظه من القرآن؟</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  حدد الصفحات التي حفظتها — ليست شرطاً أن تكون مرتبة! اختر أجزاءً كاملة أو صفحات متفرقة كما تحفظها فعلاً.
                </p>
              </div>

              {/* إضافة سريعة بمدى */}
              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/60 bg-secondary/30 p-3">
                <div className="space-y-1">
                  <Label htmlFor="from" className="text-xs">من صفحة</Label>
                  <Input
                    id="from"
                    inputMode="numeric"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    placeholder="1"
                    className="w-24 text-center"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="to" className="text-xs">إلى صفحة</Label>
                  <Input
                    id="to"
                    inputMode="numeric"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    placeholder="21"
                    className="w-24 text-center"
                  />
                </div>
                <Button type="button" variant="secondary" onClick={addRange}>
                  <BookOpen className="h-4 w-4" />
                  أضف المدى
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                  className="text-muted-foreground"
                >
                  مسح الكل
                </Button>
              </div>

              <PageGrid mode="select" selected={selected} onTogglePage={togglePage} onToggleJuz={toggleJuz} />

              <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="text-sm">
                  <span className="font-bold text-primary">{totalSelected}</span>
                  <span className="text-muted-foreground"> صفحة محفوظة</span>
                </div>
                {totalSelected > 0 && (
                  <Button size="sm" onClick={() => setStep(2)}>
                    متابعة
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  <ArrowRight className="h-4 w-4" />
                  رجوع
                </Button>
                <p className="text-xs text-muted-foreground">نصيحة: اضغط على اسم الجزء لتحديده كاملاً</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* الخطوة 2: تفضيلات الخطة */}
        {step === 2 && (
          <Card className="animate-in fade-in-50 border-border/60 shadow-sm">
            <CardContent className="space-y-7 p-5 sm:p-8">
              <div className="space-y-1">
                <h2 className="text-xl font-bold sm:text-2xl">لنضبط خطتك على مقاسك</h2>
                <p className="text-sm text-muted-foreground">يمكنك تعديل كل هذا لاحقاً من الإعدادات في أي وقت.</p>
              </div>

              {/* قوة الحفظ */}
              <div className="space-y-3">
                <Label className="text-base font-bold">كيف تقيّم حفظك لهذه الصفحات؟</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(BASELINE_META) as ("weak" | "medium" | "strong")[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setBaseline(k)}
                      aria-pressed={baseline === k}
                      className={cn(
                        "rounded-xl border-2 p-4 text-right transition-all",
                        baseline === k
                          ? "border-primary bg-primary/10"
                          : "border-border/60 hover:border-primary/40 bg-card"
                      )}
                    >
                      <p className="text-sm font-bold">{BASELINE_META[k].label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{BASELINE_META[k].desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* السعة اليومية */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-bold">كم صفحة تستطيع مراجعتها يومياً؟</Label>
                  <Badge variant="secondary" className="text-sm font-extrabold tabular-nums">{capacity}</Badge>
                </div>
                <Slider
                  value={[Math.min(capacity, sliderMax)]}
                  min={1}
                  max={sliderMax}
                  step={1}
                  onValueChange={(v) => setCapacity(v[0])}
                  aria-label="عدد الصفحات اليومي"
                />
                <p className="text-xs text-muted-foreground">
                  {capacity <= 2 ? "بداية هادئة ومستدامة — أحب الأعمال أدومها وإن قل" : capacity <= 5 ? "وتيرة متوازنة تناسب معظم المراجعين" : "وتيرة حماسية — تأكد أنك قادر على المداومة"}
                </p>

                {totalSelected > 0 && (
                  <div
                    className={cn(
                      "space-y-2.5 rounded-xl border p-4 text-xs leading-6",
                      meetsTarget
                        ? "border-emerald-300/70 bg-emerald-50/70 text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-200/90"
                        : "border-amber-300/70 bg-amber-50/70 text-amber-900 dark:border-amber-600/40 dark:bg-amber-950/30 dark:text-amber-100/90"
                    )}
                  >
                    <p className="flex items-center gap-1.5 font-bold">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      دورة الأمان — كل حفظك كل 10 أيام
                    </p>
                    {meetsTarget ? (
                      <p>
                        حفظك {formatPages(totalSelected)} — بسعة {capacity} صفحة/يوم ستكمل دورة كاملة على كل حفظك خلال{" "}
                        <span className="font-bold">{formatDays(firstPassDays)}</span> فلن تنسى القديم بإذن الله.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        <p>
                          حفظك {formatPages(totalSelected)} — لمراجعته كاملاً كل 10 أيام ننصح بسعة{" "}
                          <span className="font-bold">{suggestedCapacity} صفحة/يوم</span>. بسعتك الحالية ستكون دورتك ≈{" "}
                          <span className="font-bold">{formatDays(firstPassDays)}</span> — وسيركز النظام دائماً على
                          الأضعف حتى لا يُنسى مهما كانت سعتك.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 gap-1.5"
                          onClick={() => setCapacity(suggestedCapacity)}
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          طبّق السعة الموصى بها ({suggestedCapacity})
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* حجم المهمة */}
              <div className="space-y-3">
                <Label className="text-base font-bold">حجم المهمة الواحدة في وردك</Label>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 5].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnitSize(u)}
                      aria-pressed={unitSize === u}
                      className={cn(
                        "rounded-full border-2 px-4 py-2 text-sm font-bold transition-all",
                        unitSize === u ? "border-primary bg-primary text-primary-foreground" : "border-border/60 hover:border-primary/40"
                      )}
                    >
                      {u === 1 ? "صفحة" : `${u} صفحات`}
                    </button>
                  ))}
                </div>
              </div>

              {/* الوتيرة */}
              <div className="space-y-3">
                <Label className="text-base font-bold">وتيرة المراجعة</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(INTENSITY_META) as Intensity[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setIntensity(k)}
                      aria-pressed={intensity === k}
                      className={cn(
                        "rounded-xl border-2 p-4 text-right transition-all",
                        intensity === k ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/40 bg-card"
                      )}
                    >
                      <p className="text-sm font-bold">{INTENSITY_META[k].name}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{INTENSITY_META[k].desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* التعديل التلقائي */}
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 p-4">
                <div className="max-w-[80%]">
                  <Label htmlFor="auto" className="text-sm font-bold">التعديل التلقائي اليومي</Label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    إذا أنجزت أقل من المطلوب يخفف النظام حمله تدريجياً لتناسب قدرتك، وإذا تأخرت صفحات يعيد توزيعها تلقائياً.
                  </p>
                </div>
                <Switch id="auto" checked={autoAdjust} onCheckedChange={setAutoAdjust} />
              </div>

              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowRight className="h-4 w-4" />
                  رجوع
                </Button>
                <Button onClick={() => setStep(3)}>
                  مراجعة الخطة
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* الخطوة 3: الملخص والانطلاق */}
        {step === 3 && (
          <Card className="animate-in fade-in-50 border-border/60 shadow-sm">
            <CardContent className="space-y-6 p-5 sm:p-8">
              <div className="space-y-1">
                <h2 className="text-xl font-bold sm:text-2xl">خطتك جاهزة للانطلاق</h2>
                <p className="text-sm text-muted-foreground">هذا ملخص ما سنبني عليه خطتك اليومية.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: BookOpen, label: "محفوظك", value: `${formatPages(totalSelected)} (${pagesToRanges([...selected]).length} نطاق)` },
                  { icon: Target, label: "السعة اليومية", value: `${capacity} صفحات يومياً` },
                  { icon: Brain, label: "التقييم الأولي", value: BASELINE_META[baseline].label },
                  { icon: Wand2, label: "الوتيرة", value: `${INTENSITY_META[intensity].name} — ${autoAdjust ? "بتعديل تلقائي" : "بثبات"}` },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4">
                    <item.icon className="h-6 w-6 shrink-0 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-bold">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm leading-7">
                <p className="font-bold text-foreground">توقعنا لرحلتك:</p>
                <p className="text-muted-foreground">
                  ستراجع <span className="font-bold text-foreground">{capacity}</span> صفحات يومياً{" "}
                  {totalSelected > 0 && meetsTarget ? (
                    <>
                      — وبذلك تكمل دورة كاملة على كل حفظك ({formatPages(totalSelected)}) كل{" "}
                      <span className="font-bold text-foreground">{formatDays(Math.ceil(totalSelected / capacity))}</span>{" "}
                      فلا يُنسى القديم أبداً بإذن الله.
                    </>
                  ) : totalSelected > 0 ? (
                    <>
                      — ودورتك الكاملة على كل حفظك ستكون ≈{" "}
                      <span className="font-bold text-foreground">{formatDays(Math.ceil(totalSelected / capacity))}</span>.
                      لا تقلق: النظام يبدأ دائماً بالصفحات الأعلى خطورة على النسيان، فالضعيف لا يفلت، ويمكنك رفع سعتك في أي
                      وقت من الإعدادات لتقصير الدورة.
                    </>
                  ) : (
                    <>— ويكيف النظام خطتك يومياً بما يناسب قدرتك.</>
                  )}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  <ArrowRight className="h-4 w-4" />
                  رجوع
                </Button>
                <Button size="lg" className="text-base" onClick={submit} disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                      جارٍ تجهيز خطتك...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      ابدأ رحلتي اليوم
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="mt-auto border-t border-border/60 bg-card/60 py-4 text-center text-xs text-muted-foreground">
        <p className="font-quran text-sm text-foreground/70">وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ</p>
        <p className="mt-1">وِردي — رفيقك في مراجعة كتاب الله</p>
      </footer>
    </div>
  )
}
