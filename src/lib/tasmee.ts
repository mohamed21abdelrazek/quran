// محرّك تصحيح التسميع الكتابي — «اعرض حفظك على المعلّم»
// مستوحى من محرّكات تصحيح التلاوة (judge.ts من @tilawi/quran-asr
// و matcher.py من IqraAI) ومهيّأ للنص الذي يكتبه الحافظ بيده.

/** إزالة التشكيل والتطويل ورموز الوقف وتوحيد الهمزات والتاء المربوطة */
export function normalizeWord(w: string): string {
  return w
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u06DF\u200C\u200D\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627") // آ أ إ ٱ → ا
    .replace(/\u0629/g, "\u0647") // ة → ه
    .replace(/\u0649/g, "\u064A") // ى → ي
    .replace(/\u0624/g, "\u0648") // ؤ → و
    .replace(/\u0626/g, "\u064A") // ئ → ي
    .replace(/[\u061F\u060C\u002E\u0021\u003B\u003A\u060D]/g, "") // ؟ ، . ! ؛ :
    .trim()
}

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/** نسبة تشابه كلمتين: LCS حرفي × ٢ ÷ (الطولان) — بأسلوب rapidfuzz */
export function wordSimilarity(a: string, b: string): number {
  if (!a) return b ? 0 : 1
  if (!b) return a ? 0 : 1
  if (a === b) return 1
  const m = a.length,
    n = b.length
  // صف واحد يكفي: LCS كلاسيكي
  let prev = new Uint16Array(n + 1)
  let cur = new Uint16Array(n + 1)
  for (let i = 1; i <= m; i++) {
    cur[0] = 0
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    const t = prev
    prev = cur
    cur = t
  }
  return (2 * prev[n]) / (m + n)
}

// ==================== نتيجة الكلمة الواحدة ====================

export type WordVerdict = "ok" | "near" | "wrong"

export interface AlignOp {
  type: WordVerdict | "missing" | "extra"
  /** كلمة المتوقع (بالرسم الأصلي) — موجودة في ok/near/wrong/missing */
  expected?: string
  /** كلمة المستخدم كما كتبها — موجودة في ok/near/wrong/extra */
  user?: string
  /** نسبة التشابه عند near/wrong */
  sim?: number
}

/** تصنيف كلمة واحدة حسب نسبة التشابه (عتبات مستوحاة من Tilawi) */
export function verdictFromSim(sim: number): WordVerdict {
  if (sim >= 0.85) return "ok"
  if (sim >= 0.6) return "near"
  return "wrong"
}

// ==================== المحاذاة الكاملة ====================

export interface TasmeeResult {
  /** العمليات بترتيب القراءة — تمثل سطر التسميع كلمة كلمة */
  ops: AlignOp[]
  /** الدرجة 0..100: الصحيح كامل الوزن، القريب نصف وزن، والزائد لا يعاقب */
  score: number
  counts: { ok: number; near: number; wrong: number; missing: number; extra: number }
  expectedCount: number
}

const GAP = -1.5
const SCORE_OK = 2
const SCORE_NEAR = 1

/**
 * محاذاة Needleman–Wunsch على مستوى الكلمات:
 * المتوقع مقابل ما كتبه الحافظ. تنتج تصنيفاً لكل كلمة:
 * ok (صحيحة) / near (قريبة — راجعها) / wrong (كلمة مكان كلمة)
 * / missing (ساقطة من المتوقع) / extra (زائدة ليس في المتوقع).
 */
export function gradeTasmee(expectedText: string, userText: string): TasmeeResult {
  const exp = splitWords(expectedText)
  const usr = splitWords(userText)
  const ne = exp.map(normalizeWord)
  const nu = usr.map(normalizeWord)

  const m = ne.length
  const n = nu.length
  const expectedCount = m

  if (m === 0 || n === 0) {
    const ops: AlignOp[] = []
    if (m === 0 && n > 0) for (const u of usr) ops.push({ type: "extra", user: u })
    if (n === 0 && m > 0) for (const e of exp) ops.push({ type: "missing", expected: e })
    const counts = countOps(ops)
    return { ops, score: m === 0 ? (n > 0 ? 100 : 0) : 0, counts, expectedCount }
  }

  // مصفوفة البرمجة الديناميكية
  const dp: Float64Array[] = Array.from({ length: m + 1 }, () => new Float64Array(n + 1))
  for (let i = 0; i <= m; i++) dp[i][0] = i * GAP
  for (let j = 0; j <= n; j++) dp[0][j] = j * GAP

  const simCache = new Map<string, number>()
  const simOf = (i: number, j: number) => {
    const k = `${i}:${j}`
    let s = simCache.get(k)
    if (s === undefined) {
      s = ne[i] === nu[j] ? 1 : wordSimilarity(ne[i], nu[j])
      simCache.set(k, s)
    }
    return s
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sim = simOf(i - 1, j - 1)
      const diagScore = sim >= 0.85 ? SCORE_OK : sim >= 0.6 ? SCORE_NEAR : sim >= 0.4 ? -0.5 : -2
      dp[i][j] = Math.max(dp[i - 1][j - 1] + diagScore, dp[i - 1][j] + GAP, dp[i][j - 1] + GAP)
    }
  }

  // التتبع العكسي — ثم عكس القائمة لترتيب القراءة
  const ops: AlignOp[] = []
  let i = m,
    j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sim = simOf(i - 1, j - 1)
      const diagScore = sim >= 0.85 ? SCORE_OK : sim >= 0.6 ? SCORE_NEAR : sim >= 0.4 ? -0.5 : -2
      if (dp[i][j] === dp[i - 1][j - 1] + diagScore) {
        if (sim >= 0.85) ops.push({ type: "ok", expected: exp[i - 1], user: usr[j - 1], sim })
        else if (sim >= 0.6)
          ops.push({ type: "near", expected: exp[i - 1], user: usr[j - 1], sim })
        else ops.push({ type: "wrong", expected: exp[i - 1], user: usr[j - 1], sim })
        i--
        j--
        continue
      }
    }
    if (i > 0 && (j === 0 || dp[i][j] === dp[i - 1][j] + GAP)) {
      ops.push({ type: "missing", expected: exp[i - 1] })
      i--
      continue
    }
    ops.push({ type: "extra", user: usr[j - 1] })
    j--
  }
  ops.reverse()

  const counts = countOps(ops)
  const score = scoreOf(counts, m)
  return { ops, score, counts, expectedCount }
}

function countOps(ops: AlignOp[]): TasmeeResult["counts"] {
  const c = { ok: 0, near: 0, wrong: 0, missing: 0, extra: 0 }
  for (const o of ops) c[o.type]++
  return c
}

/** الدرجة: (الصحيح + نصف القريب) ÷ عدد كلمات المتوقع — الزائد لا يعاقب (مثل IqraAI) */
function scoreOf(c: TasmeeResult["counts"], expectedCount: number): number {
  if (expectedCount === 0) return 100
  const pts = c.ok + 0.5 * c.near
  return Math.max(0, Math.min(100, Math.round((100 * pts) / expectedCount)))
}

/** تلوين كلمة في نتيجة التسميع */
export const VERDICT_CLASS: Record<AlignOp["type"], string> = {
  ok: "text-emerald-700 dark:text-emerald-300",
  near: "text-amber-700 dark:text-amber-300 underline decoration-wavy decoration-amber-500 underline-offset-4",
  wrong: "text-red-700 dark:text-red-400 line-through decoration-red-500/80",
  missing: "text-red-500/90 dark:text-red-400/90",
  extra: "text-amber-600 dark:text-amber-400 underline decoration-dotted underline-offset-4",
}
