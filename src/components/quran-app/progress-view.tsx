"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageGrid, StrengthLegend } from "./page-grid"
import type { AppState } from "@/lib/types"
import { BADGES } from "@/lib/content"
import { dateAr, formatPages } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  Activity,
  BarChart3,
  BookOpen,
  Crown,
  Flame,
  Gem,
  Heart,
  Library,
  Lock,
  Map as MapIcon,
  Medal,
  RefreshCcw,
  Sparkles,
  Star,
  Sun,
  Target,
  Trophy,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

const BADGE_ICONS: Record<string, LucideIcon> = {
  Sparkles,
  Sun,
  Flame,
  Zap,
  Trophy,
  BookOpen,
  BookMarked: BookOpen,
  Books: Library,
  Gem,
  Crown,
  Heart,
}

export function ProgressView({ state }: { state: AppState }) {
  const activityMap = useMemo(() => {
    const m = new Map<string, { donePages: number; missedPages: number }>()
    for (const a of state.activity) m.set(a.date, { donePages: a.donePages, missedPages: a.missedPages })
    return m
  }, [state.activity])

  // خريطة النشاط: آخر 16 أسبوعاً
  const heatmap = useMemo(() => {
    const today = new Date(`${state.today}T12:00:00`)
    const days: ({ date: string; count: number; future?: boolean } | null)[] = []
    // نبدأ من Saturday الأسبوع قبل 16 أسبوعاً
    const arabicDow = (today.getDay() + 1) % 7 // السبت = 0
    const start = new Date(today)
    start.setDate(start.getDate() - 111 - arabicDow)
    for (let i = 0; i < 112 + arabicDow; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      const future = ds > state.today
      days.push({
        date: ds,
        count: future ? -1 : (activityMap.get(ds)?.donePages ?? 0),
        future,
      })
    }
    // تقسيم إلى أسابيع
    const weeks: (typeof days)[] = []
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
    return weeks
  }, [activityMap, state.today])

  // أعمدة آخر 14 يوماً
  const last14 = useMemo(() => {
    const arr: { date: string; count: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const [y, m, d] = state.today.split("-").map(Number)
      const dt = new Date(y, m - 1, d, 12)
      dt.setDate(dt.getDate() - i)
      const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
      arr.push({ date: ds, count: activityMap.get(ds)?.donePages ?? 0 })
    }
    return arr
  }, [activityMap, state.today])

  const maxBar = Math.max(state.profile.dailyCapacity, ...last14.map((d) => d.count), 1)
  const earnedBadges = state.badges.filter((b) => b.earned).length

  return (
    <div className="space-y-5">
      {/* بطاقات الإحصاءات */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            icon: BookOpen,
            label: "إجمالي المراجعة",
            value: formatPages(state.stats.totalDonePages),
            sub: "منذ بدايتك",
            color: "text-emerald-600 dark:text-emerald-400",
          },
          {
            icon: Flame,
            label: "سلسلتك الحالية",
            value: `${state.profile.streak} يوم`,
            sub: `أفضل سلسلة: ${state.profile.bestStreak}`,
            color: "text-amber-600 dark:text-amber-400",
          },
          {
            icon: Target,
            label: "معدل الإنجاز",
            value: `${Math.round(state.stats.completionRate * 100)}%`,
            sub: "آخر 30 يوماً",
            color: "text-teal-600 dark:text-teal-400",
          },
          {
            icon: Trophy,
            label: "أيام مثالية",
            value: `${state.stats.perfectDays} يوم`,
            sub: "أكملت وردها كاملاً",
            color: "text-gold",
          },
        ].map((s) => (
          <Card key={s.label} className="border-border/60 shadow-sm">
            <CardContent className="p-4">
              <s.icon className={cn("mb-2 h-6 w-6", s.color)} />
              <p className="text-xl font-extrabold tabular-nums">{s.value}</p>
              <p className="text-xs font-bold text-foreground/80">{s.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* المستوى */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
                <Medal className="h-6 w-6" />
              </span>
              <div>
                <p className="text-base font-extrabold">{state.level.name}</p>
                <p className="text-xs text-muted-foreground">{state.profile.xp} نقطة خبرة</p>
              </div>
            </div>
            <Badge className="gap-1 bg-gold text-gold-foreground">
              <Star className="h-3.5 w-3.5" />
              {earnedBadges} / {state.badges.length} وسام
            </Badge>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-600 transition-all duration-700"
              style={{ width: `${Math.round(state.level.progress * 100)}%` }}
              role="progressbar"
              aria-valuenow={Math.round(state.level.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="تقدم المستوى"
            />
          </div>
          {state.level.nextThreshold != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              بقي {state.level.nextThreshold - state.profile.xp} نقطة للوصول إلى المستوى القادم
            </p>
          )}
        </CardContent>
      </Card>

      {/* دورة الأمان — هل تنسى القديم؟ */}
      {state.cycle.memorizedTotal > 0 && (
        <Card
          className={cn(
            "border shadow-sm",
            state.cycle.onTrack
              ? "border-emerald-300/70 bg-emerald-50/60 dark:border-emerald-700/40 dark:bg-emerald-950/25"
              : "border-amber-300/70 bg-amber-50/60 dark:border-amber-600/40 dark:bg-amber-950/25"
          )}
        >
          <CardContent className="space-y-3.5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RefreshCcw className={cn("h-5 w-5", state.cycle.onTrack ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")} />
                <p className="text-base font-extrabold">دورة الأمان — راجعت كل شيء خلال {state.cycle.targetDays} أيام؟</p>
              </div>
              <Badge className={state.cycle.onTrack ? "bg-emerald-600" : "bg-amber-500"} tabIndex={0}>
                {Math.round(state.cycle.coveragePct * 100)}% تغطية
              </Badge>
            </div>

            <div>
              <div className="h-3 overflow-hidden rounded-full bg-white/70 dark:bg-black/30" role="progressbar" aria-valuenow={Math.round(state.cycle.coveragePct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="تغطية دورة الأمان">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    state.cycle.onTrack
                      ? "bg-gradient-to-l from-emerald-600 to-teal-500"
                      : "bg-gradient-to-l from-amber-500 to-orange-400"
                  )}
                  style={{ width: `${Math.max(3, Math.round(state.cycle.coveragePct * 100))}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  مراجَع خلال آخر {state.cycle.targetDays} أيام:{" "}
                  <span className="font-bold text-foreground">{state.cycle.coveredPages}</span> / {state.cycle.memorizedTotal}
                </span>
                {state.stats.remainingFirstPass > 0 && (
                  <span>
                    لم يُراجع إطلاقاً بعد: <span className="font-bold text-foreground">{state.stats.remainingFirstPass}</span>
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs leading-6 text-muted-foreground">
              {state.cycle.onTrack
                ? `دورتك الكاملة ${state.cycle.currentCycleDays} يوماً — كل صفحة تعود إليك قبل النسيان. استمر على هذا الطريق المبارك.`
                : `بسعتك الحالية دورتك الكاملة ≈ ${state.cycle.currentCycleDays} يوماً — النظام يحمي الأضعف دائماً ويقدمه في وردك أولاً، وبرفع سعتك إلى ${state.cycle.requiredDaily} صفحة/يوم تضمن مراجعة كل حفظك خلال ${state.cycle.targetDays} أيام.`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* خريطة النشاط */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5 text-primary" />
            خريطة نشاطك — آخر 16 أسبوعاً
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="scroll-thin overflow-x-auto pb-2">
            <div className="flex gap-1" dir="rtl">
              {heatmap.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map((day, di) => (
                    <div
                      key={di}
                      title={day ? `${dateAr(day.date)} — ${day.future ? "" : day.count === 0 ? "لا مراجعة" : `${day.count} صفحة`}` : ""}
                      className={cn(
                        "h-3.5 w-3.5 rounded-[4px]",
                        !day && "opacity-0",
                        day?.future && "bg-muted/30",
                        day && !day.future && day.count === 0 && "bg-muted",
                        day && !day.future && day.count > 0 && day.count <= 2 && "bg-emerald-300 dark:bg-emerald-900",
                        day && !day.future && day.count > 2 && day.count <= 4 && "bg-emerald-500 dark:bg-emerald-700",
                        day && !day.future && day.count > 4 && "bg-emerald-700 dark:bg-emerald-500"
                      )}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>أقل</span>
            <span className="h-3 w-3 rounded-[4px] bg-muted" />
            <span className="h-3 w-3 rounded-[4px] bg-emerald-300 dark:bg-emerald-900" />
            <span className="h-3 w-3 rounded-[4px] bg-emerald-500 dark:bg-emerald-700" />
            <span className="h-3 w-3 rounded-[4px] bg-emerald-700 dark:bg-emerald-500" />
            <span>أكثر</span>
          </div>
        </CardContent>
      </Card>

      {/* أعمدة آخر 14 يوماً */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-primary" />
            مراجعاتك — آخر 14 يوماً
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-36 items-end justify-between gap-1" dir="rtl">
            {last14.map((d, i) => {
              const isToday = i === last14.length - 1
              const h = Math.max(4, Math.round((d.count / maxBar) * 100))
              return (
                <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{d.count || ""}</span>
                  <div
                    title={`${dateAr(d.date)} — ${d.count} صفحة`}
                    className={cn(
                      "w-full max-w-7 rounded-t-lg transition-all",
                      isToday ? "bg-gradient-to-t from-gold to-amber-400" : d.count > 0 ? "bg-gradient-to-t from-emerald-700 to-emerald-500" : "bg-muted"
                    )}
                    style={{ height: `${h}%` }}
                  />
                  <span className={cn("text-[9px]", isToday ? "font-extrabold text-gold" : "text-muted-foreground")}>
                    {new Intl.DateTimeFormat("ar", { weekday: "narrow", timeZone: "UTC" }).format(
                      new Date(`${d.date}T00:00:00Z`)
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> مراجعة منجزة
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-gold" /> اليوم
            </span>
            <span>خط الهدف: {state.profile.dailyCapacity} صفحات/يوم</span>
          </div>
        </CardContent>
      </Card>

      {/* خريطة الحفظ والإتقان */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapIcon className="h-5 w-5 text-primary" />
            خريطة حفظك وإتقانك — {formatPages(state.memorized.total)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <PageGrid mode="strength" strengths={state.memorized.strengths} />
          <StrengthLegend />
          <p className="text-xs leading-5 text-muted-foreground">
            كلما اشتد اخضرار الصفحة زادت قوة تثبيتها في ذاكرتك — والصفحات الضعيفة تعود إليك في وردك أولاً بأول حتى
            تشتد.
          </p>
        </CardContent>
      </Card>

      {/* الأوسمة */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-5 w-5 text-gold" />
            أوسمتك
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {BADGES.map((def) => {
              const earned = state.badges.find((b) => b.id === def.id)?.earned ?? false
              const Icon = BADGE_ICONS[def.icon] ?? Medal
              return (
                <div
                  key={def.id}
                  title={def.description}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 transition-all",
                    earned
                      ? "border-gold/50 bg-gradient-to-bl from-amber-50 to-white shadow-sm dark:from-amber-950/30 dark:to-card"
                      : "border-border/50 bg-muted/30 opacity-70"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      earned ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {earned ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{def.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{def.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
