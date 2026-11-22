// التجويد الملوّن — بيانات cpfair/quran-tajweed (رخصة CC-BY 4.0)
// محاذاة نصنا حرفاً بحرف — كل آية: كلماتها ومقاطعها الموسومة بالقاعدة
import tajweedData from "@/data/quran-tajweed.json"

/** رموز القواعد المختصرة في ملف البيانات */
export type TajweedCode =
  | "h" | "l" | "s" // رمادية: لا تُنطق
  | "m" | "d" | "M" | "F" | "6" // حمراء داكنة: المدود
  | "g" | "G" | "W" | "i" | "I" | "b" // حمراء: الغنن
  | "q" // خضراء: القلقلة
  | "n" | "j" | "r" // كهرمانية: إدغام بلا غنة

/** مقطع داخل كلمة: [القاعدة أو null، النص] */
export type TajweedSeg = [code: TajweedCode | null, text: string]

interface RawData {
  [key: string]: [string | null, string][][]
}
const raw = tajweedData as unknown as RawData

// ==================== القواعد ====================

export interface RuleMeta {
  /** اسم القاعدة */
  label: string
  /** شرح مختصر للحافظ */
  desc: string
  /** لون المقطع (فاتل/داكن) */
  cls: string
}

export const TAJWEED_RULES: Record<TajweedCode, RuleMeta> = {
  // المدود — أحمر داكن
  m: { label: "مد طبيعي", desc: "مدّ حركتين", cls: "text-red-700 dark:text-red-300" },
  d: { label: "مد عارض/لين", desc: "مدّ ٢ أو ٤ أو ٦ حركات", cls: "text-red-700 dark:text-red-300" },
  M: { label: "مد متصل", desc: "واجب — مدّ ٤ أو ٥ حركات", cls: "text-red-700 dark:text-red-300" },
  F: { label: "مد منفصل", desc: "جائز — مدّ ٤ أو ٥ حركات", cls: "text-red-700 dark:text-red-300" },
  "6": { label: "مد لازم", desc: "مدّ ٦ حركات", cls: "text-red-700 dark:text-red-300" },
  // الغنن — أحمر
  g: { label: "غنّة", desc: "غنّ بمقدار حركتين", cls: "text-rose-600 dark:text-rose-300" },
  G: { label: "إدغام بغنّة", desc: "النون الساكنة تُدغم مع غنّة", cls: "text-rose-600 dark:text-rose-300" },
  W: { label: "إدغام شفوي", desc: "الميم الساكنة قبل واو/ميم مع غنّة", cls: "text-rose-600 dark:text-rose-300" },
  i: { label: "إخفاء", desc: "النون الساكنة تُخفى مع غنّة", cls: "text-rose-600 dark:text-rose-300" },
  I: { label: "إخفاء شفوي", desc: "الميم الساكنة تُخفى مع غنّة", cls: "text-rose-600 dark:text-rose-300" },
  b: { label: "إقلاب", desc: "النون الساكنة قبل الباء تُقلب ميماً", cls: "text-rose-600 dark:text-rose-300" },
  // القلقلة — أخضر
  q: { label: "قلقلة", desc: "اضطراب الحرف عند سكونه: ق ط ب ج د", cls: "text-emerald-600 dark:text-emerald-400" },
  // لا يُنطق — رمادي
  h: { label: "همزة وصل", desc: "تُنطق في البداية وتُسقط في الدرجة", cls: "text-slate-400 dark:text-slate-500" },
  l: { label: "لام شمسية", desc: "لام «ال» لا تُنطق قبل الحروف الشمسية", cls: "text-slate-400 dark:text-slate-500" },
  s: { label: "حرف صامت", desc: "لا يُنطق", cls: "text-slate-400 dark:text-slate-500" },
  // إدغام بلا غنة — كهرماني
  n: { label: "إدغام بلا غنّة", desc: "النون الساكنة قبل ل/ر تُدغم بلا غنّة", cls: "text-amber-600 dark:text-amber-400" },
  j: { label: "إدغام متجانس", desc: "حرفان متجانسان يصيران واحداً", cls: "text-amber-600 dark:text-amber-400" },
  r: { label: "إدغام متقارب", desc: "حرفان متقاربان يُدغم الأول في الثاني", cls: "text-amber-600 dark:text-amber-400" },
}

/** مجموعات الدليل اللوني — بترتيب العرض */
export const TAJWEED_LEGEND: { colorCls: string; title: string; rules: TajweedCode[] }[] = [
  {
    colorCls: "text-red-700 dark:text-red-300",
    title: "المدود",
    rules: ["m", "d", "M", "F", "6"],
  },
  {
    colorCls: "text-rose-600 dark:text-rose-300",
    title: "الغنن والإخفاء",
    rules: ["g", "G", "W", "i", "I", "b"],
  },
  {
    colorCls: "text-emerald-600 dark:text-emerald-400",
    title: "القلقلة",
    rules: ["q"],
  },
  {
    colorCls: "text-amber-600 dark:text-amber-400",
    title: "إدغام بلا غنّة",
    rules: ["n", "j", "r"],
  },
  {
    colorCls: "text-slate-400 dark:text-slate-500",
    title: "لا يُنطق",
    rules: ["h", "l", "s"],
  },
]

// ==================== الوصول للبيانات ====================

const ayahCache = new Map<string, TajweedSeg[][] | null>()

/** كلمات الآية بمقاطعها الملوّنة — null إن لم توجد بيانات (آية بلا شروح) */
export function getTajweedAyah(key: string): TajweedSeg[][] | null {
  if (ayahCache.has(key)) return ayahCache.get(key) ?? null
  const words = raw[key]
  const out = words ? (words as unknown as TajweedSeg[][]) : null
  ayahCache.set(key, out)
  return out
}

/** هل تتوفر بيانات تجويد للآية؟ (٦٢٣٦/٦٢٣٦ — احتياط دائماً) */
export function hasTajweed(key: string): boolean {
  return raw[key] !== undefined
}

/** كلمة خام كنص من مقاطعها */
export function segWordText(segs: TajweedSeg[]): string {
  return segs.map(([, t]) => t).join("")
}
