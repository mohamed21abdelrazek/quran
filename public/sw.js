/* عامل الخدمة — وِردي يعمل أوفلاين بالكامل:
   المصحف والمتشابهات بيانات محلية في التطبيق أصلاً؛
   الخطوط محلية في /fonts؛ والتلاوات تُخزَّن بعد أول تشغيل. */
const CACHE = "wardi-v3"

const FONTS = [
  "/fonts/amiri-arabic-400.woff2",
  "/fonts/amiri-arabic-400i.woff2",
  "/fonts/amiri-arabic-700.woff2",
  "/fonts/amiri-latin-400.woff2",
  "/fonts/amiri-latin-400i.woff2",
  "/fonts/amiri-latin-700.woff2",
  "/fonts/amiri-latin-ext-400.woff2",
  "/fonts/amiri-latin-ext-400i.woff2",
  "/fonts/amiri-latin-ext-700.woff2",
  "/fonts/amiriquran-arabic-400.woff2",
  "/fonts/amiriquran-latin-400.woff2",
  "/fonts/tajawal-arabic-300.woff2",
  "/fonts/tajawal-arabic-400.woff2",
  "/fonts/tajawal-arabic-500.woff2",
  "/fonts/tajawal-arabic-700.woff2",
  "/fonts/tajawal-arabic-800.woff2",
  "/fonts/tajawal-latin-300.woff2",
  "/fonts/tajawal-latin-400.woff2",
  "/fonts/tajawal-latin-500.woff2",
  "/fonts/tajawal-latin-700.woff2",
  "/fonts/tajawal-latin-800.woff2",
]

const CORE = [
  "/",
  "/manifest.webmanifest",
  "/logo.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/data/tafsir-muyassar.json",
  "/data/asbab-nuzul.json",
  ...FONTS,
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

/** كاش أولاً — للخطوط والتلاوات المحفوظة مسبقاً */
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

  // تلاوات everyayah: كاش دائم — أول تشغيل يحتاج اتصالاً ثم يعمل أوفلاين
  // نتجاهل ترويسة Range ونطلب الملف كاملاً — يُخزَّن دائماً استجابة 200 كاملة
  if (url.hostname === "everyayah.com") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const bare = new Request(url.href, { method: "GET" })
        const hit = await cache.match(bare)
        if (hit) return hit
        const res = await fetch(bare)
        if (res && res.status === 200) cache.put(bare, res.clone())
        return res
      })()
    )
    return
  }

  // خارج النطاق وغير ذلك: نتركه للمتصفح
  if (url.origin !== self.location.origin) return

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

  // بقية الموارد (حزم JS/CSS/الخطوط/الأيقونات): شبكة أولاً + تراجع للكاش
  event.respondWith(networkFirst(req))
})
