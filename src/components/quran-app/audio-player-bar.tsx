"use client"

// شريط المشغل العائم — يظهر أثناء التلاوة:
// مؤشر بصري متحرك (أعمدة صوتية)، تنقّل بين الآيات، تقديم داخل الآية،
// سرعة، تكرار، واختيار القارئ
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Play, Pause, SkipBack, SkipForward, Square, Repeat, Repeat1, Repeat2, X, Loader2 } from "lucide-react"
import { QARIS } from "@/lib/audio"
import { RATES, type Rate, type RepeatMode } from "@/hooks/use-ayah-audio"
import { cn } from "@/lib/utils"

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
function arNum(n: number | string): string {
  return String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("")
}

/** أعمدة الصوت المتحركة — تنبض أثناء التشغيل وتسكن عند الإيقاف */
function Equalizer({ active, paused }: { active: boolean; paused: boolean }) {
  const bars = [
    { d: "0.0s", dur: "0.85s" },
    { d: "0.15s", dur: "0.65s" },
    { d: "0.3s", dur: "0.95s" },
    { d: "0.1s", dur: "0.75s" },
    { d: "0.25s", dur: "0.9s" },
  ]
  return (
    <div
      className={cn("flex h-8 w-6 items-end justify-center gap-[2.5px]", paused && "opacity-50")}
      aria-hidden
    >
      {bars.map((b, i) => (
        <span
          key={i}
          className={cn(
            "eq-bar w-[3px] rounded-full bg-emerald-500",
            active ? "eq-on" : "scale-y-[0.3]",
          )}
          style={active ? { animationDelay: b.d, animationDuration: b.dur } : undefined}
        />
      ))}
    </div>
  )
}

interface PlayerBarProps {
  audio: {
    playingKey: string | null
    paused: boolean
    buffering: boolean
    currentTime: number
    duration: number
    fmtTime: (t: number) => string
    rate: Rate
    setRate: (r: Rate) => void
    repeat: RepeatMode
    setRepeat: (m: RepeatMode) => void
    index: number
    total: number
    qariId: string
    changeQari: (id: string) => void
    toggle: () => void
    seek: (t: number) => void
    step: (dir: 1 | -1) => void
    stop: () => void
  }
  /** وسم الآية الجارية: «البقرة ٢٥٥» */
  label: string
  /** وسم ثانوي: «الجزء ٣ • صفحة ٤٢» */
  sublabel: string
}

export function AudioPlayerBar({ audio, label, sublabel }: PlayerBarProps) {
  if (!audio.playingKey) return null

  const rateLabel = `×${arNum(audio.rate)}`.replace("٠.٧٥", "¾").replace("١.٢٥", "١¼")
  const repeatMeta: { icon: typeof Repeat; label: string; next: RepeatMode; title: string } =
    audio.repeat === "off"
      ? { icon: Repeat, label: "بلا", next: "ayah", title: "التكرار: متوقف — اضغط لتكرار الآية" }
      : audio.repeat === "ayah"
        ? { icon: Repeat1, label: "آية", next: "page", title: "التكرار: الآية الحالية — اضغط لتكرار الصفحة" }
        : { icon: Repeat2, label: "صفحة", next: "off", title: "التكرار: الصفحة كاملة — اضغط للإيقاف" }

  const RepeatIcon = repeatMeta.icon

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-600/30 bg-background/95 shadow-[0_-8px_30px_-10px_rgba(0,0,0,0.25)] backdrop-blur supports-[backdrop-filter]:bg-background/85"
      role="region"
      aria-label="مشغل التلاوة"
    >
      <div
        className="mx-auto w-full max-w-5xl space-y-1.5 px-4 py-2.5"
        style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
      >
        {/* السطر الأول: المؤشر البصري + الوسم + الإغلاق */}
        <div className="flex items-center gap-3">
          <Equalizer active={!audio.paused && !audio.buffering} paused={audio.paused || audio.buffering} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-extrabold text-foreground">{label}</p>
            <p className="truncate text-[10px] text-muted-foreground" dir="rtl">
              {audio.buffering ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  جارٍ التحميل…
                </span>
              ) : (
                <>
                  {sublabel}
                  {audio.total > 1 && (
                    <span className="tabular-nums">
                      {" "}
                      • آية {arNum(audio.index + 1)} من {arNum(audio.total)}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground" dir="ltr">
            {arNum(audio.fmtTime(audio.currentTime))} / {arNum(audio.fmtTime(audio.duration))}
          </span>
          <button
            type="button"
            onClick={audio.stop}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="إغلاق المشغل وإيقاف التلاوة"
            title="إيقاف"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* شريط التقدم — تقديم داخل الآية */}
        <Slider
          value={[Math.min(audio.currentTime, audio.duration || audio.currentTime)]}
          onValueChange={(v) => audio.seek(v[0])}
          max={Math.max(audio.duration || 1, 1)}
          min={0}
          step={0.5}
          dir="ltr"
          className="py-1"
          aria-label="التقدم داخل الآية"
        />

        {/* السطر الأخير: التحكم */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => audio.step(-1)}
              disabled={audio.index <= 0}
              aria-label="الآية السابقة"
              title="الآية السابقة"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-11 w-11 rounded-full bg-emerald-600 shadow-md hover:bg-emerald-700"
              onClick={audio.toggle}
              aria-label={audio.paused ? "استئناف التلاوة" : "إيقاف مؤقت"}
              title={audio.paused ? "استئناف" : "إيقاف مؤقت"}
            >
              {audio.buffering ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : audio.paused ? (
                <Play className="h-5 w-5 fill-current" />
              ) : (
                <Pause className="h-5 w-5 fill-current" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => audio.step(1)}
              disabled={audio.total > 0 && audio.index >= audio.total - 1}
              aria-label="الآية التالية"
              title="الآية التالية"
            >
              <SkipBack className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* السرعة */}
            <button
              type="button"
              onClick={() => {
                const i = RATES.indexOf(audio.rate)
                audio.setRate(RATES[(i + 1) % RATES.length])
              }}
              className="rounded-lg border border-border/70 px-2 py-1.5 text-[10px] font-extrabold tabular-nums text-muted-foreground transition-all hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400"
              title="سرعة التلاوة"
              aria-label={`سرعة التلاوة الحالية ${audio.rate} — اضغط للتغيير`}
            >
              {rateLabel}
            </button>

            {/* التكرار */}
            <button
              type="button"
              onClick={() => audio.setRepeat(repeatMeta.next)}
              aria-pressed={audio.repeat !== "off"}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-extrabold transition-all",
                audio.repeat === "off"
                  ? "border-border/70 text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400"
                  : "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              )}
              title={repeatMeta.title}
              aria-label={repeatMeta.title}
            >
              <RepeatIcon className="h-3.5 w-3.5" />
              {repeatMeta.label}
            </button>

            {/* القارئ */}
            <Select value={audio.qariId} onValueChange={audio.changeQari}>
              <SelectTrigger
                className="h-8 w-[7.5rem] border-border/70 text-[10px] font-bold"
                aria-label="اختيار القارئ"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {QARIS.map((q) => (
                  <SelectItem key={q.id} value={q.id} className="text-xs">
                    {q.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={audio.stop}
              aria-label="إيقاف التلاوة"
              title="إيقاف"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
