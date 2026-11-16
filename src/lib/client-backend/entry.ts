// طبقة الاتصال بالخادم في نسخة الموقع العادية.
// هذه هي الوحدة الافتراضية لـ "@/lib/client-backend/entry" —
// في بناء الأوفلاين (WARDI_OFFLINE=1) يستبدلها next.config بـ offline.ts
// فيعمل التطبيق بلا خادم عبر localStorage.

import type { AppState } from "@/lib/types"

export type BackendMode = "server"

export const backendMode: BackendMode = "server"

/** تحميل حالة التطبيق — GET /api/app */
export async function backendLoad(): Promise<AppState> {
  const res = await fetch("/api/app", { cache: "no-store" })
  if (!res.ok) throw new Error("bad response")
  return (await res.json()) as AppState
}

/** تنفيذ إجراء على الخادم — POST {url} */
export async function backendAction(url: string, body: unknown): Promise<Record<string, unknown>> {
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
}
