"use client"

// كلمة/كلمات تجويدية ملوّنة — تُرسم داخل نص المصحف التفاعلي
import { TAJWEED_RULES, type TajweedSeg } from "@/lib/tajweed"
import { cn } from "@/lib/utils"

/** كلمة واحدة بمقاطعها الملوّنة */
export function TajweedWord({ segs, className }: { segs: TajweedSeg; className?: string }) {
  return (
    <span className={className}>
      {segs.map(([code, text], i) =>
        code ? (
          <span key={i} className={cn(TAJWEED_RULES[code].cls)} title={TAJWEED_RULES[code].label}>
            {text}
          </span>
        ) : (
          <span key={i}>{text}</span>
        ),
      )}
    </span>
  )
}

/**
 * نص آية كامل بكلماته الملوّنة.
 * ملاحظة: يُستخدم داخل زر الآية غالباً — لذلك الكلمات spans بلا تداخل أزرار،
 * وتصير أزراراً فقط عند تمرير onWordClick (كبطاقة الكلمات الصعبة).
 */
export function TajweedWords({
  words,
  onWordClick,
  wordClassName,
  activeWord,
}: {
  words: TajweedSeg[][]
  onWordClick?: (index: number, text: string) => void
  wordClassName?: (index: number) => string | undefined
  /** فهرس كلمة نشطة (مثل كلمة صعبة محددة) */
  activeWord?: number | null
}) {
  return (
    <>
      {words.map((segs, i) => {
        const plain = segs.map(([, t]) => t).join("")
        const clickable = Boolean(onWordClick)
        const content = <TajweedWord segs={segs} />
        return (
          <span key={i}>
            {clickable ? (
              <button
                type="button"
                onClick={() => onWordClick?.(i, plain)}
                className={cn(
                  "cursor-pointer transition-colors",
                  wordClassName?.(i),
                  i === activeWord && "rounded bg-amber-200/80 px-0.5 dark:bg-amber-700/50",
                )}
                title="كلمة صعبة؟ اضغطها لإضافتها"
              >
                {content}
              </button>
            ) : (
              <span className={wordClassName?.(i)}>{content}</span>
            )}{" "}
          </span>
        )
      })}
    </>
  )
}
