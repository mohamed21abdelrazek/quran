/* عامل الخدمة — وِردي يعمل أوفلاين بالكامل:
   المصحف والمتشابهات بيانات محلية في التطبيق أصلاً؛
   هنا نؤمّن هيكل التطبيق والصفحة والخطوط وآخر لقطة حالة. */
const CACHE = "wardi-v1"
const CORE = [
  "/",
  "/manifest.webmanifest",
  "/logo.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // كل عنصر على حدة — فشل عنصر لا يوقف التثبيت
      await Promise.all(CORE.map((u) => cache.add(u).catch(() => {})))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      await self.clients.claim()
    })()
  )
})

/** خطوط جوجل وثوابت أخرى: الكاش أولاً */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res && res.ok) cache.put(req, res.clone())
  return res
}

/** الشبكة أولاً مع تراجع للكاش — يبقي كل شيء طازجاً في التطوير */
async function networkFirst(req, key) {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (res && res.ok) cache.put(key || req, res.clone())
    return res
  } catch (e) {
    const hit = await cache.match(key || req)
    if (hit) return hit
    return new Response("", { status: 503, statusText: "Offline" })
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request
  // لا نلمس الإرسالات أبداً — تُدار بواسطة قائمة انتظار التطبيق
  if (req.method !== "GET") return

  const url = new URL(req.url)

  // خطوط جوجل (أوفلاين بلا فقدان الخط القرآني)
  if (url.origin !== self.location.origin) {
    if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
      event.respondWith(cacheFirst(req))
    }
    return
  }

  // حالات API: دائماً من الشبكة — الطزاجة أساس؛
  // عند الانقطاع يعرض التطبيق لقطة localStorage ويضع الإجراء في قائمة الانتظار
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    )
    return
  }

  // فتح التطبيق: آخر نسخة HTML محفوظة عند الانقطاع
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, "/"))
    return
  }

  // بقية الموارد (حزم JS/CSS/أيقونات): شبكة أولاً + تراجع للكاش
  event.respondWith(networkFirst(req))
})
