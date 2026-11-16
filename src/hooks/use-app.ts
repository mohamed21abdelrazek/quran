"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import type { AppState, TaskDTO } from "@/lib/types"

const LS_STATE = "wardi:state:v1"
const LS_QUEUE = "wardi:queue:v1"

interface QueueItem {
  url: string
  body: unknown
  ts: number
}

function readQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(LS_QUEUE)
    if (!raw) return []
    const q = JSON.parse(raw) as QueueItem[]
    return Array.isArray(q) ? q : []
  } catch {
    return []
  }
}

function writeQueue(q: QueueItem[]) {
  try {
    localStorage.setItem(LS_QUEUE, JSON.stringify(q))
  } catch {
    /* التخزين ممتلئ — نتجاهل بهدوء */
  }
}

export function useApp() {
  const { toast } = useToast()
  const [state, setState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const flushing = useRef(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/app", { cache: "no-store" })
      if (!res.ok) throw new Error("bad response")
      const data: AppState = await res.json()
      setState(data)
      setError(null)
      setOffline(false)
      // لقطة أوفلاين: تُقرأ عند أي انقطاع قادم
      try {
        localStorage.setItem(LS_STATE, JSON.stringify(data))
      } catch {
        /* تجاهل */
      }
    } catch {
      // انقطاع الاتصال: استخدم آخر لقطة محفوظة (المصحف والمتشابهات محليان أصلاً)
      try {
        const snap = localStorage.getItem(LS_STATE)
        if (snap) {
          setState(JSON.parse(snap) as AppState)
          setError(null)
          setOffline(true)
          return
        }
      } catch {
        /* لقطة تالفة — نسقط للخطأ */
      }
      setError("تعذر الاتصال بالخادم، حاول تحديث الصفحة")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /**
   * تنفيذ إجراء — وعند انقطاع الاتصال يُحفظ في قائمة انتظار
   * محلية ويُرسل تلقائياً فور عودة الشبكة.
   */
  const action = useCallback(async (url: string, body: unknown): Promise<Record<string, unknown>> => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        throw new Error((data?.error as string) ?? "حدث خطأ غير متوقع")
      }
      return data
    } catch (e) {
      // فشل شبكي (انقطاع اتصال أو خادم غير متاح) — ضعه في قائمة الانتظار
      if (e instanceof TypeError) {
        const q = readQueue()
        const b = body as { taskId?: number; action?: string } | null
        if (b && typeof b.taskId === "number" && b.action) {
          const dup = q.some((it) => {
            const ib = it.body as { taskId?: number; action?: string } | null
            return it.url === url && ib?.taskId === b.taskId && ib?.action === b.action
          })
          if (dup) return { queued: true, duplicate: true }
        }
        q.push({ url, body, ts: Date.now() })
        writeQueue(q)
        return { queued: true }
      }
      throw e
    }
  }, [])

  /** تعديل محلي فوري لمهمة — ينعكس في الواجهة واللقطة الأوفلاين حتى تتم المزامنة */
  const patchTask = useCallback((taskId: number, status: "done" | "snoozed", quality?: TaskDTO["quality"]) => {
    const apply = (s: AppState): AppState =>
      !s.plan
        ? s
        : {
            ...s,
            plan: {
              ...s.plan,
              tasks: s.plan.tasks.map((t) => (t.id === taskId ? { ...t, status, quality: quality ?? t.quality } : t)),
            },
          }
    setState((prev) => (prev ? apply(prev) : prev))
    try {
      const snap = localStorage.getItem(LS_STATE)
      if (snap) {
        const data = JSON.parse(snap) as AppState
        localStorage.setItem(LS_STATE, JSON.stringify(apply(data)))
      }
    } catch {
      /* تجاهل */
    }
  }, [])

  /** إرسال كل الإجراءات المؤجلة — يُستدعى تلقائياً عند عودة الاتصال */
  const flushQueue = useCallback(async () => {
    if (flushing.current) return
    const items = readQueue()
    if (items.length === 0) return
    flushing.current = true
    const remaining = [...items]
    let synced = 0
    while (remaining.length > 0) {
      const it = remaining[0]
      try {
        // أي استجابة من الخادم (حتى 4xx) تعني الاستلام — لا نعيد الإرسال أبداً
        await fetch(it.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(it.body),
        })
        remaining.shift()
        synced++
        writeQueue(remaining)
      } catch {
        break // ما زال بلا اتصال — المحاولة التالية عند العودة
      }
    }
    writeQueue(remaining)
    flushing.current = false
    if (synced > 0) {
      toast({
        title: "تمت المزامنة",
        description:
          synced === 1 ? "أُرسل إجراءك المحفوظ تلقائياً" : `أُرسلت ${synced} إجراءات محفوظة تلقائياً`,
      })
      load()
    }
  }, [load, toast])

  // تحديث تلقائي عند العودة إلى التبويب (ومحاولة مزامنة ما تبقى)
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        load()
        flushQueue()
      }
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [load, flushQueue])

  // أحداث الاتصال + مزامنة أولية (لاسترجاع ما فات أثناء إغلاق التطبيق)
  useEffect(() => {
    const goOnline = () => {
      setOffline(false)
      flushQueue()
    }
    const goOffline = () => setOffline(true)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    if (navigator.onLine) {
      flushQueue()
    } else {
      setOffline(true)
    }
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [flushQueue])

  return { state, loading, error, offline, load, action, patchTask, flushQueue }
}

export async function fireConfetti() {
  const confetti = (await import("canvas-confetti")).default
  const colors = ["#059669", "#D97706", "#F59E0B", "#10B981", "#FBBF24"]
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.7 }, colors })
  setTimeout(() => {
    confetti({ particleCount: 55, angle: 60, spread: 60, origin: { x: 0, y: 0.8 }, colors })
    confetti({ particleCount: 55, angle: 120, spread: 60, origin: { x: 1, y: 0.8 }, colors })
  }, 220)
}
