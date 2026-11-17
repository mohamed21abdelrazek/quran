"use client"

// وضع الإخفاء التدريجي: أخفِ كلمات الصفحة وآياتها تدريجياً حتى تتلوها كاملة من حفظك
// ثم قيّم نفسك بصدق لتُسجَّل الجلسة

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { HideablePage } from "./hideable-page"
import { fireConfetti } from "@/hooks/use-app"
import { useToast } from "@/hooks/use-toast"
import type { PagePayload } from "@/lib/mushaf-data"
import { HelpCircle, Sparkles, Check, Loader2, RefreshCw, ChevronRight } from "lucide-react"

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
function arNum(n: number): string {
  return String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("")
}

interface Props {
  page: number
  payload: PagePayload | null
  /** تسجيل الجلسة في التقدم */
  onLog: (score: number, detail: string) => Promise<void>
  /** الانتقال إلى المصحف */
  openMushaf: (page: number, label: string) => void
}

export function HideDrill({ page, payload, onLog, openMushaf }: Props) {
  const { toast } = useToast()
  const [logging, setLogging] = useState(false)
  const [logged, setLogged] = useState(false)

  /** تسجيل الجلسة بتقدير المستخدم لإتقانه */
  const logSession = async (score: number, label: string) => {
    if (logging) return
    setLogging(true)
    try {
      await onLog(score, `إخفاء تدريجي صفحة ${page}`)
      setLogged(true)
      if (score >= 100) fireConfetti()
      toast({
        title: score >= 100 ? "تقبل الله! أتقنتها" : "سُجّلت الجلسة",
        description: `${label} — صفحة ${arNum(page)}`,
      })
    } catch {
      toast({ title: "تعذر تسجيل الجلسة", variant: "destructive" })
    } finally {
      setLogging(false)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* شرح الوضع */}
      <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-[11px] leading-6 text-muted-foreground">
          طريقة الحفّاظ في التثبيت: اقرأ الصفحة ثم أخفِ <span className="font-bold text-foreground">كلمة كلمة</span> أو{" "}
          <span className="font-bold text-foreground">آية آية</span> حتى تختفي الصفحة كلها وأنت تتلوها من حفظك. إن
          تعثرت في كلمة اضغط فراغها لتلمحها لحظة ثم تعود مخفية.
        </p>
      </div>

      <HideablePage
        payload={payload}
      >
        {({ hiddenCount }) => {
          return (
            <>
              {/* تسجيل الجلسة */}
              <div className="rounded-xl border border-border/70 bg-card/70 p-3">
                {!logged ? (
                  <>
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      أتممت تسميعها بالإخفاء؟ قيّم نفسك بصدق:
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        className="h-9 gap-1 bg-emerald-600 text-[11px] font-extrabold hover:bg-emerald-700"
                        onClick={() => logSession(100, "أتقنتها كاملة")}
                        disabled={logging || hiddenCount === 0}
                      >
                        {logging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        أتقنتها
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1 border-amber-400/60 text-[11px] font-extrabold text-amber-700 hover:bg-amber-50 dark:text-amber-300"
                        onClick={() => logSession(75, "جيد مع تردد بسيط")}
                        disabled={logging || hiddenCount === 0}
                      >
                        جيد
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1 border-red-300/60 text-[11px] font-extrabold text-red-700 hover:bg-red-50 dark:text-red-300"
                        onClick={() => logSession(50, "أحتاج مراجعة")}
                        disabled={logging || hiddenCount === 0}
                      >
                        أحتاج مراجعة
                      </Button>
                    </div>
                    {hiddenCount === 0 && (
                      <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <ChevronRight className="h-3 w-3" />
                        ابدأ بإخفاء كلمة أو آية — الأزرار أعلاه
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <Check className="h-4 w-4" />
                      سُجّلت جلستك — أعد الإخفاء من جديد أو غيّر الصفحة
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 text-[11px]"
                      onClick={() => setLogged(false)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      جلسة جديدة
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 text-[11px] text-muted-foreground"
                  onClick={() => openMushaf(page, "مراجعة قبل الإخفاء")}
                >
                  راجع الصفحة كاملة في المصحف
                </Button>
              </div>
            </>
          )
        }}
      </HideablePage>
    </div>
  )
}
