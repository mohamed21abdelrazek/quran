"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { JUZ_START, juzPageRange, SURAHS, surahAtPage, TOTAL_JUZ } from "@/lib/quran"

const SURAH_STARTS = new Set(SURAHS.map((s) => s.page))

/** ألوان قوة الحفظ من الضعف إلى المتانة */
const STRENGTH_COLORS = [
  "bg-amber-500/80 text-white", // 0 يحتاج تقوية
  "bg-lime-600/70 text-white", // 1
  "bg-emerald-500/60 text-white", // 2
  "bg-emerald-600/75 text-white", // 3
  "bg-emerald-700/85 text-white", // 4
  "bg-emerald-800 text-white", // 5 متين
]

const STRENGTH_LABELS = ["يحتاج تقوية", "ضعيف", "متوسط", "جيد", "قوي", "متين"]

export function PageGrid({
  mode,
  selected,
  onTogglePage,
  onToggleJuz,
  strengths,
  className,
}: {
  mode: "select" | "strength"
  selected?: Set<number>
  onTogglePage?: (page: number) => void
  onToggleJuz?: (juz: number) => void
  strengths?: number[] // strengths[page-1]، و -1 غير محفوظ
  className?: string
}) {
  const sections = useMemo(() => {
    const list: { juz: number; from: number; to: number }[] = []
    for (let j = 1; j <= TOTAL_JUZ; j++) {
      list.push({ juz: j, ...juzPageRange(j) })
    }
    return list
  }, [])

  const juzState = (from: number, to: number): "all" | "some" | "none" => {
    if (!selected) return "none"
    let count = 0
    for (let p = from; p <= to; p++) if (selected.has(p)) count++
    if (count === 0) return "none"
    return count === to - from + 1 ? "all" : "some"
  }

  return (
    <div className={cn("max-h-[420px] overflow-y-auto scroll-thin rounded-xl border border-border bg-card/50 p-3", className)} role="grid" aria-label="صفحات المصحف الست مئة والأربع">
      <div className="space-y-4">
        {sections.map(({ juz, from, to }) => {
          const state = mode === "select" ? juzState(from, to) : null
          const isSurahStartJuz = JUZ_START[juz - 1] !== undefined
          void isSurahStartJuz
          return (
            <div key={juz}>
              {mode === "select" ? (
                <button
                  type="button"
                  onClick={() => onToggleJuz?.(juz)}
                  className={cn(
                    "mb-1.5 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors",
                    state === "all"
                      ? "bg-primary text-primary-foreground"
                      : state === "some"
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted"
                  )}
                  aria-pressed={state === "all"}
                >
                  <span>الجزء {juz}</span>
                  <span className="text-[10px] font-medium opacity-80">
                    {from} – {to}
                  </span>
                </button>
              ) : (
                <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-bold text-muted-foreground">
                  <span>الجزء {juz}</span>
                  <span className="opacity-70">
                    {from} – {to}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-1" role="row">
                {Array.from({ length: to - from + 1 }, (_, i) => {
                  const page = from + i
                  const surahStart = SURAH_STARTS.has(page)
                  const surahName = surahStart ? surahAtPage(page) : null

                  if (mode === "select") {
                    const isSelected = selected?.has(page) ?? false
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => onTogglePage?.(page)}
                        title={surahName ? `صفحة ${page} — تبدأ هنا سورة ${surahName}` : `صفحة ${page}`}
                        aria-pressed={isSelected}
                        aria-label={`صفحة ${page}${surahName ? ` — سورة ${surahName}` : ""}`}
                        className={cn(
                          "h-7 w-7 rounded-md text-[9px] font-bold tabular-nums transition-all duration-150 focus-visible:outline-2 focus-visible:outline-ring",
                          surahStart && "ring-1 ring-gold",
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-sm scale-105"
                            : "bg-muted/60 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {page}
                      </button>
                    )
                  }

                  // وضع خريطة الإتقان
                  const s = strengths ? strengths[page - 1] : -1
                  const memorized = s != null && s >= 0
                  return (
                    <div
                      key={page}
                      title={
                        memorized
                          ? `صفحة ${page} — ${STRENGTH_LABELS[s]}${surahName ? ` — سورة ${surahName}` : ""}`
                          : `صفحة ${page} — غير محفوظة`
                      }
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md text-[9px] font-bold tabular-nums",
                        surahStart && memorized && "ring-1 ring-gold",
                        memorized
                          ? STRENGTH_COLORS[s]
                          : "bg-muted/40 text-muted-foreground/40"
                      )}
                    >
                      {page}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function StrengthLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm bg-muted/60" /> غير محفوظ
      </span>
      {STRENGTH_LABELS.map((label, i) => (
        <span key={label} className="flex items-center gap-1">
          <span className={cn("h-3 w-3 rounded-sm", STRENGTH_COLORS[i])} /> {label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm ring-1 ring-gold" /> بداية سورة
      </span>
    </div>
  )
}

export { STRENGTH_COLORS, STRENGTH_LABELS }
