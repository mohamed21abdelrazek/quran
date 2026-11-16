// التفسير الميّسر وأسباب النزول — يُحمّلان مرة واحدة عند أول طلب
// ثم يعملان أوفلاين (ملفات محلية في /data داخل كاش عامل الخدمة).

interface TafsirMap {
  [key: string]: string
}

interface AsbabEntry {
  s: number
  a: number[]
  o: string[]
}

let tafsirPromise: Promise<TafsirMap> | null = null
let asbabPromise: Promise<Map<string, string[]>> | null = null

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`تعذر تحميل ${url}`)
  return (await res.json()) as T
}

function loadTafsir(): Promise<TafsirMap> {
  if (!tafsirPromise) {
    tafsirPromise = fetchJson<TafsirMap>("/data/tafsir-muyassar.json").catch(() => {
      tafsirPromise = null // اسمح بإعادة المحاولة لاحقاً
      throw new Error("تعذر تحميل التفسير")
    })
  }
  return tafsirPromise
}

function loadAsbab(): Promise<Map<string, string[]>> {
  if (!asbabPromise) {
    asbabPromise = fetchJson<AsbabEntry[]>("/data/asbab-nuzul.json")
      .then((entries) => {
        const idx = new Map<string, string[]>()
        for (const e of entries) {
          for (const n of e.a ?? []) {
            if (!idx.has(`${e.s}:${n}`)) idx.set(`${e.s}:${n}`, e.o)
          }
        }
        return idx
      })
      .catch(() => {
        asbabPromise = null
        throw new Error("تعذر تحميل أسباب النزول")
      })
  }
  return asbabPromise
}

/**
 * تفسير آية من الميّسر — مع fallback تنازلي:
 * الميّسر يدمج أحياناً عدة آيات في تفسير واحد تحت مفتاح أول آية،
 * فننزل حتى أول مفتاح موجود (تفسيرها يشملها).
 */
export async function getTafsir(s: number, n: number): Promise<string | null> {
  try {
    const map = await loadTafsir()
    for (let k = n; k >= 1; k--) {
      const t = map[`${s}:${k}`]
      if (t) return t
    }
    return null
  } catch {
    return null
  }
}

/** أسباب نزول آية (إن وُجدت في المصدر) */
export async function getAsbab(s: number, n: number): Promise<string[] | null> {
  try {
    const idx = await loadAsbab()
    return idx.get(`${s}:${n}`) ?? null
  } catch {
    return null
  }
}
