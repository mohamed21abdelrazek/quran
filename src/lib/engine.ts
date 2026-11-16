// محرك خطة المراجعة الذكية: تكرار متباعد + تركيز على الأضعف + قاعدة عدم النسيان (10 أيام)
import { db } from "@/lib/db"
import { BADGES, INTENSITY_META, levelFromXp, motivationFor } from "./content"
import { getToolsState } from "./tools"
import type { Intensity, Quality } from "./content"
import { juzPageRange, pageToJuz, pagesLabel, surahsInRange, TOTAL_JUZ, TOTAL_PAGES } from "./quran"
import { formatDays } from "./format"
import type { AppState, AttentionPage, PlanDTO, TaskDTO } from "./types"

// ==================== أدوات التواريخ ====================

/** تاريخ اليوم بصيغة YYYY-MM-DD حسب المنطقة الزمنية */
export function todayStr(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  } catch {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(y, m - 1, d, 12)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  const da = new Date(ay, am - 1, ad, 12)
  const db = new Date(by, bm - 1, bd, 12)
  return Math.round((da.getTime() - db.getTime()) / 86400000)
}

/** تاريخ لحظة زمنية بصيغة YYYY-MM-DD حسب المنطقة الزمنية */
export function dateOnlyInTz(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** قاعدة عدم النسيان — أقصى فجوة مضمونة بين مراجعات أي صفحة */
export function effectiveMaxGap(raw: number | null | undefined): number {
  return Math.max(3, Math.min(30, Math.round(raw || 10)))
}

// ==================== الملف الشخصي ====================

export async function getProfile() {
  let profile = await db.profile.findUnique({ where: { id: 1 } })
  if (!profile) {
    profile = await db.profile.create({ data: { id: 1 } })
  }
  return profile
}

// ==================== منطق المراجعة ====================

function intervalsFor(intensity: string): number[] {
  return INTENSITY_META[(intensity as Intensity) ?? "balanced"]?.intervals ?? INTENSITY_META.balanced.intervals
}

/** قوة الصفحة بعد مراجعة بجودة معينة */
function applyStrength(strength: number, quality: Quality): number {
  if (quality === "perfect") return Math.min(5, strength + 1)
  if (quality === "hard") return Math.max(0, strength - 1)
  return strength
}

/**
 * درجة خطورة النسيان لصفحة — كلما زادت زادت أولويتها في ورد اليوم.
 * المحور الأساسي للخطة: التركيز الدائم على الضعيف والمتأخر وما لم يُراجع أبداً.
 */
export function riskScore(
  p: { reviews: number; strength: number; misses: number; dueDate: string | null },
  today: string
): number {
  let risk = 0
  if (p.reviews === 0) risk += 9 // لم تُراجع بعد — أولوية قصوى
  if (p.dueDate) {
    const d = diffDays(today, p.dueDate)
    if (d > 0) risk += Math.min(d, 15) * 2 // متأخرة — كل يوم تأخير يرفع الخطر
    else if (d === 0) risk += 0.5 // مستحقة اليوم
    else risk -= Math.min(-d, 10) * 0.8 // مستقبلية — تنتظر دورها بهدوء
  } else {
    risk += 6 // محفوظة بلا موعد (احتياطي)
  }
  risk += (5 - p.strength) * 2.2 // الأضعف أخطر دائماً
  risk += Math.min(p.misses, 5) * 1.5 // سبق أن فاتتها مراجعات
  return risk
}

// ==================== معالجة الأيام الفائتة ====================

/**
 * إغلاق الخطط السابقة غير المكتملة: المهام المعلقة تصبح "فائتة"
 * ويُعاد جدولة صفحاتها فوراً حتى يلتقطها المخطط القادم.
 */
async function processPendingBefore(today: string) {
  const staleTasks = await db.task.findMany({
    where: {
      status: { in: ["pending", "snoozed"] },
      plan: { date: { lt: today } },
    },
    include: { plan: true },
  })

  for (const task of staleTasks) {
    const gap = diffDays(today, task.plan.date)
    await db.task.update({ where: { id: task.id }, data: { status: "missed" } })

    for (let p = task.pageFrom; p <= task.pageTo; p++) {
      const page = await db.pageState.findUnique({ where: { page: p } })
      if (!page || !page.memorized) continue
      // خصم لطيف: تنخفض القوة فقط إذا تأخرت كثيراً (3 أيام فأكثر)
      const decay = gap >= 3 ? Math.max(0, page.strength - 1) : page.strength
      await db.pageState.update({
        where: { page: p },
        data: {
          misses: { increment: 1 },
          strength: decay,
          dueDate: today, // مستحقة فوراً لتعود للخطة بأولوية
        },
      })
    }

    const pages = task.pageTo - task.pageFrom + 1
    await db.activity
      .update({
        where: { date: task.plan.date },
        data: { missedPages: { increment: pages } },
      })
      .catch(() => {})
  }

  // تحديث حالة الخطط القديمة
  const oldPlans = await db.dailyPlan.findMany({
    where: { date: { lt: today }, status: { in: ["open", "partial"] } },
    include: { tasks: true },
  })
  for (const plan of oldPlans) {
    const anyDone = plan.tasks.some((t) => t.status === "done")
    await db.dailyPlan.update({
      where: { id: plan.id },
      data: { status: anyDone ? "partial" : "missed" },
    })
  }
}

// ==================== توليد خطة اليوم ====================

/**
 * المخطط اليومي — مبدآن لا يُخرقان:
 * 1) وردك لا يتجاوز قدرتك أبداً (السعة الفعلية ≤ سعتك المحددة)
 * 2) يبدأ دائماً بالأعلى خطورة على النسيان: المتأخر ثم الضعيف ثم لم يُراجع أبداً
 * ومع كل مراجعة تُحدَّث فترة العودة بحيث لا تتجاوز قاعدة عدم النسيان (10 أيام افتراضياً).
 */
export async function ensureTodayPlan(profile: {
  id: number
  timezone: string
  dailyCapacity: number
  unitSize: number
  intensity: string
  maxGapDays: number
  autoAdjust: boolean
}) {
  const today = todayStr(profile.timezone)
  const maxGap = effectiveMaxGap(profile.maxGapDays)

  await processPendingBefore(today)

  // قاعدة عدم النسيان: لا تنتظر أي صفحة محفوظة أكثر من maxGap يوماً
  // (يشمل ترحيل أي مواعيد قديمة كانت مجدولة بفترات أطول)
  const cutoff = addDays(today, maxGap)
  await db.pageState.updateMany({
    where: { memorized: true, dueDate: { gt: cutoff } },
    data: { dueDate: cutoff },
  })

  const existing = await db.dailyPlan.findUnique({
    where: { date: today },
    include: { tasks: true },
  })
  if (existing) return existing

  const pages = await db.pageState.findMany({ where: { memorized: true } })
  if (pages.length === 0) return null

  // --- حساب السعة الفعلية (التكيف) ---
  let effCapacity = profile.dailyCapacity
  const weekAgo = addDays(today, -7)
  const recent = await db.activity.findMany({
    where: { date: { gte: weekAgo, lt: today } },
  })
  const recentPlans = recent.filter((a) => a.totalTasks > 0)
  if (profile.autoAdjust && recentPlans.length > 0) {
    const done = recentPlans.reduce((s, a) => s + a.donePages, 0)
    const missed = recentPlans.reduce((s, a) => s + a.missedPages, 0)
    const rate = done + missed > 0 ? done / (done + missed) : 1
    if (rate < 0.5) {
      effCapacity = Math.max(1, Math.round(profile.dailyCapacity * 0.7))
    } else if (rate < 0.8) {
      effCapacity = Math.max(1, Math.round(profile.dailyCapacity * 0.85))
    }
    // لا نرفع السعة فوق ما حددته أبداً — الورد يبقى دائماً في حدود قدرتك
  }

  // --- اختيار بترتيب الخطورة: الأعلى خطراً على النسيان أولاً ---
  const due = pages.filter((p) => !p.dueDate || p.dueDate <= today)
  const dueSorted = [...due].sort(
    (a, b) => riskScore(b, today) - riskScore(a, today) || a.page - b.page
  )
  const picked: typeof dueSorted = dueSorted.slice(0, effCapacity)

  // --- تعبئة لطيفة بالأقرب استحقاقاً حتى لا يفرغ وردك أبداً ---
  if (picked.length < effCapacity) {
    const upcoming = pages
      .filter((p) => p.dueDate && p.dueDate > today)
      .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0))
    for (const p of upcoming) {
      if (picked.length >= effCapacity) break
      if (!picked.includes(p)) picked.push(p)
    }
  }

  if (picked.length === 0) return null

  // --- تجميع الصفحات المتجاورة في مهام ---
  const sorted = [...picked].sort((a, b) => a.page - b.page)
  const runs: { from: number; to: number }[] = []
  for (const p of sorted) {
    const last = runs[runs.length - 1]
    if (last && p.page === last.to + 1) last.to = p.page
    else runs.push({ from: p.page, to: p.page })
  }
  const unit = Math.max(1, profile.unitSize)
  const taskRanges: { from: number; to: number }[] = []
  for (const run of runs) {
    let cursor = run.from
    while (cursor <= run.to) {
      const to = Math.min(cursor + unit - 1, run.to)
      taskRanges.push({ from: cursor, to })
      cursor = to + 1
    }
  }

  const plan = await db.dailyPlan.create({
    data: {
      date: today,
      capacity: effCapacity,
      status: "open",
      tasks: {
        create: taskRanges.map((r) => ({ pageFrom: r.from, pageTo: r.to })),
      },
    },
    include: { tasks: true },
  })

  await db.activity.upsert({
    where: { date: today },
    update: { totalTasks: plan.tasks.length },
    create: { date: today, totalTasks: plan.tasks.length },
  })

  return plan
}

// ==================== إجراءات المستخدم ====================

export async function completeTask(taskId: number, quality: Quality) {
  const task = await db.task.findUnique({ where: { id: taskId }, include: { plan: true } })
  if (!task || task.status === "done") return { ok: false }

  const profile = await getProfile()
  const today = todayStr(profile.timezone)
  const intervals = intervalsFor(profile.intensity)
  const maxGap = effectiveMaxGap(profile.maxGapDays)

  const pagesCount = task.pageTo - task.pageFrom + 1
  let xpGain = 0
  const xpPer = quality === "perfect" ? 15 : quality === "good" ? 10 : 5
  xpGain = xpPer * pagesCount

  for (let p = task.pageFrom; p <= task.pageTo; p++) {
    const page = await db.pageState.findUnique({ where: { page: p } })
    if (!page) continue
    const newStrength = applyStrength(page.strength, quality)
    // قاعدة عدم النسيان: مهما بلغ إتقانك لا تنتظر الصفحة أكثر من maxGap
    const interval = Math.min(intervals[newStrength], maxGap)
    await db.pageState.update({
      where: { page: p },
      data: {
        strength: newStrength,
        reviews: { increment: 1 },
        lastReviewedAt: new Date(),
        dueDate: addDays(today, interval),
      },
    })
  }

  await db.task.update({
    where: { id: taskId },
    data: { status: "done", quality, completedAt: new Date() },
  })

  // تحديث النشاط
  const activity = await db.activity.upsert({
    where: { date: today },
    update: {
      donePages: { increment: pagesCount },
      doneTasks: { increment: 1 },
      xpGained: { increment: xpGain },
    },
    create: { date: today, donePages: pagesCount, doneTasks: 1, xpGained: xpGain },
  })

  // السلسلة اليومية
  let streak = profile.streak
  if (profile.lastActiveDate !== today) {
    streak = profile.lastActiveDate === addDays(today, -1) ? profile.streak + 1 : 1
  }
  const bestStreak = Math.max(profile.bestStreak, streak)

  // مكافأة إتمام اليوم كاملاً
  const planTasks = await db.task.findMany({ where: { planId: task.planId } })
  const allDone = planTasks.every((t) => t.status === "done")
  if (allDone) {
    xpGain += 30
    await db.dailyPlan.update({ where: { id: task.planId }, data: { status: "completed" } })
  }

  await db.profile.update({
    where: { id: 1 },
    data: {
      xp: { increment: xpGain },
      streak,
      bestStreak,
      lastActiveDate: today,
    },
  })

  return { ok: true, allDone, xpGain, activityDone: activity.donePages }
}

export async function snoozeTask(taskId: number) {
  const task = await db.task.findUnique({ where: { id: taskId }, include: { plan: true } })
  if (!task || task.status === "done") return { ok: false }

  const profile = await getProfile()
  const today = todayStr(profile.timezone)
  const tomorrow = addDays(today, 1)

  await db.task.update({
    where: { id: taskId },
    data: { status: "snoozed", snoozeCount: { increment: 1 } },
  })
  for (let p = task.pageFrom; p <= task.pageTo; p++) {
    await db.pageState
      .update({ where: { page: p }, data: { dueDate: tomorrow } })
      .catch(() => {})
  }

  // إعادة حساب حالة الخطة
  const planTasks = await db.task.findMany({ where: { planId: task.planId } })
  const anyDone = planTasks.some((t) => t.status === "done")
  const allDone = planTasks.every((t) => t.status === "done")
  await db.dailyPlan.update({
    where: { id: task.planId },
    data: { status: allDone ? "completed" : anyDone ? "partial" : "open" },
  })

  return { ok: true }
}

/** "لم أستطع المراجعة اليوم" — إغلاق ورد اليوم بإعادة جدولة لطيفة */
export async function cannotToday() {
  const profile = await getProfile()
  const today = todayStr(profile.timezone)
  const tomorrow = addDays(today, 1)

  const plan = await db.dailyPlan.findUnique({ where: { date: today }, include: { tasks: true } })
  if (!plan) return { ok: false }

  let missedPages = 0
  for (const task of plan.tasks) {
    if (task.status === "done") continue
    if (task.status !== "missed") {
      await db.task.update({ where: { id: task.id }, data: { status: "missed" } })
    }
    const pages = task.pageTo - task.pageFrom + 1
    missedPages += pages
    for (let p = task.pageFrom; p <= task.pageTo; p++) {
      await db.pageState
        .update({ where: { page: p }, data: { dueDate: tomorrow } })
        .catch(() => {})
    }
  }

  const anyDone = plan.tasks.some((t) => t.status === "done")
  await db.dailyPlan.update({
    where: { id: plan.id },
    data: { status: anyDone ? "partial" : "missed" },
  })

  if (missedPages > 0) {
    await db.activity.upsert({
      where: { date: today },
      update: { missedPages: { increment: missedPages } },
      create: { date: today, missedPages, totalTasks: plan.tasks.length },
    })
  }

  return { ok: true }
}

// ==================== التهيئة والإعدادات ====================

export async function applyOnboarding(input: {
  name: string
  ranges: { from: number; to: number }[]
  baseline: number
  dailyCapacity: number
  unitSize: number
  intensity: Intensity
  maxGapDays?: number
  autoAdjust: boolean
}) {
  const today = todayStr("Africa/Cairo")
  const maxGap = effectiveMaxGap(input.maxGapDays ?? 10)

  // تهيئة كل الصفحات
  const all: { page: number; memorized: boolean; strength: number; dueDate: string | null }[] = []
  const mem = new Set<number>()
  for (const r of input.ranges) {
    for (let p = Math.max(1, r.from); p <= Math.min(TOTAL_PAGES, r.to); p++) mem.add(p)
  }
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    all.push({
      page: p,
      memorized: mem.has(p),
      strength: mem.has(p) ? input.baseline : 0,
      dueDate: mem.has(p) ? today : null,
    })
  }
  await db.pageState.deleteMany({})
  await db.pageState.createMany({ data: all })

  await db.task.deleteMany({})
  await db.dailyPlan.deleteMany({})
  await db.activity.deleteMany({})

  await db.profile.update({
    where: { id: 1 },
    data: {
      onboarded: true,
      name: input.name,
      dailyCapacity: input.dailyCapacity,
      unitSize: input.unitSize,
      intensity: input.intensity,
      maxGapDays: maxGap,
      autoAdjust: input.autoAdjust,
      xp: 0,
      streak: 0,
      bestStreak: 0,
      lastActiveDate: null,
    },
  })

  const profile = await getProfile()
  await ensureTodayPlan(profile)
  return { ok: true }
}

export async function updateRanges(add: { from: number; to: number }[], remove: { from: number; to: number }[]) {
  const profile = await getProfile()
  const today = todayStr(profile.timezone)

  for (const r of add) {
    for (let p = Math.max(1, r.from); p <= Math.min(TOTAL_PAGES, r.to); p++) {
      await db.pageState.upsert({
        where: { page: p },
        update: { memorized: true, dueDate: today },
        create: { page: p, memorized: true, strength: 0, dueDate: today },
      })
    }
  }
  for (const r of remove) {
    for (let p = Math.max(1, r.from); p <= Math.min(TOTAL_PAGES, r.to); p++) {
      await db.pageState.update({
        where: { page: p },
        data: { memorized: false, dueDate: null },
      }).catch(() => {})
    }
    // حذف المهام المعلقة التي تقع ضمن النطاق المحذوف
    const todayPlan = await db.dailyPlan.findUnique({ where: { date: today }, include: { tasks: true } })
    if (todayPlan) {
      for (const t of todayPlan.tasks) {
        if (t.status !== "done" && t.pageFrom >= r.from && t.pageTo <= r.to) {
          await db.task.delete({ where: { id: t.id } })
        }
      }
      const remaining = await db.task.findMany({ where: { planId: todayPlan.id } })
      if (remaining.length === 0) {
        await db.dailyPlan.delete({ where: { id: todayPlan.id } })
        await ensureTodayPlan(profile)
      }
    }
  }
  return { ok: true }
}

export async function resetAll() {
  await db.task.deleteMany({})
  await db.dailyPlan.deleteMany({})
  await db.activity.deleteMany({})
  await db.pageState.deleteMany({})
  await db.profile.deleteMany({})
  await getProfile()
  return { ok: true }
}

// ==================== بناء حالة التطبيق ====================

function dueLabelFor(dueDate: string | null, reviews: number, today: string): string {
  if (reviews === 0) return "أول مراجعة"
  if (!dueDate) return "مستحق اليوم"
  const d = diffDays(today, dueDate)
  if (d > 0) return `متأخر منذ ${d} ${d === 1 ? "يوم" : d === 2 ? "يومين" : d <= 10 ? "أيام" : "يوماً"}`
  if (d === 0) return "مستحق اليوم"
  return "مراجعة استباقية"
}

export async function buildAppState(): Promise<AppState> {
  const profile = await getProfile()

  if (!profile.onboarded) {
    return {
      today: todayStr(profile.timezone),
      onboarded: false,
      profile: {
        name: "",
        dailyCapacity: profile.dailyCapacity,
        unitSize: profile.unitSize,
        intensity: profile.intensity as Intensity,
        autoAdjust: profile.autoAdjust,
        timezone: profile.timezone,
        xp: 0,
        streak: 0,
        bestStreak: 0,
        maxGapDays: effectiveMaxGap(profile.maxGapDays),
      },
      level: { index: 0, name: "مبتدئ", nextThreshold: 150, progress: 0 },
      plan: null,
      overdueCount: 0,
      forecast: [],
      activity: [],
      motivation: motivationFor(todayStr(profile.timezone)),
      memorized: { total: 0, strengths: [] },
      cycle: {
        targetDays: effectiveMaxGap(profile.maxGapDays),
        memorizedTotal: 0,
        currentCycleDays: 0,
        requiredDaily: 0,
        coveragePct: 1,
        coveredPages: 0,
        onTrack: true,
      },
      attention: [],
      stats: { totalDonePages: 0, completionRate: 0, remainingFirstPass: 0, cycleDays: 0, perfectDays: 0 },
      badges: BADGES.map((b) => ({ id: b.id, earned: false })),
      tools: {
        difficult: [],
        bookmarks: [],
        quiz: { recent: [], totalSessions: 0, avgScore: 0, bestScore: 0 },
      },
    }
  }

  const today = todayStr(profile.timezone)

  // توليد/جلب خطة اليوم (يعالج أيام الغياب تلقائياً)
  const planRow = await ensureTodayPlan(profile)

  // خريطة الصفحات
  const pageRows = await db.pageState.findMany()
  const strengths = new Array<number>(TOTAL_PAGES).fill(-1)
  const memorizedRows = pageRows.filter((p) => p.memorized)
  for (const p of memorizedRows) {
    strengths[p.page - 1] = p.strength
  }
  const memorizedTotal = memorizedRows.length

  // عدد المتأخرات (خارج خطة اليوم — ما لم يُجدول بعد)
  const todayPlanPages = new Set<number>()
  if (planRow) {
    for (const t of planRow.tasks) {
      for (let p = t.pageFrom; p <= t.pageTo; p++) todayPlanPages.add(p)
    }
  }
  const overdueCount = pageRows.filter(
    (p) => p.memorized && p.dueDate && p.dueDate < today && !todayPlanPages.has(p.page)
  ).length

  // ---- دورة الأمان (قاعدة عدم النسيان) ----
  const maxGap = effectiveMaxGap(profile.maxGapDays)
  const requiredDaily = memorizedTotal > 0 ? Math.ceil(memorizedTotal / maxGap) : 0
  const currentCycleDays =
    memorizedTotal > 0 && profile.dailyCapacity > 0 ? Math.ceil(memorizedTotal / profile.dailyCapacity) : 0
  const windowStart = addDays(today, -(maxGap - 1))
  const coveredPages = memorizedRows.filter(
    (p) => p.reviews > 0 && p.lastReviewedAt && dateOnlyInTz(p.lastReviewedAt, profile.timezone) >= windowStart
  ).length
  const coveragePct = memorizedTotal > 0 ? coveredPages / memorizedTotal : 1

  // ---- الصفحات الأكثر احتياجاً للمراجعة (خارج ورد اليوم) ----
  const attention: AttentionPage[] = memorizedRows
    .filter((p) => !todayPlanPages.has(p.page))
    .map((p) => {
      const risk = riskScore(p, today)
      const od = p.dueDate ? Math.max(0, diffDays(today, p.dueDate)) : 0
      let reason = ""
      let kind: AttentionPage["kind"] = "weak"
      if (p.reviews === 0) {
        reason = "لم تُراجعها بعد"
        kind = "never"
      } else if (od >= 1) {
        reason = `متأخرة ${formatDays(od)}`
        kind = "overdue"
      } else if (p.strength <= 1) {
        reason = "ضعيفة — تحتاج تثبيتاً"
        kind = "weak"
      } else if (p.misses >= 2) {
        reason = `فاتتها ${p.misses} ${p.misses === 2 ? "مرتين" : "مرات"} من قبل`
        kind = "misses"
      } else {
        reason = "مستحقة قريباً — راقبها"
        kind = "weak"
      }
      return {
        page: p.page,
        juz: pageToJuz(p.page),
        label: pagesLabel(p.page, p.page),
        reason,
        kind,
        overdueDays: od,
        strength: p.strength,
        risk,
      }
    })
    .filter((a) => a.risk >= 3)
    .sort((a, b) => b.risk - a.risk || a.page - b.page)
    .slice(0, 10)

  // توقعات الأسبوع
  const forecast: { date: string; count: number }[] = []
  for (let d = 1; d <= 7; d++) {
    const date = addDays(today, d)
    const count = pageRows.filter((p) => p.memorized && p.dueDate === date).length
    forecast.push({ date, count })
  }

  // النشاط (آخر 120 يوماً)
  const since = addDays(today, -120)
  const activityRows = await db.activity.findMany({
    where: { date: { gte: since } },
    orderBy: { date: "asc" },
  })

  // إحصاءات
  const totalDonePages = activityRows.reduce((s, a) => s + a.donePages, 0)
  const last30 = activityRows.filter((a) => a.date >= addDays(today, -30) && a.totalTasks > 0)
  const completionRate =
    last30.length > 0
      ? last30.reduce((s, a) => s + a.doneTasks / a.totalTasks, 0) / last30.length
      : 0
  const remainingFirstPass = pageRows.filter((p) => p.memorized && p.reviews === 0).length
  const cycleDays = currentCycleDays // الدورة الكاملة الفعلية بسعتك الحالية
  const perfectDays = activityRows.filter((a) => a.totalTasks > 0 && a.doneTasks === a.totalTasks).length

  // الأوسمة
  const allActivity = await db.activity.findMany({ orderBy: { date: "asc" } })
  const totalDoneAll = allActivity.reduce((s, a) => s + a.donePages, 0)
  const fullCoverage =
    memorizedTotal > 0 && pageRows.filter((p) => p.memorized).every((p) => p.reviews > 0)
  let comeback = false
  const activeDates = allActivity.filter((a) => a.doneTasks > 0).map((a) => a.date)
  for (let i = 1; i < activeDates.length; i++) {
    if (diffDays(activeDates[i], activeDates[i - 1]) >= 3) comeback = true
  }
  const earnedMap: Record<string, boolean> = {
    first_step: totalDoneAll >= 1,
    perfect_day: perfectDays >= 1,
    streak_3: profile.bestStreak >= 3,
    streak_7: profile.bestStreak >= 7,
    streak_14: profile.bestStreak >= 14,
    streak_30: profile.bestStreak >= 30,
    pages_50: totalDoneAll >= 50,
    pages_100: totalDoneAll >= 100,
    pages_500: totalDoneAll >= 500,
    pages_1000: totalDoneAll >= 1000,
    full_coverage: fullCoverage,
    comeback,
  }
  const badges = BADGES.map((b) => ({ id: b.id, earned: earnedMap[b.id] ?? false }))

  // بناء خطة اليوم بصيغة DTO
  let plan: PlanDTO | null = null
  if (planRow) {
    const taskDTOs: TaskDTO[] = planRow.tasks
      .map((t) => {
        const pagesInRange: typeof pageRows = []
        for (let p = t.pageFrom; p <= t.pageTo; p++) {
          const row = pageRows.find((x) => x.page === p)
          if (row) pagesInRange.push(row)
        }
        const minDue = pagesInRange.reduce<string | null>((m, p) => {
          if (!p.dueDate) return m
          return !m || p.dueDate < m ? p.dueDate : m
        }, null)
        const anyNew = pagesInRange.some((p) => p.reviews === 0)
        return {
          id: t.id,
          pageFrom: t.pageFrom,
          pageTo: t.pageTo,
          pages: t.pageTo - t.pageFrom + 1,
          juz: pageToJuz(t.pageFrom),
          surahs: surahsInRange(t.pageFrom, t.pageTo),
          label: pagesLabel(t.pageFrom, t.pageTo),
          status: t.status as TaskDTO["status"],
          quality: (t.quality as Quality | null) ?? null,
          dueDate: minDue,
          dueLabel: dueLabelFor(minDue, anyNew ? 0 : 1, today),
          isNew: anyNew,
        }
      })
      .sort((a, b) => a.pageFrom - b.pageFrom)

    plan = {
      date: planRow.date,
      status: planRow.status as PlanDTO["status"],
      capacity: planRow.capacity,
      tasks: taskDTOs,
    }
  }

  const level = levelFromXp(profile.xp)

  // أدوات الحفظ (كلمات صعبة / علامات / اختبارات)
  const tools = await getToolsState()

  return {
    today,
    onboarded: true,
    profile: {
      name: profile.name,
      dailyCapacity: profile.dailyCapacity,
      unitSize: profile.unitSize,
      intensity: profile.intensity as Intensity,
      autoAdjust: profile.autoAdjust,
      timezone: profile.timezone,
      xp: profile.xp,
      streak: profile.streak,
      bestStreak: profile.bestStreak,
      maxGapDays: maxGap,
    },
    level,
    plan,
    overdueCount,
    forecast,
    activity: activityRows.map((a) => ({
      date: a.date,
      donePages: a.donePages,
      missedPages: a.missedPages,
      doneTasks: a.doneTasks,
      totalTasks: a.totalTasks,
    })),
    motivation: motivationFor(today),
    memorized: { total: memorizedTotal, strengths },
    cycle: {
      targetDays: maxGap,
      memorizedTotal,
      currentCycleDays,
      requiredDaily,
      coveragePct,
      coveredPages,
      onTrack: currentCycleDays <= maxGap,
    },
    attention,
    stats: {
      totalDonePages,
      completionRate,
      remainingFirstPass,
      cycleDays,
      perfectDays,
    },
    badges,
    tools,
  }
}

// أدوات مساعدة للواجهة
export { juzPageRange, TOTAL_JUZ, pageToJuz }
