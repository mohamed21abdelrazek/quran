// محرّك المطابقة اللحظية — قلب وضع ترتيل (مستوحى من بنية Tarteel/IqraAI):
// مؤشّر يتقدّم على كلمات الصفحة، نافذة منزلقة للبحث، تسامح مع تشابه اللفظ،
// كشف القفز (تخطي كلمات) والخطأ المتكرر مع تنبيه فوري

import { normalizeWord, splitWords, wordSimilarity } from "./tasmee"

/** حالة الكلمة في التتبّع اللحظي */
export type LiveWordState = "pending" | "matched" | "near" | "skipped"

/** خطأ مسجّل: كلمة متوقعة سمعنا بدلها / قُفزت */
export interface LiveMistake {
  index: number
  expected: string
  heard: string
  /** نوع الخطأ: قريب اللفظ / قفز */
  kind: "near" | "skip"
}

/** نتيجة تغذية مقطع مسموع */
export interface LiveFeedResult {
  /** تقدّم المؤشّر أو تغيّرت حالات */
  changed: boolean
  /** تنبيه: كلمات خاطئة متتالية — الكلمة المنتظرة على الأرجح خطأ */
  alert: boolean
  /** فهرس الكلمة المنتظرة عند التنبيه (لإظهارها وميضاً) */
  alertWord: number | null
  /** اكتملت الصفحة */
  completed: boolean
}

/** ملخص الجلسة */
export interface LiveSummary {
  score: number
  matched: number
  near: number
  skipped: number
  pending: number
  totalReal: number
  mistakes: LiveMistake[]
}

/** حجم نافذة البحث المنزلقة — كم كلمة قادمة نقارن معها */
const WINDOW = 6
/** عتبة القبول: تطابق أو قريب */
const SIM_ACCEPT = 0.72
/** عتبة التطابق التام (فوقها «صحيحة») */
const SIM_EXACT = 0.87

export class LiveMatcher {
  private raw: string[]
  private norm: string[]
  /** كلمة حقيقية (ليست علامة وقف) */
  private real: boolean[]
  private states: LiveWordState[]
  private ptr = 0
  private wrongStreak = 0
  private lastMatched: number[] = []
  mistakes: LiveMistake[] = []

  constructor(expectedText: string) {
    this.raw = splitWords(expectedText)
    this.norm = this.raw.map(normalizeWord)
    this.real = this.norm.map((w) => w.length > 0)
    this.states = this.raw.map(() => "pending")
  }

  /** فهرس الكلمة الحقيقية المنتظرة التالية (تخطي علامات الوقف) */
  get pointer(): number {
    return this.nextReal(this.ptr)
  }

  private nextReal(from: number): number {
    let i = from
    while (i < this.real.length && !this.real[i]) i++
    return i
  }

  getStates(): LiveWordState[] {
    return [...this.states]
  }

  isDone(): boolean {
    return this.nextReal(this.ptr) >= this.real.length
  }

  /**
   * تغذية مقطع مسموع (نص مفرّغ): يحرّك المؤشّر على الكلمات المطابقة،
   * يعلّم المتطابقة والقريبة والقافزة، وينبّه عند الخطأ المتكرر.
   */
  feed(chunkText: string): LiveFeedResult {
    const heard = splitWords(chunkText)
      .map((w) => ({ raw: w, norm: normalizeWord(w) }))
      .filter((w) => w.norm.length > 0)

    let changed = false
    let alert = false
    let alertWord: number | null = null

    for (let k = 0; k < heard.length; k++) {
      const hw = heard[k]
      // كشف تكرار حدود المقاطع: خدمة التفريغ تعيد أحياناً آخر كلمة من المقطع السابق —
      // نتجاهلها فقط إن كانت في أول كلمتين من هذا المقطع وتطابق آخر ما قُبل (تكرار قرآني مشروع بعدها يُقبل)
      const atChunkStart = k < 2
      if (atChunkStart && this.lastMatched.slice(-2).some((i) => this.norm[i] === hw.norm)) continue

      // نافذة منزلقة: الكلمات الحقيقية القادمة فقط
      const windowIdx: number[] = []
      {
        let i = this.nextReal(this.ptr)
        while (i < this.real.length && windowIdx.length < WINDOW) {
          windowIdx.push(i)
          i = this.nextReal(i + 1)
        }
      }
      if (windowIdx.length === 0) break // انتهت الصفحة

      let best = -1
      let bestSim = 0
      for (const i of windowIdx) {
        const sim = this.norm[i] === hw.norm ? 1 : wordSimilarity(this.norm[i], hw.norm)
        if (sim > bestSim) {
          bestSim = sim
          best = i
        }
      }

      if (best >= 0 && bestSim >= SIM_ACCEPT) {
        // القفز: كلمات بين المؤشّر والمطابقة قُفزت — علّمها
        for (let i = this.nextReal(this.ptr); i < best; i = this.nextReal(i + 1)) {
          if (this.states[i] === "pending") {
            this.states[i] = "skipped"
            this.mistakes.push({ index: i, expected: this.raw[i], heard: "—", kind: "skip" })
            changed = true
          }
        }
        // علامات الوقف بينهما تُعتبر مجتازة تلقائياً
        this.states[best] = bestSim >= SIM_EXACT ? "matched" : "near"
        if (bestSim < SIM_EXACT) {
          this.mistakes.push({ index: best, expected: this.raw[best], heard: hw.raw, kind: "near" })
        }
        this.lastMatched.push(best)
        if (this.lastMatched.length > 3) this.lastMatched.shift()
        this.ptr = best + 1
        this.wrongStreak = 0
        changed = true
      } else {
        // لا مطابقة في النافذة — كلمة دخيلة أو لفظ خاطئ
        this.wrongStreak++
        if (this.wrongStreak >= 2) {
          alert = true
          alertWord = this.pointer
          this.wrongStreak = 0 // نبّه مرة ثم ابدأ العد من جديد
        }
      }
    }

    return {
      changed,
      alert,
      alertWord,
      completed: this.isDone(),
    }
  }

  summary(): LiveSummary {
    let matched = 0
    let near = 0
    let skipped = 0
    let pending = 0
    let totalReal = 0
    for (let i = 0; i < this.raw.length; i++) {
      if (!this.real[i]) continue
      totalReal++
      const st = this.states[i]
      if (st === "matched") matched++
      else if (st === "near") near++
      else if (st === "skipped") skipped++
      else pending++
    }
    const score = totalReal === 0 ? 100 : Math.max(0, Math.min(100, Math.round((100 * (matched + 0.5 * near)) / totalReal)))
    return { score, matched, near, skipped, pending, totalReal, mistakes: this.mistakes }
  }
}
