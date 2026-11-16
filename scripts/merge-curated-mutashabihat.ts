/**
 * دمج متشابهات «خبرة الحفّاظ» (Quran_Mutashabihat_Data — CC0)
 * ------------------------------------------------------------------
 * المصدر: عمل القارئ إدريس العاصم رحمه الله — منسّق يدوياً للحفّاظ.
 * ترقيمه: مطلق 0-based (1:1 = 0) — نحوّله إلى مفاتيح سورة:آية.
 * كل مدخل (src + muts) = مجموعة واحدة بعلم x:2، مع علم c:1 للسياق (ctx).
 * السكربت قابل لإعادة التشغيل: يحذف مجموعات x:2 السابقة ثم يعيد إضافتها.
 */
import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

const ROOT = process.cwd()
const PAGES = JSON.parse(readFileSync(resolve(ROOT, "src/data/quran-pages.json"), "utf8")) as {
  pages: { p: number; ayahs: { s: number; n: number; t: string }[] }[]
}
const CURATED = JSON.parse(
  readFileSync(resolve(ROOT, "scripts/input/mutashabiha_data.json"), "utf8"),
) as Record<string, { src: { ayah: number | number[] }; muts: { ayah: number | number[] }[]; ctx?: number }[]>

// فهرس: الرقم المطلق القياسي (1..6236) -> "سورة:آية"
const absToKey: (string | null)[] = [null]
for (const pg of PAGES.pages) for (const a of pg.ayahs) absToKey.push(`${a.s}:${a.n}`)

interface Group {
  i: number
  x: number
  r: string[]
  c?: number
}
const OUT_FILE = resolve(ROOT, "src/data/mutashabihat.json")
const current = JSON.parse(readFileSync(OUT_FILE, "utf8")) as { groups: Group[] }

// إعادة التشغيل: نُسقط مجموعات الإصدار السابق لهذا السكربت (x=2)
const kept = current.groups.filter((g) => g.x !== 2)
let nextId = kept.reduce((m, g) => Math.max(m, g.i), 0) + 1

const toArr = (v: number | number[]): number[] => (Array.isArray(v) ? v : [v])
const added: Group[] = []
let skipped = 0
let mergedCount = 0
const passagesByGroup: number[][] = []
// إزالة التكرار: المصدر يسجل الزوج مرتين (مرة كـ«مصدر» ومرة كـ«نظير») —
// نوحّدها بمجموعة واحدة؛ وإن جاء أحد النسختين بعلم السياق نُبقيه
const byKeySet = new Map<string, Group>()

for (const juz of Object.values(CURATED)) {
  for (const entry of juz) {
    // المقاطع: مقطع المصدر + مقاطع النظائر — نحفظ حدودها لاحقاً عبر التسلسل
    const passages = [toArr(entry.src.ayah), ...entry.muts.map((m) => toArr(m.ayah))]
    const keys: string[] = []
    let bad = false
    const seenKeys = new Set<string>()
    for (const p of passages) {
      for (const abs0 of p) {
        const key = absToKey[abs0 + 1] // مصدره 0-based -> قياسي 1-based
        if (!key || seenKeys.has(key)) {
          if (!key) bad = true
          continue
        }
        seenKeys.add(key)
        keys.push(key)
      }
    }
    if (bad || keys.length < 2 || passages.length < 2) {
      skipped++
      continue
    }
    // هل سبقت مجموعة بنفس الأعضاء؟ (الاتجاه المعاكس)
    const sig = [...keys].sort().join("|")
    const dup = byKeySet.get(sig)
    if (dup) {
      if (entry.ctx && !dup.c) dup.c = 1 // النسخة الأخرى فيها سياق — نُبقيه
      mergedCount++
      continue
    }
    passagesByGroup.push(passages.map((p) => p.map((a) => absToKey[a + 1]).filter(Boolean) as string[]))
    const g: Group = { i: nextId++, x: 2, r: keys, ...(entry.ctx ? { c: 1 } : {}) }
    byKeySet.set(sig, g)
    added.push(g)
  }
}

const merged = { groups: [...kept, ...added] }
writeFileSync(OUT_FILE, JSON.stringify(merged))

// ---- تقرير ----
const sizeDist = new Map<number, number>()
for (const g of added) sizeDist.set(g.r.length, (sizeDist.get(g.r.length) ?? 0) + 1)
const multiPassage = passagesByGroup.filter((ps) => ps.length > 0 && ps.some((p) => p.length > 1)).length
const withCtx = added.filter((g) => g.c).length
console.log(`مجموعات خبرة الحفّاظ المضافة: ${added.length} (متخطى: ${skipped} | مدموج باتجاه معاكس: ${mergedCount})`)
console.log(`إجمالي المجموعات الآن: ${merged.groups.length} (كان ${kept.length})`)
console.log(`بعلم السياق ctx: ${withCtx} | بمقاطع متعددة الآيات: ${multiPassage}`)
console.log(
  "توزيع الأحجام:",
  [...sizeDist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}آية×${v}`).join("، "),
)
