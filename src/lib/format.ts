// أدوات تنسيق عربية للواجهة

/** دمج صفحات متفرقة في نطاقات متصلة */
export function pagesToRanges(pages: number[]): { from: number; to: number }[] {
  const sorted = [...pages].sort((a, b) => a - b)
  const ranges: { from: number; to: number }[] = []
  for (const p of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && p === last.to + 1) last.to = p
    else ranges.push({ from: p, to: p })
  }
  return ranges
}

/** توسيع نطاقات إلى مجموعة صفحات */
export function rangesToSet(ranges: { from: number; to: number }[]): Set<number> {
  const set = new Set<number>()
  for (const r of ranges) {
    for (let p = r.from; p <= r.to; p++) set.add(p)
  }
  return set
}

/** تنسيق عدد الصفحات بالعربية */
export function formatPages(n: number): string {
  if (n === 1) return "صفحة واحدة"
  if (n === 2) return "صفحتان"
  if (n === 3) return "3 صفحات"
  if (n <= 10) return `${n} صفحات`
  return `${n} صفحة`
}

/** تنسيق عدد الأيام بالعربية */
export function formatDays(n: number): string {
  if (n === 1) return "يوم واحد"
  if (n === 2) return "يومان"
  if (n <= 10) return `${n} أيام`
  return `${n} يوماً`
}

/** اسم اليوم بالعربية من تاريخ YYYY-MM-DD */
export function weekdayAr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(d).toLocaleDateString === undefined
    ? ""
    : new Intl.DateTimeFormat("ar", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** يوم قصير: سبت/أحد... */
export function weekdayShortAr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Intl.DateTimeFormat("ar", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** تاريخ مقروء: 15 يناير 2025 */
export function dateAr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** تحويل الفرق بين تاريخين إلى نص تأخر */
export function overdueText(days: number): string {
  if (days <= 0) return "مستحق اليوم"
  return `متأخر منذ ${formatDays(days)}`
}

/** عدد التقريبي للأجزاء من عدد الصفحات */
export function pagesToJuzApprox(pages: number): string {
  const juz = pages / 20.1
  if (juz < 1) return "أقل من جزء"
  return `≈ ${Math.round(juz * 10) / 10} جزء`
}
