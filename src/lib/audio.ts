// التلاوة — قرّاء everyayah.com (روابط مجانية ثابتة)
// الصوت يُحفظ في كاش عامل الخدمة بعد أول تشغيل فيعمل أوفلاين
export interface Qari {
  id: string
  name: string
  note: string
}

export const QARIS: Qari[] = [
  { id: "Alafasy_128kbps", name: "مشاري العفاسي", note: "مرتل — واضح ومريح للحفظ" },
  { id: "Husary_128kbps", name: "محمود خليل الحصري", note: "مرتل — إمام القرّاء في التجويد" },
  { id: "Minshawy_Murattal_128kbps", name: "محمد صديق المنشاوي", note: "مرتل" },
  { id: "Abdurrahmaan_As-Sudais_192kbps", name: "عبد الرحمن السديس", note: "مرتل" },
  { id: "Yasser_Ad-Dussary_128kbps", name: "ياسر الدوسري", note: "مرتل خاشع" },
]

export const DEFAULT_QARI_ID = "Alafasy_128kbps"
export const QARI_LS_KEY = "wardi:qari"

/** رابط تلاوة آية: everyayah/data/{القارئ}/{سورة ٣ أرقام}{آية ٣ أرقام}.mp3 */
export function ayahAudioUrl(qariId: string, s: number, n: number): string {
  return `https://everyayah.com/data/${qariId}/${String(s).padStart(3, "0")}${String(n).padStart(3, "0")}.mp3`
}
