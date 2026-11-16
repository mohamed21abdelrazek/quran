/**
 * مولّد المتشابهات — يكتشف آيات القرآن المتشابهة نصاً عبر تحليل حرفي:
 *  1) المتطابقات حرفياً (تكرار في أكثر من موضع) — مجموعة واحدة لكل نص متكرر.
 *  2) المتشابهات بفروق: كل زوج متشابه يُخرج كمجموعة مستقلة (بطاقة دقيقة للفرق).
 *     معايير القبول: بداية مشتركة ≥ 14 حرفاً، أو نهاية مشتركة ≥ 14 حرفاً،
 *     أو نسبة تشابه عامة ≥ 0.66 (تبديل ترتيب/إدخالات صغيرة).
 *
 * التشغيل: bun scripts/gen-mutashabihat.ts
 */
import { readFileSync, writeFileSync } from "fs"

interface PageRow { p: number; ayahs: { s: number; n: number; t: string }[] }
const data = JSON.parse(readFileSync("src/data/quran-pages.json", "utf8")) as { pages: PageRow[] }

const MARKS = /[\u0640\u064B-\u065F\u0670\u06D6-\u06ED\u200C\u200D\u06DF]/g
function norm(t: string): string {
  return t
    .replace(MARKS, "")
    .replace(/\u0671/g, "\u0627") // ٱ -> ا
    .replace(/\s+/g, "")
}

type Ayah = { key: string; s: number; n: number; text: string; norm: string; page: number }
const ayahs: Ayah[] = []
for (const pg of data.pages) {
  for (const a of pg.ayahs) {
    ayahs.push({ key: `${a.s}:${a.n}`, s: a.s, n: a.n, text: a.t, norm: norm(a.t), page: pg.p })
  }
}
const idxOf = new Map<string, number>(ayahs.map((a, i) => [a.key, i]))
console.log("آيات:", ayahs.length)

// ---------------- LCS على الأنوية بعد قص البادئة/اللاحقة ----------------
function lcsLen(a: string, b: string): number {
  let start = 0
  const la = a.length, lb = b.length
  while (start < la && start < lb && a[start] === b[start]) start++
  let endA = la, endB = lb
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const coreA = a.slice(start, endA), coreB = b.slice(start, endB)
  if (coreA.length === 0 || coreB.length === 0) return start + (la - endA)
  if (coreA.length * coreB.length > 40000) return start + (la - endA)
  const m = coreA.length, k = coreB.length
  let prev = new Uint16Array(k + 1)
  let cur = new Uint16Array(k + 1)
  for (let i = 1; i <= m; i++) {
    const ca = coreA.charCodeAt(i - 1)
    for (let j = 1; j <= k; j++) {
      cur[j] = ca === coreB.charCodeAt(j - 1) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    const t = prev; prev = cur; cur = t; cur.fill(0)
  }
  return start + (la - endA) + prev[k]
}

function commonPrefix(a: string, b: string): number {
  let i = 0
  const n = Math.min(a.length, b.length)
  while (i < n && a[i] === b[i]) i++
  return i
}
function commonSuffix(a: string, b: string): number {
  let i = 0
  const n = Math.min(a.length, b.length)
  while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}

// ---------------- 1) المتطابقات حرفياً ----------------
const normGroups = new Map<string, string[]>()
for (const a of ayahs) {
  const list = normGroups.get(a.norm) ?? []
  list.push(a.key)
  normGroups.set(a.norm, list)
}
const identicalSets: string[][] = []
for (const refs of normGroups.values()) {
  if (refs.length < 2) continue
  identicalSets.push([...refs].sort((x, y) => {
    const [xs, xn] = x.split(":").map(Number)
    const [ys, yn] = y.split(":").map(Number)
    return xs - ys || xn - yn
  }))
}
console.log("مجموعات المتطابقات الحرفية:", identicalSets.length)

// ---------------- 2) المرشّحات: نافذة مشتركة متصلة (10 حروف) ----------------
const SH = 10
const BUCKET_CAP = 40
const buckets = new Map<string, number[]>()
for (let i = 0; i < ayahs.length; i++) {
  const n = ayahs[i].norm
  if (n.length < 14) continue
  for (let off = 0; off + SH <= n.length; off++) {
    const w = n.substring(off, off + SH)
    let arr = buckets.get(w)
    if (!arr) { arr = []; buckets.set(w, arr) }
    if (arr.length < BUCKET_CAP * 2) arr.push(i)
  }
}
const pairCount = new Map<number, number>()
for (const rawArr of buckets.values()) {
  const arr = [...new Set(rawArr)]
  if (arr.length < 2) continue
  for (let x = 0; x < arr.length; x++) {
    for (let y = x + 1; y < arr.length; y++) {
      const pk = arr[x] * 10000 + arr[y]
      pairCount.set(pk, (pairCount.get(pk) ?? 0) + 1)
    }
  }
}
console.log("أزواج مرشحة:", pairCount.size)

// ---------------- 3) التحقق ----------------
const similarPairs: { a: string; b: string; pfx: number; sfx: number; ratio: number }[] = []
for (const [pk] of pairCount) {
  const i = Math.floor(pk / 10000), j = pk % 10000
  const A = ayahs[i], B = ayahs[j]
  if (A.norm === B.norm) continue // متطابقة
  if (A.key === "1:1" || B.key === "1:1") continue // البسملة آية مستقلة
  const pfx = commonPrefix(A.norm, B.norm)
  const sfx = commonSuffix(A.norm, B.norm)
  // بداية/نهاية مشتركة ≥ 14 حرفاً — مع استبعاد صيغ النداء العامة (يا أيها...)
  let ok = (pfx >= 14 && !(pfx < 25 && A.norm.startsWith("يأيها"))) || sfx >= 14
  let ratio = 0
  if (!ok) {
    ratio = (2 * lcsLen(A.norm, B.norm)) / (A.norm.length + B.norm.length)
    ok = ratio >= 0.66
  }
  if (ok) similarPairs.push({ a: A.key, b: B.key, pfx, sfx, ratio: +ratio.toFixed(2) })
}
console.log("أزواج متشابهة مقبولة:", similarPairs.length)

// ---------------- 4) الإخراج: كل زوج مجموعة + كل نص متكرر مجموعة ----------------
type Group = { id: number; identical: boolean; refs: string[] }
const groups: Group[] = []
for (const refs of identicalSets) groups.push({ id: 0, identical: true, refs })
for (const p of similarPairs) groups.push({ id: 0, identical: false, refs: [p.a, p.b] })
groups.sort((a, b) => {
  const [as, an] = a.refs[0].split(":").map(Number)
  const [bs, bn] = b.refs[0].split(":").map(Number)
  return as - bs || an - bn
})
for (let i = 0; i < groups.length; i++) groups[i].id = i + 1

// ---------------- 5) فحوصات جودة ----------------
console.log("إجمالي المجموعات:", groups.length, "| متطابقة:", identicalSets.length, "| أزواج فروق:", similarPairs.length)

const direct = (x: string, y: string) => similarPairs.find((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x))
const inSameSet = (x: string, y: string) => identicalSets.find((s) => s.includes(x) && s.includes(y))
const mustHave: [string, string][] = [
  ["41:30", "46:13"],
  ["17:89", "18:54"],
  ["2:153", "8:46"],
  ["69:3", "101:3"],
  ["113:1", "114:1"],
  ["3:185", "21:35"],
  ["52:11", "77:15"],
  ["2:59", "7:162"],
  ["45:2", "46:2"],
  ["32:2", "56:80"],
]
for (const [x, y] of mustHave) {
  const p = direct(x, y)
  const s = inSameSet(x, y)
  console.log(
    `فحص ${x}+${y}:`,
    p ? `✓ زوج مباشر (بادئة=${p.pfx}، لاحقة=${p.sfx}، نسبة=${p.ratio})` : s ? `✓ متطابقة ضمن تكرار` : "✗"
  )
}

const biggestSets = [...identicalSets].sort((a, b) => b.length - a.length).slice(0, 5)
for (const s of biggestSets) console.log(`تكرار حرفي (${s.length}):`, s.slice(0, 12).join(" "), s.length > 12 ? "…" : "")

// عيّنات من الأزواج
console.log("--- عيّنة أزواج (بالأولوية للأول) ---")
for (const p of similarPairs.slice(0, 10)) {
  const A = ayahs[idxOf.get(p.a)!], B = ayahs[idxOf.get(p.b)!]
  console.log(`  ${p.a} ↔ ${p.b} (ب=${p.pfx} ل=${p.sfx} ن=${p.ratio})\n    «${A.text.slice(0, 50)}…»\n    «${B.text.slice(0, 50)}…»`)
}

writeFileSync("src/data/mutashabihat.json", JSON.stringify({
  groups: groups.map((g) => ({ i: g.id, x: g.identical ? 1 : 0, r: g.refs })),
}))
console.log("كُتب src/data/mutashabihat.json:", (JSON.stringify({ groups: groups.map((g) => ({ i: g.id, x: g.identical ? 1 : 0, r: g.refs })) }).length / 1024).toFixed(1), "KB")
