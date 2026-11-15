// بيانات المصحف على الخادم: نص عثماني بصفحات ٦٠٤ + المتشابهات لكل آية
import quranData from "@/data/quran-pages.json"
import mtsData from "@/data/mutashabihat.json"
import { pageToJuz } from "./quran"

interface PageRow { p: number; ayahs: { s: number; n: number; t: string }[] }
interface SurahMeta { n: number; name: string; type: string; ayahCount: number; page: number }
interface RawData { pages: PageRow[]; surahs: SurahMeta[]; juzStart: number[] }
const raw = quranData as unknown as RawData

interface MtGroup { i: number; x: number; r: string[] }
const mtRaw = mtsData as unknown as { groups: MtGroup[] }

export interface AyahRef {
  key: string
  s: number
  n: number
  page: number
  text: string
  surah: string
}

// ---- فهارس تُبنى مرة واحدة عند التحميل ----
const surahByNum = new Map<number, SurahMeta>(raw.surahs.map((s) => [s.n, s]))

const ayahByKey = new Map<string, { s: number; n: number; page: number; text: string }>()
for (const pg of raw.pages) {
  for (const a of pg.ayahs) {
    ayahByKey.set(`${a.s}:${a.n}`, { s: a.s, n: a.n, page: pg.p, text: a.t })
  }
}

export interface GroupOut {
  id: number
  identical: boolean
  items: AyahRef[]
}
const groupById = new Map<number, GroupOut>()
const groupIdsByAyah = new Map<string, number[]>()
for (const g of mtRaw.groups) {
  const items: AyahRef[] = []
  for (const key of g.r) {
    const a = ayahByKey.get(key)
    if (!a) continue
    const meta = surahByNum.get(a.s)
    items.push({ key, s: a.s, n: a.n, page: a.page, text: a.text, surah: meta?.name ?? "" })
  }
  if (items.length < 2) continue
  const out: GroupOut = { id: g.i, identical: g.x === 1, items }
  groupById.set(g.i, out)
  for (const it of items) {
    const list = groupIdsByAyah.get(it.key) ?? []
    if (!list.includes(g.i)) list.push(g.i)
    groupIdsByAyah.set(it.key, list)
  }
}

export const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ"

export interface SectionOut {
  s: number
  name: string
  type: string
  fromAyah: number
  toAyah: number
  startsHere: boolean
  showBismillah: boolean
}

export interface PagePayload {
  page: number
  juz: number
  surahLabel: string
  sections: SectionOut[]
  ayahs: { key: string; s: number; n: number; text: string; groups: number[] }[]
  mutashabihat: GroupOut[]
}

export function getPagePayload(n: number): PagePayload | null {
  if (n < 1 || n > raw.pages.length) return null
  const pg = raw.pages[n - 1]
  const juz = pageToJuz(n)

  // أقسام السور في الصفحة
  const sections: SectionOut[] = []
  for (const a of pg.ayahs) {
    const last = sections[sections.length - 1]
    if (last && last.s === a.s) {
      last.toAyah = a.n
    } else {
      const meta = surahByNum.get(a.s)
      sections.push({
        s: a.s,
        name: meta?.name ?? "",
        type: meta?.type ?? "",
        fromAyah: a.n,
        toAyah: a.n,
        startsHere: a.n === 1,
        showBismillah: a.n === 1 && a.s !== 1 && a.s !== 9,
      })
    }
  }

  // الآيات مع مجموعاتها
  const ayahs = pg.ayahs.map((a) => ({
    key: `${a.s}:${a.n}`,
    s: a.s,
    n: a.n,
    text: a.t,
    groups: groupIdsByAyah.get(`${a.s}:${a.n}`) ?? [],
  }))

  // مجموعات المتشابهات التي تلمس هذه الصفحة (كاملة بنصوصها)
  const ids = new Set<number>()
  for (const a of ayahs) for (const g of a.groups) ids.add(g)
  const mutashabihat: GroupOut[] = []
  for (const id of ids) {
    const g = groupById.get(id)
    if (g) mutashabihat.push(g)
  }
  mutashabihat.sort((a, b) => b.items.length - a.items.length)

  const surahLabel = sections.map((s) => s.name).join("، ")

  return { page: n, juz, surahLabel, sections, ayahs, mutashabihat }
}
