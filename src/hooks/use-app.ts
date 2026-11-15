"use client"

import { useCallback, useEffect, useState } from "react"
import type { AppState } from "@/lib/types"

export function useApp() {
  const [state, setState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/app", { cache: "no-store" })
      if (!res.ok) throw new Error("bad response")
      const data: AppState = await res.json()
      setState(data)
      setError(null)
    } catch {
      setError("تعذر الاتصال بالخادم، حاول تحديث الصفحة")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // تحديث تلقائي عند العودة إلى التبويب
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") load()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [load])

  const action = useCallback(async (url: string, body: unknown) => {
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
  }, [])

  return { state, loading, error, load, action }
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
