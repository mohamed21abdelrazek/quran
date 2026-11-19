// بناء src/data/quran-tajweed.json من بيانات cpfair/quran-tajweed
// بمحاذاة نص تطبيقنا (الذي يحوي علامات الوقف) عبر خريطة أحرف
// تشغيل: node scripts/build-tajweed.mjs
import fs from "node:fs"

const ROOT = new URL("..", import.meta.url).pathname
const OURS_PATH = `${ROOT}src/data/quran-pages.json`
const TANZIL_PATH = process.argv[2] ?? "/tmp/quran-uthmani.txt"
const ANN_PATH = process.argv[3] ?? "/tmp/tajweed-ann.json"
const OUT_PATH = `${ROOT}src/data/quran-tajweed.json`

// كل علامات التشكيل القرآنية U+06D6–U+06ED: الوقف ۖۗۘۙۚۛۜ + ربع الحزب ۞ + السجدة ۩
// + العلامات المشتركة بتوزيع مختلف (ۭ ۠) — تُطابَق مباشرة عند التطابق وتُتخطى عند الاختلاف
const EXTRA_RE = /[\u06D6-\u06ED]/

// ---- ١) نصنا ----
const pages = JSON.parse(fs.readFileSync(OURS_PATH, "utf8"))
const ours = new Map() // "s:n" -> text
for (const p of pages.pages) for (const a of p.ayahs) ours.set(`${a.s}:${a.n}`, a.t)

// ---- ٢) النص المرجعي (تنزيل) ----
const tanzil = new Map()
for (const line of fs.readFileSync(TANZIL_PATH, "utf8").split(/\r?\n/)) {
  const m = line.match(/^(\d+)\|(\d+)\|(.*)$/)
  if (m) tanzil.set(`${m[1]}:${m[2]}`, m[3].replace(/\s+/g, " ").trim())
}

const BISMILLAH = tanzil.get("1:1") // بسملة تنزيل نفسها — مطابقة حرفية

// ---- ٣) الشروح ----
const annRaw = JSON.parse(fs.readFileSync(ANN_PATH, "utf8"))
const annByKey = new Map()
for (const a of annRaw) annByKey.set(`${a.surah}:${a.ayah}`, a.annotations)

// أولوية القواعد عند التداخل (الأعلى يفوز)
const PRIORITY = {
  madd_6: 20, madd_muttasil: 19, madd_munfasil: 18, madd_246: 17, madd_2: 16,
  qalqalah: 15, ghunnah: 14, idghaam_ghunnah: 13, idghaam_shafawi: 12,
  ikhfa: 11, ikhfa_shafawi: 10, iqlab: 9, idghaam_no_ghunnah: 8,
  idghaam_mutajanisayn: 7, idghaam_mutaqaribayn: 6,
  hamzat_wasl: 5, lam_shamsiyyah: 4, silent: 3,
}

// ترميز قصير لتوفير الحجم
const CODE = {
  hamzat_wasl: "h", lam_shamsiyyah: "l", silent: "s",
  madd_2: "m", madd_246: "d", madd_muttasil: "M", madd_munfasil: "F", madd_6: "6",
  ghunnah: "g", idghaam_ghunnah: "G", idghaam_shafawi: "W",
  ikhfa: "i", ikhfa_shafawi: "I", iqlab: "b",
  qalqalah: "q",
  idghaam_no_ghunnah: "n", idghaam_mutajanisayn: "j", idghaam_mutaqaribayn: "r",
}

const out = {}
let aligned = 0, fallback = 0, overlapPairs = 0, annUsed = 0, annDropped = 0
const fallbackKeys = []

const applyRange = (arr, r) => {
  annUsed++
  for (let x = r.st; x < r.en; x++) arr[x] = r.rule
}

for (const [key, ourText] of ours) {
  const [s, n] = key.split(":").map(Number)
  let ref = tanzil.get(key)
  const annotations = annByKey.get(key) ?? []
  if (ref === undefined) { fallback++; fallbackKeys.push(key); continue }

  // إسقاط البسملة من نص تنزيل لآيات أول السور (عدا الفاتحة والتوبة)
  // يدعم الصيغ العثمانية المختلفة (مثل «بِّسْمِ» في سورتي التين والقدر):
  // إن كان نصنا لاحقةً للمرجع فالبادئة هي البسملة بفراغها
  let prefixLen = 0
  if (n === 1 && s !== 1 && s !== 9) {
    if (ref.startsWith(BISMILLAH)) {
      prefixLen = BISMILLAH.length + 1 // + الفراغ
    } else if (ref.length > ourText.length && ref.endsWith(ourText) && ref[ref.length - ourText.length - 1] === " ") {
      prefixLen = ref.length - ourText.length
    }
    if (prefixLen > 0) ref = ref.slice(prefixLen)
  }

  // سلسلة منطقية من نصنا: دمج فراغات علامات الوقف المزدوجة
  // «رَيْبَ ۛ فِيهِ» → فراغ منطقي واحد، و«۞ تِلْكَ» → بلا فراغ بادئ
  const logical = [] // [محرف، فهرسه في نصنا]
  {
    let i = 0
    while (i < ourText.length) {
      const ch = ourText[i]
      if (ch === " ") {
        // فراغ يليه علامات ثم فراغ: تجاوز الفراغ والعلامات — الفراغ التالي هو المقابل
        let j = i + 1
        while (j < ourText.length && EXTRA_RE.test(ourText[j])) j++
        if (j > i + 1 && j < ourText.length && ourText[j] === " ") {
          i = j
          continue
        }
        // فراغ بادئ بعد علامة ساقطة (مثل ۞ في أول الآية) — أسقطه
        if (logical.length === 0) {
          i++
          continue
        }
      }
      logical.push([ch, i])
      i++
    }
  }

  // مطابقة مرنة: ref سلسلة فرعية (ليست بالضرورة متصلة) من السلسلة المنطقية —
  // مع تخطي علامات إضافية من أي الطرفين (مثل ۭ الموجود في النصين بتوزيع مختلف)
  const refToOur = new Int32Array(ref.length).fill(-1)
  let ok = true
  {
    let li = 0
    for (let ri = 0; ri < ref.length; ) {
      if (li >= logical.length) { ok = false; break }
      const [lch, oidx] = logical[li]
      if (lch === ref[ri]) {
        refToOur[ri] = oidx
        li++
        ri++
        continue
      }
      // علامة زائدة في نصنا → تخطَّ
      if (EXTRA_RE.test(lch)) {
        li++
        continue
      }
      // فراغ تابع لعلامة سابقة سقطت (مثل «۞ إِنَّ» حيث المرجع بلا الفراغ) → تخطَّ
      if (lch === " " && li > 0 && EXTRA_RE.test(logical[li - 1][0])) {
        li++
        continue
      }
      // علامة زائدة في المرجع → تخطَّ (بلا مقابل عندنا)
      if (EXTRA_RE.test(ref[ri])) {
        ri++
        continue
      }
      ok = false
      break
    }
    if (ok) {
      // بقية السلسلة المنطقية: علامات متروكة وفراغاتها فقط (مثل « ۩» السجدة آخر الآية)
      while (li < logical.length && (EXTRA_RE.test(logical[li][0]) || logical[li][0] === " ")) li++
      if (li < logical.length) ok = false
    }
  }
  if (!ok) { fallback++; fallbackKeys.push(key); continue }

  // ملء الفهرسات المفقودة (محارف مرجعية متخطاة) بأقرب فهرس مجاور
  for (let ri = 0; ri < ref.length; ri++) {
    if (refToOur[ri] >= 0) continue
    let k = ri - 1
    while (k >= 0 && refToOur[k] < 0) k--
    refToOur[ri] = k >= 0 ? refToOur[k] : -1
  }
  {
    let last = -1
    for (let ri = 0; ri < ref.length; ri++) {
      if (refToOur[ri] < 0) refToOur[ri] = last
      else last = refToOur[ri]
    }
  }

  // قاعدة كل حرف في نصنا (بأولوية أعلى عند التداخل)
  const ruleByOurIdx = new Array(ourText.length).fill(null)
  const ranges = []
  for (const a of annotations) {
    let st = a.start - prefixLen
    let en = a.end - prefixLen
    if (en <= 0) { annDropped++; continue } // داخل البسملة
    if (st < 0) st = 0
    if (en > ref.length) en = ref.length
    if (st >= en) { annDropped++; continue }
    // نهاية الشرح حصرية في فضاء ref
    const ourSt = refToOur[st]
    const ourEn = refToOur[en - 1] + 1
    if (ourSt < 0 || ourEn <= ourSt) { annDropped++; continue }
    ranges.push({ st: ourSt, en: ourEn, rule: a.rule, pr: PRIORITY[a.rule] ?? 1 })
  }
  // فرز ثم تطبيق — الأعلى أولوية يفوز في التداخل
  ranges.sort((a, b) => a.st - b.st || b.pr - a.pr)
  let active = null
  for (const r of ranges) {
    if (active && r.st < active.en) {
      overlapPairs++
      if (r.pr > active.pr) {
        // الجديد يفوز من بدايته؛ القديم يُقتطع
        active.en = r.st
        if (active.en > active.st) applyRange(ruleByOurIdx, active)
        active = r
      } else if (r.en > active.en) {
        // القديم يبقى والجديد يبدأ بعده
        const tail = { ...r, st: active.en }
        applyRange(ruleByOurIdx, active)
        active = tail
      }
      // وإلا يُبتلع كلياً
    } else {
      if (active) applyRange(ruleByOurIdx, active)
      active = r
    }
  }
  if (active) applyRange(ruleByOurIdx, active)

  // تقطيع الكلمات: نفس منطق التطبيق split(/\s+/)
  const words = ourText.split(/\s+/).filter(Boolean)
  const wordSegs = []
  let pos = 0 // مؤشر جارٍ في نصنا
  for (const w of words) {
    const at = ourText.indexOf(w, pos)
    pos = at + w.length
    const segs = []
    let curRule = null, curText = ""
    for (let x = at; x < at + w.length; x++) {
      const rule = ruleByOurIdx[x]
      if (rule === curRule) curText += ourText[x]
      else {
        if (curText) segs.push([curRule, curText])
        curRule = rule
        curText = ourText[x]
      }
    }
    if (curText) segs.push([curRule, curText])
    wordSegs.push(segs)
  }
  out[key] = wordSegs
  aligned++
}

// تحويل أسماء القواعد إلى الرموز القصيرة
const compact = {}
for (const [key, words] of Object.entries(out)) {
  compact[key] = words.map((segs) => segs.map(([rule, text]) => [rule ? CODE[rule] : null, text]))
}

fs.writeFileSync(OUT_PATH, JSON.stringify(compact))
console.log(`محاذاة ناجحة: ${aligned} / ${ours.size} (${(100 * aligned / ours.size).toFixed(2)}%)`)
console.log(`سقوط: ${fallback} — شروح مستخدمة: ${annUsed} — شروح متروكة: ${annDropped} — تداخلات: ${overlapPairs}`)
if (fallbackKeys.length) console.log("أول الساقط:", fallbackKeys.slice(0, 10).join(", "))
console.log("حجم الملف:", (fs.statSync(OUT_PATH).size / 1024 / 1024).toFixed(2), "MB")

// فحص عيّنات
for (const k of ["1:1", "1:2", "2:255", "112:1"]) {
  const w = compact[k]
  if (!w) continue
  console.log(`\n${k}: ${w.length} كلمة`)
  for (const segs of w.slice(0, 6)) console.log("  ", JSON.stringify(segs))
}
