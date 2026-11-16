// أدوات الحفظ — طبقة فوق محرك الخطة:
// كلمات صعبة، علامات مرجعية، وسجل جلسات الاختبار والتسميع.
// لا تلمس منطق الجدولة إطلاقاً.
import { db } from "@/lib/db"
import { getProfile, todayStr } from "./engine"

// ==================== كلمات صعبة ====================

export async function addDifficultWord(input: {
  key: string
  word: string
  surah: number
  ayah: number
  page: number
}) {
  if (!input.key || !input.word) return { ok: false, error: "بيانات ناقصة" }
  const key = input.key.replace(/[^\d:]/g, "")
  const [s, n] = key.split(":").map(Number)
  if (!s || !n) return { ok: false, error: "مفتاح آية غير صالح" }

  await db.difficultWord.upsert({
    where: { key_word: { key, word: input.word } },
    update: {},
    create: {
      key,
      word: input.word,
      surah: s,
      ayah: n,
      page: Math.min(Math.max(1, input.page | 0), 604),
    },
  })
  return { ok: true }
}

export async function removeDifficultWord(id: number) {
  await db.difficultWord.delete({ where: { id } }).catch(() => {})
  return { ok: true }
}

// ==================== علامات مرجعية ====================

export async function toggleBookmark(page: number) {
  const p = Math.min(Math.max(1, page | 0), 604)
  const existing = await db.bookmark.findUnique({ where: { page: p } })
  if (existing) {
    await db.bookmark.delete({ where: { page: p } })
    return { ok: true, page: p, marked: false }
  }
  await db.bookmark.create({ data: { page: p } })
  return { ok: true, page: p, marked: true }
}

// ==================== سجل الاختبار والتسميع ====================

/** منح خبرة الجلسة: بطاقات ×٢ لكل صحيحة (حد ٢٠) — تسميع حسب الدرجة (حد ١٢) */
function quizXp(kind: string, score: number, correct: number): number {
  if (kind === "cards") return Math.min(20, Math.max(0, correct) * 2)
  return Math.min(12, Math.max(1, Math.round(Math.max(0, Math.min(100, score)) / 9)))
}

export async function logQuiz(input: {
  kind: string
  score: number
  correct: number
  total: number
  detail?: string
}) {
  const kind = input.kind === "cards" || input.kind === "tasmee" ? input.kind : "cards"
  const score = Math.max(0, Math.min(100, input.score | 0))
  const correct = Math.max(0, input.correct | 0)
  const total = Math.max(0, input.total | 0)
  const detail = (input.detail ?? "").slice(0, 120)

  const profile = await getProfile()
  const today = todayStr(profile.timezone)
  const xpGain = quizXp(kind, score, correct)

  await db.quizLog.create({
    data: { date: today, kind, score, correct, total, detail },
  })

  await db.activity.upsert({
    where: { date: today },
    update: { xpGained: { increment: xpGain } },
    create: { date: today, xpGained: xpGain },
  })

  await db.profile.update({ where: { id: 1 }, data: { xp: { increment: xpGain } } })

  return { ok: true, xpGain }
}

// ==================== الحالة ====================

export interface DifficultWordDTO {
  id: number
  key: string
  word: string
  surah: number
  ayah: number
  page: number
}

export interface QuizSessionDTO {
  id: number
  date: string
  kind: string
  score: number
  correct: number
  total: number
  detail: string | null
}

export interface QuizState {
  recent: QuizSessionDTO[]
  totalSessions: number
  avgScore: number
  bestScore: number
}

export async function getToolsState() {
  const [difficultRows, bookmarkRows, quizRows] = await Promise.all([
    db.difficultWord.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    db.bookmark.findMany({ orderBy: { page: "asc" } }),
    db.quizLog.findMany({ orderBy: { createdAt: "desc" } }),
  ])

  const difficult: DifficultWordDTO[] = difficultRows.map((d) => ({
    id: d.id,
    key: d.key,
    word: d.word,
    surah: d.surah,
    ayah: d.ayah,
    page: d.page,
  }))

  const quizScores = quizRows.filter((q) => q.total > 0)
  const quiz: QuizState = {
    recent: quizRows.slice(0, 12).map((q) => ({
      id: q.id,
      date: q.date,
      kind: q.kind,
      score: q.score,
      correct: q.correct,
      total: q.total,
      detail: q.detail,
    })),
    totalSessions: quizRows.length,
    avgScore: quizScores.length ? Math.round(quizScores.reduce((s, q) => s + q.score, 0) / quizScores.length) : 0,
    bestScore: quizScores.length ? Math.max(...quizScores.map((q) => q.score)) : 0,
  }

  return { difficult, bookmarks: bookmarkRows.map((b) => b.page), quiz }
}
