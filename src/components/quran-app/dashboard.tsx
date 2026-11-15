"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ProgressRing } from "./progress-ring"
import { fireConfetti } from "@/hooks/use-app"
import type { AppState, TaskDTO } from "@/lib/types"
import type { Quality } from "@/lib/content"
import { dateAr, formatPages, weekdayShortAr } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Flame,
  Trophy,
  CheckCheck,
  Check,
  AlertTriangle,
  Clock,
  BookOpen,
  Sparkles,
  PartyPopper,
  CalendarDays,
  Hourglass,
  Star,
} from "lucide-react"

interface ViewProps {
  state: AppState
  load: () => Promise<void>
  action: (url: string, body: unknown) => Promise<Record<string, unknown>>
}

export function DashboardView({ state, load, action }: ViewProps) {
  const { toast } = useToast()
  const [busyTask, setBusyTask] = useState<number | null>(null)

  const plan = state.plan
  const tasks = plan?.tasks ?? []
  const pendingTasks = tasks.filter((t) => t.status === "pending")
  const finishedTasks = tasks.filter((t) => t.status !== "pending")
  const donePages = tasks.filter((t) => t.status === "done").reduce((s, t) => s + t.pages, 0)
  const planPages = tasks.reduce((s, t) => s + t.pages, 0)
  const allDone = tasks.length > 0 && tasks.every((t) => t.status === "done")

  const hour = new Date().getHours()
  const greeting =
    hour < 5 ? "أسعد الله ليلتك" : hour < 12 ? "صباح الخير" : hour < 17 ? "طاب يومك" : "مساء الخير"

  const hijriDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("ar-EG-u-ca-islamic-umalqura", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date())
    } catch {
      return ""
    }
  }, [])

  const complete = async (task: TaskDTO, quality: Quality) => {
    setBusyTask(task.id)
    try {
      const res = await action("/api/task", { taskId: task.id, action: "complete", quality })
      if (res.allDone) {
        fireConfetti()
        toast({
          title: "تقبل الله منك!",
          description: "أنجزت ورد اليوم كاملاً — أحسنت وبارك الله فيك",
        })
      } else {
        const msgs: Record<Quality, string> = {
          perfect: "ما شاء الله! رفعنا قوة هذه الصفحات",
          good: "أحسنت! سنراها مرة أخرى في وقتها",
          hard: "لا بأس — سنراجعها قريباً لتثبت أكثر",
        }
        toast({ title: "سُجلت المراجعة", description: msgs[quality] })
      }
      await load()
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "حاول مرة أخرى" })
    } finally {
      setBusyTask(null)
    }
  }

  const snooze = async (task: TaskDTO) => {
    setBusyTask(task.id)
    try {
      await action("/api/task", { taskId: task.id, action: "snooze" })
      toast({ title: "أجّلناها إلى الغد", description: "ستكون أول ما يظهر في ورد الغد إن شاء الله" })
      await load()
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "حاول مرة أخرى" })
    } finally {
      setBusyTask(null)
    }
  }

  const cannotToday = async () => {
    try {
      await action("/api/day", { action: "cannot" })
      toast({
        title: "لا مشكلة أبداً",
        description: "أعدنا جدولة ورد اليوم ليوم غد، وسنوازن خطتك تلقائياً بما يناسبك",
      })
      await load()
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "حاول مرة أخرى" })
    }
  }

  return (
    <div className="space-y-5">
      {/* بطاقة الترحيب */}
      <Card className="overflow-hidden border-0 bg-gradient-to-bl from-emerald-800 via-emerald-700 to-teal-800 text-white glow-emerald">
        <div className="pattern-islamic-light">
          <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="space-y-3 text-center sm:text-right">
              <div>
                <h2 className="text-2xl font-extrabold sm:text-3xl">
                  {greeting} {state.profile.name || "يا حافظ القرآن"}
                </h2>
                <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-white/75 sm:justify-start sm:text-sm">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {dateAr(state.today)}
                  </span>
                  {hijriDate && <span className="text-gold">• {hijriDate}</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur-sm">
                  <Flame className="h-4 w-4 text-amber-300" />
                  {state.profile.streak > 0 ? `${state.profile.streak} يوم متتابع` : "ابدأ سلسلتك اليوم"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur-sm">
                  <Star className="h-4 w-4 text-amber-300" />
                  {state.level.name} • {state.profile.xp} نقطة
                </span>
              </div>
            </div>
            <div className="flex shrink-0 justify-center">
              <ProgressRing
                value={donePages}
                max={planPages}
                size={132}
                label={planPages > 0 ? `${donePages}/${planPages}` : "—"}
                sublabel="من ورد اليوم"
              />
            </div>
          </CardContent>
        </div>
      </Card>

      {/* احتفال اكتمال اليوم */}
      {allDone && (
        <Card className="animate-in fade-in-50 zoom-in-95 border-emerald-300/60 bg-emerald-50 dark:border-emerald-700/50 dark:bg-emerald-950/40">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white">
              <PartyPopper className="h-7 w-7" />
            </div>
            <div>
              <p className="text-base font-extrabold text-emerald-900 dark:text-emerald-200">
                أنجزت ورد اليوم كاملاً — تقبل الله منك!
              </p>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300/80">
                كسبت 30 نقطة إضافية. استراحة مستحقة، ونراك غداً في موعدك مع كتاب الله.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* تنبيه المتأخرات */}
      {state.overdueCount > 0 && !allDone && (
        <Card className="border-amber-300/70 bg-amber-50/80 dark:border-amber-600/40 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-3 p-4">
            <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm leading-6">
              <span className="font-bold text-amber-900 dark:text-amber-200">
                لديك {formatPages(state.overdueCount)} متأخرة عن موعدها.
              </span>{" "}
              <span className="text-amber-800/80 dark:text-amber-300/80">
                لا تقلق — النظام يوزعها تلقائياً على أيامك القادمة مع أولوية للأكثر تأخراً، وستراها تظهر في وردك تباعاً.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ورد اليوم */}
      <section aria-label="ورد اليوم" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-extrabold">
            <BookOpen className="h-5 w-5 text-primary" />
            ورد اليوم
          </h3>
          {plan && (
            <Badge variant="secondary" className="gap-1 font-bold">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              سعة اليوم: {plan.capacity} صفحات
            </Badge>
          )}
        </div>

        {tasks.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                لا توجد مهام اليوم. أضف صفحات محفوظة من الإعدادات ليبدأ وِردي بتخطيط مراجعاتك.
              </p>
            </CardContent>
          </Card>
        )}

        {/* المهام المعلقة */}
        <div className="space-y-3">
          {pendingTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              busy={busyTask === task.id}
              onComplete={complete}
              onSnooze={snooze}
            />
          ))}
        </div>

        {/* المهام المنتهية */}
        {finishedTasks.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-bold text-muted-foreground">ما تم اليوم</p>
            <div className="space-y-2">
              {finishedTasks.map((task) => (
                <FinishedTaskRow key={task.id} task={task} />
              ))}
            </div>
          </div>
        )}

        {/* زر تعذر المراجعة */}
        {pendingTasks.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="w-full text-muted-foreground" size="sm">
                <AlertTriangle className="h-4 w-4" />
                لم أستطع المراجعة اليوم
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>لم تستطع المراجعة اليوم؟</AlertDialogTitle>
                <AlertDialogDescription>
                  لا مشكلة أبداً — الديمومة أهم من الكمال. سنغلق ورد اليوم وننقل صفحاته إلى الغد، وسيتكيف النظام مع وتيرتك
                  تلقائياً.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>سأراجع شيئاً على الأقل</AlertDialogCancel>
                <AlertDialogAction onClick={cannotToday}>نعم، انقلها للغد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </section>

      {/* التحفيز اليومي */}
      <Card className="overflow-hidden border-gold/30 bg-gradient-to-bl from-amber-50 to-white dark:from-amber-950/20 dark:to-card">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/20 text-gold">
              <Sparkles className="h-4 w-4" />
            </span>
            <p className="text-sm font-bold text-gold">
              {state.motivation.kind === "ayah" ? "آية اليوم" : state.motivation.kind === "hadith" ? "حديث اليوم" : "ومضة اليوم"}
            </p>
          </div>
          <p className="font-quran text-lg leading-9 text-foreground sm:text-xl" dir="rtl">
            {state.motivation.text}
          </p>
          <p className="mt-2 text-xs font-medium text-muted-foreground">{state.motivation.source}</p>
        </CardContent>
      </Card>

      {/* توقعات الأسبوع */}
      {state.forecast.length > 0 && (
        <section aria-label="توقعات الأيام القادمة" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-extrabold">
              <CalendarDays className="h-5 w-5 text-primary" />
              الأيام القادمة
            </h3>
            <p className="text-xs text-muted-foreground">الصفحات المستحقة لكل يوم</p>
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {state.forecast.map((f) => {
              const heavy = f.count > state.profile.dailyCapacity
              return (
                <div
                  key={f.date}
                  title={`${dateAr(f.date)} — ${f.count} صفحة مستحقة`}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors sm:p-3",
                    heavy
                      ? "border-amber-300/70 bg-amber-50/70 dark:border-amber-600/40 dark:bg-amber-950/30"
                      : "border-border/60 bg-card"
                  )}
                >
                  <span className="text-[10px] font-bold text-muted-foreground sm:text-xs">{weekdayShortAr(f.date)}</span>
                  <span
                    className={cn(
                      "text-sm font-extrabold tabular-nums sm:text-lg",
                      heavy ? "text-amber-600 dark:text-amber-400" : f.count === 0 ? "text-muted-foreground/40" : "text-primary"
                    )}
                  >
                    {f.count}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-center text-xs leading-5 text-muted-foreground">
            هذه أرقام استرشادية — وِردي يوازنها يومياً حتى لا يتراكم عليك الحمل أبداً.
          </p>
        </section>
      )}
    </div>
  )
}

function TaskCard({
  task,
  busy,
  onComplete,
  onSnooze,
}: {
  task: TaskDTO
  busy: boolean
  onComplete: (task: TaskDTO, quality: Quality) => void
  onSnooze: (task: TaskDTO) => void
}) {
  const qualityButtons: { q: Quality; label: string; icon: typeof Check; cls: string }[] = [
    {
      q: "perfect",
      label: "أتقنتها",
      icon: CheckCheck,
      cls: "bg-emerald-600 hover:bg-emerald-700 text-white",
    },
    {
      q: "good",
      label: "جيدة",
      icon: Check,
      cls: "bg-amber-500 hover:bg-amber-600 text-white",
    },
    {
      q: "hard",
      label: "صعبة",
      icon: AlertTriangle,
      cls: "bg-orange-700/90 hover:bg-orange-700 text-white",
    },
  ]

  return (
    <Card
      className={cn(
        "animate-in fade-in-50 border-border/70 shadow-sm transition-all",
        busy && "opacity-60"
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-lg font-extrabold text-foreground">{task.label}</h4>
              <Badge variant="outline" className="border-primary/30 text-primary">
                الجزء {task.juz}
              </Badge>
              {task.isNew && (
                <Badge className="bg-gold text-gold-foreground gap-1">
                  <Sparkles className="h-3 w-3" />
                  أول مراجعة
                </Badge>
              )}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              السور: {task.surahs.slice(0, 4).join("، ")}
              {task.surahs.length > 4 ? " وغيرها" : ""}
            </p>
            <p
              className={cn(
                "text-xs font-bold",
                task.dueLabel.startsWith("متأخر") ? "text-amber-600 dark:text-amber-400" : "text-primary"
              )}
            >
              {task.dueLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSnooze(task)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="أجل المهمة إلى الغد"
          >
            <Clock className="h-3.5 w-3.5" />
            تأجيل
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {qualityButtons.map((b) => (
            <Button
              key={b.q}
              size="sm"
              disabled={busy}
              onClick={() => onComplete(task, b.q)}
              className={cn("h-10 gap-1.5 text-xs font-bold sm:text-sm", b.cls)}
            >
              <b.icon className="h-4 w-4" />
              {b.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function FinishedTaskRow({ task }: { task: TaskDTO }) {
  const meta =
    task.quality === "perfect"
      ? { label: "أتقنتها", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300", icon: CheckCheck }
      : task.quality === "hard"
        ? { label: "صعبة", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300", icon: AlertTriangle }
        : { label: "جيدة", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300", icon: Check }

  if (task.status === "done") {
    const Icon = meta.icon
    return (
      <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", meta.cls)}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold text-foreground/70 line-through decoration-primary/40">{task.label}</span>
        </div>
        <Badge variant="secondary" className="text-[11px]">{meta.label}</Badge>
      </div>
    )
  }

  // مهمة مؤجلة أو فائتة
  const snoozed = task.status === "snoozed"
  return (
    <div className="flex items-center justify-between rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Clock className="h-4 w-4" />
        </span>
        <span className="text-sm font-bold text-muted-foreground">{task.label}</span>
      </div>
      <Badge variant="outline" className="text-[11px] text-muted-foreground">
        {snoozed ? "أُجّلت للغد" : "ستعود في خطتك"}
      </Badge>
    </div>
  )
}
