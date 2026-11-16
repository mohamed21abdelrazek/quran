// الطبقة المحلية للنسخة الأوفلاين — تحل محل نداءات HTTP:
// نفس التحقق الذي تفعله مسارات API يتم هنا، ثم تستدعى دوال المحرك مباشرة.
// تعمل بلا خادم إطلاقاً: البيانات في localStorage عبر db-offline.

import { buildAppState, cannotToday, updateRanges, applyOnboarding, resetAll, completeTask, snoozeTask, getProfile } from "@/lib/engine"
import { addDifficultWord, removeDifficultWord, toggleBookmark, logQuiz } from "@/lib/tools"
import { db } from "@/lib/db"
import { MAX_CAPACITY, MAX_UNIT_SIZE, type Intensity, type Quality } from "@/lib/content"
import type { AppState } from "@/lib/types"

export type BackendMode = "offline"

export const backendMode: BackendMode = "offline"

/** تحميل حالة التطبيق — مباشرة من المحرك */
export async function backendLoad(): Promise<AppState> {
  return buildAppState()
}

function bad(msg: string): never {
  throw new Error(msg)
}

function validateRanges(ranges: unknown): ranges is { from: number; to: number }[] {
  return (
    Array.isArray(ranges) &&
    ranges.every(
      (r) =>
        Number.isInteger(r?.from) &&
        Number.isInteger(r?.to) &&
        r.from >= 1 &&
        r.to <= 604 &&
        r.from <= r.to
    )
  )
}

/** تنفيذ إجراء محلياً — نفس خريطة مسارات API */
export async function backendAction(url: string, body: unknown): Promise<Record<string, unknown>> {
  const b = (body ?? {}) as Record<string, unknown>

  switch (url) {
    case "/api/onboarding": {
      const { name, ranges, baseline, dailyCapacity, unitSize, intensity, maxGapDays, autoAdjust } = b as {
        name?: string
        ranges?: { from: number; to: number }[]
        baseline?: number
        dailyCapacity?: number
        unitSize?: number
        intensity?: Intensity
        maxGapDays?: number
        autoAdjust?: boolean
      }
      if (!ranges || ranges.length === 0) bad("اختر صفحاتك المحفوظة أولاً")
      for (const r of ranges) {
        if (!Number.isInteger(r?.from) || !Number.isInteger(r?.to) || r.from < 1 || r.to > 604 || r.from > r.to) {
          bad("نطاق صفحات غير صالح")
        }
      }
      return applyOnboarding({
        name: (name ?? "").toString().slice(0, 40),
        ranges,
        baseline: Math.max(0, Math.min(4, Number(baseline ?? 0))),
        dailyCapacity: Math.max(1, Math.min(MAX_CAPACITY, Number(dailyCapacity ?? 3))),
        unitSize: Math.max(1, Math.min(MAX_UNIT_SIZE, Number(unitSize ?? 1))),
        intensity: (intensity ?? "balanced") as Intensity,
        maxGapDays: Math.max(3, Math.min(30, Number(maxGapDays ?? 10))),
        autoAdjust: autoAdjust !== false,
      })
    }

    case "/api/task": {
      const { taskId, action, quality } = b as {
        taskId?: number
        action?: "complete" | "snooze"
        quality?: Quality
      }
      if (!taskId || !action) bad("طلب غير صالح")
      if (action === "complete") {
        const q: Quality = quality === "perfect" || quality === "good" || quality === "hard" ? quality : "good"
        return completeTask(taskId, q)
      }
      if (action === "snooze") return snoozeTask(taskId)
      bad("إجراء غير معروف")
    }

    case "/api/day": {
      if (b.action !== "cannot") bad("إجراء غير معروف")
      return cannotToday()
    }

    case "/api/ranges": {
      const add = (b.add ?? []) as { from: number; to: number }[]
      const remove = (b.remove ?? []) as { from: number; to: number }[]
      if (!validateRanges(add) || !validateRanges(remove)) bad("نطاق صفحات غير صالح")
      return updateRanges(add, remove)
    }

    case "/api/settings": {
      const { name, dailyCapacity, unitSize, intensity, maxGapDays, autoAdjust, timezone } = b as {
        name?: string
        dailyCapacity?: number
        unitSize?: number
        intensity?: Intensity
        maxGapDays?: number
        autoAdjust?: boolean
        timezone?: string
      }
      const data: Record<string, string | number | boolean> = {}
      if (typeof name === "string") data.name = name.slice(0, 40)
      if (dailyCapacity !== undefined) data.dailyCapacity = Math.max(1, Math.min(MAX_CAPACITY, Number(dailyCapacity)))
      if (unitSize !== undefined) data.unitSize = Math.max(1, Math.min(MAX_UNIT_SIZE, Number(unitSize)))
      if (intensity === "relaxed" || intensity === "balanced" || intensity === "intensive") {
        data.intensity = intensity
      }
      if (maxGapDays !== undefined) data.maxGapDays = Math.max(3, Math.min(30, Number(maxGapDays)))
      if (autoAdjust !== undefined) data.autoAdjust = Boolean(autoAdjust)
      if (typeof timezone === "string" && timezone.length < 60) {
        try {
          new Intl.DateTimeFormat("en-CA", { timeZone: timezone })
          data.timezone = timezone
        } catch {
          /* تجاهل المنطقة غير الصالحة */
        }
      }
      await getProfile()
      if (Object.keys(data).length > 0) {
        await db.profile.update({ where: { id: 1 }, data })
      }
      return { ok: true }
    }

    case "/api/reset": {
      return resetAll()
    }

    case "/api/bookmarks": {
      const { page } = b as { page?: number }
      if (!page) bad("رقم صفحة مفقود")
      return toggleBookmark(page)
    }

    case "/api/difficult": {
      if (b.action === "add") {
        const { key, word, surah, ayah, page } = b as {
          key?: string
          word?: string
          surah?: number
          ayah?: number
          page?: number
        }
        const result = await addDifficultWord({
          key: key ?? "",
          word: (word ?? "").trim(),
          surah: surah ?? 0,
          ayah: ayah ?? 0,
          page: page ?? 1,
        })
        if (!result.ok) bad(result.error ?? "بيانات ناقصة")
        return result
      }
      if (b.action === "remove") {
        const { id } = b as { id?: number }
        if (!id) bad("معرّف مفقود")
        return removeDifficultWord(id)
      }
      bad("إجراء غير معروف")
    }

    case "/api/quiz": {
      const { kind, score, correct, total, detail } = b as {
        kind?: string
        score?: number
        correct?: number
        total?: number
        detail?: string
      }
      if (!kind || typeof score !== "number" || typeof correct !== "number" || typeof total !== "number") {
        bad("بيانات الجلسة ناقصة")
      }
      return logQuiz({ kind, score, correct, total, detail: detail ?? "" })
    }

    default:
      bad("إجراء غير معروف")
  }
}
