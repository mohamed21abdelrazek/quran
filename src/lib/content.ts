// محتوى تحفيزي وتعريفات النظام (مستويات، أوسمة، جودات المراجعة)

export type Intensity = "relaxed" | "balanced" | "intensive"
export type Quality = "perfect" | "good" | "hard"

export interface MotivationItem {
  text: string
  source: string
  kind: "ayah" | "hadith" | "wisdom"
}

export const MOTIVATIONS: MotivationItem[] = [
  { text: "وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ", source: "سورة القمر – 17", kind: "ayah" },
  { text: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", source: "صحيح البخاري", kind: "hadith" },
  { text: "الْمَاهِرُ بِالْقُرْآنِ مَعَ السَّفَرَةِ الْكِرَامِ الْبَرَرَةِ", source: "صحيح مسلم", kind: "hadith" },
  { text: "اقْرَؤُوا الْقُرْآنَ فَإِنَّهُ يَأْتِي يَوْمَ الْقِيَامَةِ شَفِيعًا لِأَصْحَابِهِ", source: "صحيح مسلم", kind: "hadith" },
  { text: "كِتَابٌ أَنزَلْنَاهُ إِلَيْكَ مُبَارَكٌ لِّيَتَدَبَّرُوا آيَاتِهِ وَلِيَتَذَكَّرَ أُولُو الْأَلْبَابِ", source: "سورة ص – 29", kind: "ayah" },
  { text: "إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ", source: "سورة الحجر – 9", kind: "ayah" },
  { text: "مَنْ قَرَأَ حَرْفًا مِنْ كِتَابِ اللهِ فَلَهُ بِهِ حَسَنَةٌ، وَالْحَسَنَةُ بِعَشْرِ أَمْثَالِهَا", source: "سنن الترمذي", kind: "hadith" },
  { text: "وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا", source: "سورة المزمل – 4", kind: "ayah" },
  { text: "أَحَبُّ الْأَعْمَالِ إِلَى اللهِ أَدْوَمُهَا وَإِنْ قَلَّ", source: "متفق عليه", kind: "hadith" },
  { text: "وَقُل رَّبِّ زِدْنِي عِلْمًا", source: "سورة طه – 114", kind: "ayah" },
  { text: "لَا حَسَدَ إِلَّا فِي اثْنَتَيْنِ: رَجُلٌ آتَاهُ اللهُ الْقُرْآنَ فَهُوَ يَقُومُ بِهِ اللَّيْلَ وَالنَّهَارَ", source: "متفق عليه", kind: "hadith" },
  { text: "الَّذِينَ آتَيْنَاهُمُ الْكِتَابَ يَتْلُونَهُ حَقَّ تِلَاوَتِهِ أُولَئِكَ يُؤْمِنُونَ بِهِ", source: "سورة البقرة – 121", kind: "ayah" },
  { text: "يُقَالُ لِصَاحِبِ الْقُرْآنِ: اقْرَأْ وَارْتَقِ وَرَتِّلْ كُنْتَ تُرَتِّلُ فِي الدُّنْيَا، فَمَنْزِلُكَ عِنْدَ آخِرِ آيَةٍ تَقْرَؤُهَا", source: "سنن الترمذي", kind: "hadith" },
  { text: "أَفَلَا يَتَدَبَّرُونَ الْقُرْآنَ أَمْ عَلَى قُلُوبٍ أَقْفَالُهَا", source: "سورة محمد – 24", kind: "ayah" },
  { text: "الصِّيَامُ وَالْقُرْآنُ يَشْفَعَانِ لِلْعَبْدِ يَوْمَ الْقِيَامَةِ", source: "مسند أحمد", kind: "hadith" },
  { text: "لَا تُؤَجِّلْ وِرْدَ الْيَوْمِ إِلَى الْغَدِ؛ فَرَصَّتُكَ الْيَوْمَ أَثْمَنُ مِنَ اسْتِعْذَارِ الْغَدِ", source: "حكمة", kind: "wisdom" },
  { text: "مَنْ رَاجَعَ الْيَوْمَ صَفْحَةً ثَبَتَتْ غَدًا؛ فَالْمُرَاجَعَةُ نُورٌ عَلَى نُور", source: "حكمة", kind: "wisdom" },
  { text: "خَطْوَةٌ صَغِيرَةٌ كُلَّ يَوْمٍ خَيْرٌ مِنْ قَفْزَةٍ تُتْعِبُكَ ثُمَّ تَتْرُكُكَ", source: "حكمة", kind: "wisdom" },
]

/** نص التحفيز لهذا اليوم (يتغير يومياً بشكل حتمي) */
export function motivationFor(dateStr: string): MotivationItem {
  const seed = Number(dateStr.replace(/-/g, ""))
  return MOTIVATIONS[seed % MOTIVATIONS.length]
}

// ---------------- المستويات ----------------
export interface LevelDef {
  threshold: number
  name: string
}

export const LEVELS: LevelDef[] = [
  { threshold: 0, name: "مبتدئ" },
  { threshold: 150, name: "مجتهد" },
  { threshold: 400, name: "صاحب وِرد" },
  { threshold: 900, name: "مراجع منتظم" },
  { threshold: 1800, name: "مراجع ماهر" },
  { threshold: 3500, name: "متقن" },
  { threshold: 7000, name: "حافظ متقن" },
  { threshold: 15000, name: "إمام المراجعة" },
]

export function levelFromXp(xp: number) {
  let index = 0
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].threshold) index = i
  }
  const current = LEVELS[index]
  const next = LEVELS[index + 1] ?? null
  const progress = next
    ? Math.min(1, (xp - current.threshold) / (next.threshold - current.threshold))
    : 1
  return { index, name: current.name, nextThreshold: next ? next.threshold : null, progress }
}

// ---------------- الأوسمة ----------------
export interface BadgeDef {
  id: string
  name: string
  description: string
  icon: string // اسم أيقونة lucide
}

export const BADGES: BadgeDef[] = [
  { id: "first_step", name: "البداية المباركة", description: "أنجزت أول مهمة مراجعة", icon: "Sparkles" },
  { id: "perfect_day", name: "يوم مثالي", description: "أنجزت ورد يومك كاملاً", icon: "Sun" },
  { id: "streak_3", name: "وِرد ثابت", description: "راجعت 3 أيام متتالية", icon: "Flame" },
  { id: "streak_7", name: "أسبوع النور", description: "حافظت على المراجعة 7 أيام متتالية", icon: "Flame" },
  { id: "streak_14", name: "أسبوعان من العزيمة", description: "راجعت 14 يوماً متتالياً", icon: "Zap" },
  { id: "streak_30", name: "شهر الصدق", description: "راجعت 30 يوماً متتالياً بلا انقطاع", icon: "Trophy" },
  { id: "pages_50", name: "نصف المئة", description: "راجعت 50 صفحة منذ البداية", icon: "BookOpen" },
  { id: "pages_100", name: "مئة صفحة", description: "راجعت 100 صفحة منذ البداية", icon: "BookMarked" },
  { id: "pages_500", name: "خمسمئة صفحة", description: "راجعت 500 صفحة منذ البداية", icon: "Books" },
  { id: "pages_1000", name: "ألف صفحة", description: "راجعت 1000 صفحة منذ البداية", icon: "Gem" },
  { id: "full_coverage", name: "الدورة الكاملة", description: "راجعت كل صفحاتك المحفوظة مرة واحدة على الأقل", icon: "Crown" },
  { id: "comeback", name: "العودة القوية", description: "عدت للمراجعة بعد انقطاع ولم تستسلم", icon: "Heart" },
]

// ---------------- الجودات ----------------
export const QUALITY_META: Record<Quality, { label: string; hint: string; xpPerPage: number }> = {
  perfect: { label: "أتقنتها تماماً", hint: "مراجعة متقنة بلا تردد", xpPerPage: 15 },
  good: { label: "جيدة", hint: "راجعتها ببعض التوقف", xpPerPage: 10 },
  hard: { label: "صعبة", hint: "احتجت نظراً وتكراراً", xpPerPage: 5 },
}

export const INTENSITY_META: Record<
  Intensity,
  { name: string; desc: string; intervals: number[] }
> = {
  relaxed: {
    name: "هادئة",
    desc: "فترات أطول بين المراجعات — مناسب إذا كانت ظروفك مزدحمة",
    intervals: [2, 4, 8, 15, 30, 30],
  },
  balanced: {
    name: "متوازنة",
    desc: "توازن مثالي بين التثبيت والراحة — الخيار الموصى به",
    intervals: [1, 2, 4, 8, 16, 30],
  },
  intensive: {
    name: "حماسية",
    desc: "مراجعات متقاربة لتثبيت أقوى في وقت أقل",
    intervals: [1, 1, 2, 4, 8, 15],
  },
}

export const BASELINE_META: Record<string, { label: string; desc: string; strength: number }> = {
  weak: { label: "يحتاج تقوية", desc: "أحفظها لكن تحتاج مراجعة مكثفة", strength: 0 },
  medium: { label: "حفظ جيد", desc: "أثبّتها غالباً مع بعض النسيان", strength: 2 },
  strong: { label: "حفظ متين", desc: "أعرفها جيداً وأثق فيها", strength: 4 },
}
