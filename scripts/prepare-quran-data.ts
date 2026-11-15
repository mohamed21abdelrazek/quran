/**
 * سكربت تجهيز بيانات المصحف — يقرأ النص العثماني الخام (alquran.cloud)
 * ويحوّله إلى src/data/quran-pages.json + يتحقق من مطابقة الجداول الحالية.
 *
 * التشغيل: bun scripts/prepare-quran-data.ts
 */
import { readFileSync, writeFileSync } from "fs"
import { SURAHS, JUZ_START, TOTAL_PAGES } from "../src/lib/quran"

const raw = readFileSync("/tmp/quran-raw.json", "utf8")
const json = JSON.parse(raw) as {
  data: {
    surahs: {
      number: number
      name: string
      englishName: string
      revelationType: string
      ayahs: { number: number; numberInSurah: number; text: string; page: number; juz: number }[]
    }[]
  }
}

const BOM = "\uFEFF"
const DIAC = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g
const plain = (t: string) => t.replace(BOM, "").replace(DIAC, "").replace(/\u0671/g, "\u0627").replace(/\s+/g, " ").trim()
const BASMALA_WORDS = ["بسم", "الله", "الرحمن", "الرحيم"]

/** البسملة مدمجة في أول آية من كل سورة (عدا الفاتحة والتوبة) في هذه النسخة — نفصلها */
function stripBasmala(surahNumber: number, text: string): { t: string; hadBasmala: boolean } {
  if (surahNumber === 1 || surahNumber === 9) return { t: text.replace(BOM, ""), hadBasmala: false }
  const words = text.replace(BOM, "").split(/\s+/)
  if (words.length < 5) return { t: text.replace(BOM, ""), hadBasmala: false }
  const head = words.slice(0, 4).map(plain).join(" ")
  if (head === BASMALA_WORDS.join(" ")) {
    return { t: words.slice(4).join(" ").trim(), hadBasmala: true }
  }
  return { t: text.replace(BOM, ""), hadBasmala: false }
}

// ---- التحقق من مطابقة صفحات بداية السور مع الجدول الحالي ----
const surahMismatches: string[] = []
const juzMismatches: string[] = []
const juzStartData = new Array<number>(30).fill(0)
const seenJuz = new Set<number>()

for (const s of json.data.surahs) {
  const first = s.ayahs[0]
  const local = SURAHS[s.number - 1]
  if (!local || local.page !== first.page) {
    surahMismatches.push(`سورة ${local?.name ?? s.number}: الجدول ${local?.page} مقابل البيانات ${first.page}`)
  }
  for (const a of s.ayahs) {
    if (!seenJuz.has(a.juz)) {
      seenJuz.add(a.juz)
      juzStartData[a.juz - 1] = a.page
    }
  }
}
for (let j = 0; j < 30; j++) {
  if (juzStartData[j] !== JUZ_START[j]) {
    juzMismatches.push(`الجزء ${j + 1}: الجدول ${JUZ_START[j]} مقابل البيانات ${juzStartData[j]}`)
  }
}

console.log("=== تقرير المطابقة ===")
console.log("سور غير مطابقة:", surahMismatches.length ? surahMismatches : "لا شيء ✓")
console.log("أجزاء غير مطابقة:", juzMismatches.length ? juzMismatches : "لا شيء ✓")

// ---- بناء الصفحات: كل آية تُنسب للصفحة التي تبدأ فيها ----
const pages: { p: number; ayahs: { s: number; n: number; t: string }[] }[] = []
for (let p = 1; p <= TOTAL_PAGES; p++) pages.push({ p, ayahs: [] })

let count = 0
let basmalaCount = 0
for (const s of json.data.surahs) {
  for (const a of s.ayahs) {
    const page = Math.min(TOTAL_PAGES, Math.max(1, a.page))
    const { t, hadBasmala } = a.numberInSurah === 1 ? stripBasmala(s.number, a.text) : { t: a.text.replace(BOM, ""), hadBasmala: false }
    if (hadBasmala) basmalaCount++
    pages[page - 1].ayahs.push({ s: s.number, n: a.numberInSurah, t })
    count++
  }
}
console.log("فُصلت بسملة من أول آية في", basmalaCount, "سورة (المتوقع 112)")

const emptyPages = pages.filter((pg) => pg.ayahs.length === 0).map((pg) => pg.p)
console.log("إجمالي الآيات:", count, "| صفحات فارغة:", emptyPages.length ? emptyPages : "لا شيء ✓")

// ---- بناء كائن الإخراج ----
const surahsMeta = json.data.surahs.map((s) => ({
  n: s.number,
  name: SURAHS[s.number - 1].name,
  type: s.revelationType === "Meccan" ? "مكية" : "مدنية",
  ayahCount: s.ayahs.length,
  page: s.ayahs[0].page,
}))

const out = { format: "uthmani", source: "alquran.cloud quran-uthmani", surahs: surahsMeta, juzStart: juzStartData, pages }
writeFileSync("src/data/quran-pages.json", JSON.stringify(out))
console.log("كُتب src/data/quran-pages.json — حجم:", (JSON.stringify(out).length / 1024).toFixed(0), "KB")
