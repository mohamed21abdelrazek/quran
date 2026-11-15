import type { Intensity, Quality } from "./content"

export type { Intensity, Quality }

export type TaskStatus = "pending" | "done" | "missed" | "snoozed"
export type PlanStatus = "open" | "completed" | "partial" | "missed"

export interface TaskDTO {
  id: number
  pageFrom: number
  pageTo: number
  pages: number
  juz: number
  surahs: string[]
  label: string
  status: TaskStatus
  quality: Quality | null
  dueDate: string | null
  dueLabel: string
  isNew: boolean
}

export interface PlanDTO {
  date: string
  status: PlanStatus
  capacity: number
  tasks: TaskDTO[]
}

export interface LevelInfo {
  index: number
  name: string
  nextThreshold: number | null
  progress: number
}

export interface ActivityDTO {
  date: string
  donePages: number
  missedPages: number
  doneTasks: number
  totalTasks: number
}

/** حالة دورة الأمان: هل كل الحفظ يُراجع ضمن أقصى مدى (قاعدة عدم النسيان)؟ */
export interface CycleInfo {
  targetDays: number // الهدف: أقصى أيام بين مراجعات أي صفحة
  memorizedTotal: number
  currentCycleDays: number // دورتك الكاملة الفعلية بسعتك الحالية
  requiredDaily: number // الصفحات/اليوم اللازمة لتحقيق الهدف
  coveragePct: number // نسبة الحفظ المراجَع خلال آخر targetDays يوماً (0..1)
  coveredPages: number
  onTrack: boolean // هل الدورة الحالية ضمن الهدف؟
}

/** صفحة تحتاج انتباهك — الأعلى خطورة على النسيان */
export interface AttentionPage {
  page: number
  juz: number
  label: string
  reason: string
  kind: "never" | "overdue" | "weak" | "misses"
  overdueDays: number
  strength: number
}

export interface AppState {
  today: string
  onboarded: boolean
  profile: {
    name: string
    dailyCapacity: number
    unitSize: number
    intensity: Intensity
    autoAdjust: boolean
    timezone: string
    xp: number
    streak: number
    bestStreak: number
    maxGapDays: number
  }
  level: LevelInfo
  plan: PlanDTO | null
  overdueCount: number
  forecast: { date: string; count: number }[]
  activity: ActivityDTO[]
  motivation: { text: string; source: string; kind: "ayah" | "hadith" | "wisdom" }
  memorized: { total: number; strengths: number[] } // strengths[0] = صفحة 1، و -1 تعني غير محفوظة
  cycle: CycleInfo
  attention: AttentionPage[]
  stats: {
    totalDonePages: number
    completionRate: number
    remainingFirstPass: number
    cycleDays: number
    perfectDays: number
  }
  badges: { id: string; earned: boolean }[]
}
