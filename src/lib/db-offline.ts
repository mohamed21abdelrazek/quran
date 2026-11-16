// قاعدة بيانات محلية للنسخة الأوفلاين — نفس واجهة Prisma التي يستخدمها المحرك،
// لكن فوق localStorage داخل الجهاز. تُفعَّل عبر تبديل الوحدة في next.config
// (WARDI_OFFLINE=1 يحوّل "@/lib/db" إلى هذا الملف) فتعمل كل طبقة المحرك
// كما هي في المتصفح بلا خادم إطلاقاً.
//
// ملاحظة: كل الدوال تُهيَّأ كسولاً (lazy) — لا يُلمس localStorage عند الاستيراد
// حتى لا تنهار مرحلة التصدير الثابت (SSR) عند بناء النسخة الأوفلاين.

const LS_KEY = "wardi:db:v1"

// ==================== الأنواع ====================

interface ProfileRow {
  id: number
  onboarded: boolean
  name: string
  timezone: string
  dailyCapacity: number
  unitSize: number
  intensity: string
  maxGapDays: number
  autoAdjust: boolean
  xp: number
  streak: number
  bestStreak: number
  lastActiveDate: string | null
  createdAt: Date
  updatedAt: Date
}

interface PageStateRow {
  page: number
  memorized: boolean
  strength: number
  reviews: number
  misses: number
  lastReviewedAt: Date | null
  dueDate: string | null
}

interface TaskRow {
  id: number
  planId: number
  pageFrom: number
  pageTo: number
  status: string
  quality: string | null
  snoozeCount: number
  completedAt: Date | null
}

interface DailyPlanRow {
  id: number
  date: string
  capacity: number
  status: string
  note: string | null
  generatedAt: Date
  tasks?: TaskRow[]
}

interface ActivityRow {
  id: number
  date: string
  donePages: number
  doneTasks: number
  missedPages: number
  totalTasks: number
  xpGained: number
}

interface DifficultWordRow {
  id: number
  key: string
  word: string
  surah: number
  ayah: number
  page: number
  createdAt: Date
}

interface BookmarkRow {
  page: number
  createdAt: Date
}

interface QuizLogRow {
  id: number
  date: string
  kind: string
  score: number
  correct: number
  total: number
  detail: string | null
  createdAt: Date
}

interface DbData {
  profile: ProfileRow[]
  pageState: PageStateRow[]
  dailyPlan: DailyPlanRow[]
  task: TaskRow[]
  activity: ActivityRow[]
  difficultWord: DifficultWordRow[]
  bookmark: BookmarkRow[]
  quizLog: QuizLogRow[]
  _seq: Record<string, number>
}

// حقول DateTime لكل نموذج — تُحوَّل من/إلى ISO عند التخزين
const DATE_FIELDS: Record<string, string[]> = {
  profile: ["createdAt", "updatedAt"],
  pageState: ["lastReviewedAt"],
  dailyPlan: ["generatedAt"],
  task: ["completedAt"],
  activity: [],
  difficultWord: ["createdAt"],
  bookmark: ["createdAt"],
  quizLog: ["createdAt"],
}

// ==================== التخزين ====================

let cache: DbData | null = null

function emptyDb(): DbData {
  return {
    profile: [],
    pageState: [],
    dailyPlan: [],
    task: [],
    activity: [],
    difficultWord: [],
    bookmark: [],
    quizLog: [],
    _seq: {},
  }
}

function load(): DbData {
  if (cache) return cache
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as DbData
      cache = { ...emptyDb(), ...parsed }
      // إحياء حقول التواريخ
      for (const [model, fields] of Object.entries(DATE_FIELDS)) {
        for (const row of (cache as unknown as Record<string, unknown[]>[])[model] ?? []) {
          for (const f of fields) {
            const v = (row as Record<string, unknown>)[f]
            if (typeof v === "string") (row as Record<string, unknown>)[f] = new Date(v)
          }
        }
      }
      return cache
    }
  } catch {
    /* لقطة تالفة — نبدأ من جديد */
  }
  cache = emptyDb()
  return cache
}

function persist(): void {
  if (!cache) return
  try {
    if (typeof localStorage === "undefined") return
    localStorage.setItem(LS_KEY, JSON.stringify(cache))
  } catch {
    /* التخزين ممتلئ — نتجاهل بهدوء */
  }
}

// نسخة عميقة آمنة للإرجاع (كما يفعل Prisma: كل استدعاء يعيد كائناً مستقلاً)
function copy<T>(row: T): T {
  return JSON.parse(
    JSON.stringify(row, (_k, v) => (v instanceof Date ? v.toISOString() : v)),
    (_k, v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(v) ? new Date(v) : v),
  ) as T
}

function nextId(model: string): number {
  const d = load()
  d._seq[model] = (d._seq[model] ?? 0) + 1
  return d._seq[model]
}

// ==================== مطابقة الشروط (where) ====================

type AnyRow = Record<string, unknown>

function matches(row: AnyRow, cond: unknown): boolean {
  if (!cond || typeof cond !== "object") return true
  for (const [key, want] of Object.entries(cond as Record<string, unknown>)) {
    if (want === undefined) continue
    if (key === "plan") {
      // شرط علائقي على مهمة: طبّقه على خطة المهمة
      const plan = load().dailyPlan.find((p) => p.id === row.planId)
      if (!plan || !matches(plan as unknown as AnyRow, want)) return false
      continue
    }
    if (want !== null && typeof want === "object" && !Array.isArray(want)) {
      const op = want as Record<string, unknown>
      const got = row[key]
      if ("in" in op) {
        if (!Array.isArray(op.in) || !op.in.includes(got as never)) return false
        continue
      }
      const num = (x: unknown): number | null =>
        typeof x === "number" ? x : typeof x === "string" && x ? Number(x) : null
      const g = num(got)
      if ("lt" in op && !(g !== null && num(op.lt) !== null && g < (num(op.lt) as number))) return false
      if ("gt" in op && !(g !== null && num(op.gt) !== null && g > (num(op.gt) as number))) return false
      if ("gte" in op && !(g !== null && num(op.gte) !== null && g >= (num(op.gte) as number))) return false
      continue
    }
    // مساواة مباشرة (يشمل null وboolean وnumber وstring)
    if (row[key] !== want) return false
  }
  return true
}

function matchesWhere(rows: AnyRow[], where: unknown): AnyRow[] {
  return rows.filter((r) => matches(r, where))
}

// ==================== تطبيق التحديثات (data) ====================

function applyUpdate(row: AnyRow, data: Record<string, unknown>): void {
  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue
    if (val !== null && typeof val === "object" && !Array.isArray(val) && "increment" in (val as Record<string, unknown>)) {
      const inc = (val as { increment: number }).increment
      row[key] = (typeof row[key] === "number" ? (row[key] as number) : 0) + inc
    } else {
      row[key] = val instanceof Date ? new Date(val.getTime()) : val
    }
  }
}

// ==================== الترتيب والتضمين ====================

function sortRows(rows: AnyRow[], orderBy?: Record<string, string>): AnyRow[] {
  if (!orderBy) return rows
  const [field, dir] = Object.entries(orderBy)[0] ?? [null, "asc"]
  if (!field) return rows
  const s = [...rows].sort((a, b) => {
    const av = a[field] as never
    const bv = b[field] as never
    return av < bv ? -1 : av > bv ? 1 : 0
  })
  return dir === "desc" ? s.reverse() : s
}

function withIncludes(model: string, row: AnyRow, include?: Record<string, boolean>): AnyRow {
  if (!include) return row
  const out = { ...row }
  if (model === "task" && include.plan) {
    out.plan = load().dailyPlan.find((p) => p.id === row.planId) ?? null
  }
  if (model === "dailyPlan" && include.tasks) {
    // بترتيب الإدراج (= ترتيب المعرفات) — ثابت ومطابق لسلوك الاستخدام
    out.tasks = load().task.filter((t) => t.planId === row.id).map((t) => ({ ...t }))
  }
  return out
}

// ==================== القيم الافتراضية عند الإنشاء (مطابقة لـ schema.prisma) ====================

function defaultsFor(model: string): AnyRow {
  const now = new Date()
  switch (model) {
    case "profile":
      return {
        id: 1, onboarded: false, name: "", timezone: "Africa/Cairo", dailyCapacity: 3,
        unitSize: 1, intensity: "balanced", maxGapDays: 10, autoAdjust: true, xp: 0,
        streak: 0, bestStreak: 0, lastActiveDate: null, createdAt: now, updatedAt: now,
      }
    case "pageState":
      return { page: 0, memorized: false, strength: 0, reviews: 0, misses: 0, lastReviewedAt: null, dueDate: null }
    case "dailyPlan":
      return { id: 0, date: "", capacity: 0, status: "open", note: null, generatedAt: now, tasks: [] }
    case "task":
      return { id: 0, planId: 0, pageFrom: 1, pageTo: 1, status: "pending", quality: null, snoozeCount: 0, completedAt: null }
    case "activity":
      return { id: 0, date: "", donePages: 0, doneTasks: 0, missedPages: 0, totalTasks: 0, xpGained: 0 }
    case "difficultWord":
      return { id: 0, key: "", word: "", surah: 0, ayah: 0, page: 1, createdAt: now }
    case "bookmark":
      return { page: 0, createdAt: now }
    case "quizLog":
      return { id: 0, date: "", kind: "cards", score: 0, correct: 0, total: 0, detail: null, createdAt: now }
    default:
      return {}
  }
}

function createRow(model: string, data: Record<string, unknown>): AnyRow {
  const row = { ...defaultsFor(model), ...data } as AnyRow
  const seqModels: Record<string, string> = {
    dailyPlan: "id", task: "id", activity: "id", difficultWord: "id", quizLog: "id",
  }
  if (seqModels[model]) row[seqModels[model]] = nextId(model)
  if (model === "profile" && row.id === undefined) row.id = 1
  return row
}

function table(model: string): AnyRow[] {
  return (load() as unknown as Record<string, AnyRow[]>)[model]
}

function errMissing(): never {
  throw new Error("P2025: السجل غير موجود") // مطابق لسلوك Prisma update/delete على سجل مفقود
}

// ==================== الواجهة العامة — نفس استدعاءات المحرك ====================

function makeModel(model: string) {
  return {
    findUnique(args: { where: Record<string, unknown>; include?: Record<string, boolean> }): Promise<unknown> {
      const rows = table(model)
      let hit: AnyRow | undefined
      const w = args?.where ?? {}
      if (model === "difficultWord" && w.key_word) {
        // مفتاح مركّب فريد: {key, word}
        const { key, word } = w.key_word as { key: string; word: string }
        hit = rows.find((r) => r.key === key && r.word === word)
      } else {
        hit = rows.find((r) => matches(r, w))
      }
      if (!hit) return Promise.resolve(null)
      return Promise.resolve(copy(withIncludes(model, hit, args?.include)))
    },

    findMany(args?: {
      where?: Record<string, unknown>
      orderBy?: Record<string, string>
      take?: number
      include?: Record<string, boolean>
    }): Promise<unknown[]> {
      let rows = matchesWhere(table(model), args?.where ?? undefined)
      rows = sortRows(rows, args?.orderBy)
      if (typeof args?.take === "number" && args.take > 0) rows = rows.slice(0, args.take)
      return Promise.resolve(rows.map((r) => copy(withIncludes(model, r, args?.include))))
    },

    create(args: { data: Record<string, unknown> }): Promise<unknown> {
      const data = { ...(args.data as Record<string, unknown>) }
      // إنشاء علائقي متداخل: tasks: { create: [...] } داخل خطة
      let nestedTasks: Record<string, unknown>[] | null = null
      if (model === "dailyPlan" && data.tasks && typeof data.tasks === "object" && "create" in (data.tasks as object)) {
        nestedTasks = (data.tasks as { create: Record<string, unknown>[] }).create
        delete data.tasks
      }
      const row = createRow(model, data)
      table(model).push(row)
      if (model === "dailyPlan" && nestedTasks) {
        const created: AnyRow[] = []
        for (const t of nestedTasks) {
          const taskRow = createRow("task", { ...t, planId: row.id })
          table("task").push(taskRow)
          created.push(taskRow)
        }
        ;(row as { tasks?: unknown }).tasks = created
      }
      persist()
      return Promise.resolve(copy(row))
    },

    createMany(args: { data: Record<string, unknown>[] }): Promise<unknown> {
      for (const item of args.data) {
        table(model).push(createRow(model, item))
      }
      persist()
      return Promise.resolve({ count: args.data.length })
    },

    update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown> {
      const rows = table(model)
      let hit: AnyRow | undefined
      const w = args.where ?? {}
      if (model === "difficultWord" && w.key_word) {
        const { key, word } = w.key_word as { key: string; word: string }
        hit = rows.find((r) => r.key === key && r.word === word)
      } else {
        hit = rows.find((r) => matches(r, w))
      }
      if (!hit) errMissing()
      applyUpdate(hit, args.data ?? {})
      if (model === "profile") hit.updatedAt = new Date() // @updatedAt
      persist()
      return Promise.resolve(copy(hit))
    },

    updateMany(args: { where?: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown> {
      const hits = matchesWhere(table(model), args?.where ?? undefined)
      for (const hit of hits) {
        applyUpdate(hit, args.data ?? {})
        if (model === "profile") hit.updatedAt = new Date()
      }
      if (hits.length > 0) persist()
      return Promise.resolve({ count: hits.length })
    },

    upsert(args: {
      where: Record<string, unknown>
      update: Record<string, unknown>
      create: Record<string, unknown>
    }): Promise<unknown> {
      const rows = table(model)
      const w = args.where ?? {}
      let hit: AnyRow | undefined
      if (model === "difficultWord" && w.key_word) {
        const { key, word } = w.key_word as { key: string; word: string }
        hit = rows.find((r) => r.key === key && r.word === word)
      } else {
        hit = rows.find((r) => matches(r, w))
      }
      if (hit) {
        applyUpdate(hit, args.update ?? {})
        if (model === "profile") hit.updatedAt = new Date()
        persist()
        return Promise.resolve(copy(hit))
      }
      const row = createRow(model, { ...args.create })
      rows.push(row)
      persist()
      return Promise.resolve(copy(row))
    },

    delete(args: { where: Record<string, unknown> }): Promise<unknown> {
      const rows = table(model)
      const w = args.where ?? {}
      let idx: number
      if (model === "difficultWord" && w.key_word) {
        const { key, word } = w.key_word as { key: string; word: string }
        idx = rows.findIndex((r) => r.key === key && r.word === word)
      } else {
        idx = rows.findIndex((r) => matches(r, w))
      }
      if (idx < 0) errMissing()
      const [removed] = rows.splice(idx, 1)
      // حذف متسلسل: حذف خطة يحذف مهامها (Cascade) — مطابق للمخطط
      if (model === "dailyPlan") {
        const d = load()
        d.task = d.task.filter((t) => t.planId !== removed.id)
      }
      persist()
      return Promise.resolve(copy(removed))
    },

    deleteMany(args?: { where?: Record<string, unknown> }): Promise<unknown> {
      const rows = table(model)
      const hits = matchesWhere(rows, args?.where ?? undefined)
      const d = load()
      ;(d as unknown as Record<string, AnyRow[]>)[model] = rows.filter((r) => !hits.includes(r))
      if (model === "dailyPlan") {
        const ids = new Set(hits.map((h) => h.id))
        d.task = d.task.filter((t) => !ids.has(t.planId))
      }
      persist()
      return Promise.resolve({ count: hits.length })
    },
  }
}

/** نفس شكل `db` في Prisma — يستبدله المحرك في نسخة الأوفلاين */
export const db = {
  profile: makeModel("profile"),
  pageState: makeModel("pageState"),
  dailyPlan: makeModel("dailyPlan"),
  task: makeModel("task"),
  activity: makeModel("activity"),
  difficultWord: makeModel("difficultWord"),
  bookmark: makeModel("bookmark"),
  quizLog: makeModel("quizLog"),
}
