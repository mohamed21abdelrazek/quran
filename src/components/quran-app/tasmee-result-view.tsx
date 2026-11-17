"use client"

// عرض نتيجة التسميع المشترك: الدرجة + الملخص + السطر المصحّح كلمة كلمة
// يستخدمه التسميع الكتابي والصوتي معاً

import { ProgressRing } from "./progress-ring"
import { VERDICT_CLASS, type TasmeeResult, type AlignOp } from "@/lib/tasmee"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
function arNum(n: number): string {
  return String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("")
}

interface Props {
  result: TasmeeResult
  /** ما سمعه النظام من التلاوة (التسميع الصوتي فقط) */
  transcription?: string
}

export function TasmeeResultView({ result, transcription }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <ProgressRing
          value={result.score}
          max={100}
          size={110}
          label={`${arNum(result.score)}٪`}
          sublabel="درجة التسميع"
        />
        <div className="space-y-1.5 text-xs">
          <p className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4" /> {arNum(result.counts.ok)} صحيحة
          </p>
          {result.counts.near > 0 && (
            <p className="text-amber-700 dark:text-amber-300">{arNum(result.counts.near)} قريبة — راجعها</p>
          )}
          {result.counts.wrong > 0 && (
            <p className="text-red-700 dark:text-red-400">{arNum(result.counts.wrong)} كلمة مكان أخرى</p>
          )}
          {result.counts.missing > 0 && (
            <p className="text-red-500">{arNum(result.counts.missing)} ساقطة</p>
          )}
          {result.counts.extra > 0 && (
            <p className="text-amber-600 dark:text-amber-400">{arNum(result.counts.extra)} زائدة</p>
          )}
        </div>
      </div>

      {/* ما سمعه النظام */}
      {transcription && (
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
          <p className="mb-1 text-[11px] font-extrabold text-muted-foreground">ما سمعناه من تلاوتك:</p>
          <p className="text-sm leading-7 text-foreground/85" dir="rtl">{transcription}</p>
        </div>
      )}

      {/* السطر المصحّح */}
      <div
        className="scroll-thin max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-border/70 bg-muted/40 p-3"
        dir="rtl"
      >
        {(() => {
          return result.ops.map((op: AlignOp, i: number) => {
            let node: React.ReactNode = null
            if (op.type === "ok") {
              node = (
                <span key={i} className={cn("font-quran text-lg", VERDICT_CLASS.ok)}>
                  {op.expected}{" "}
                </span>
              )
            } else if (op.type === "near") {
              node = (
                <span
                  key={i}
                  className={cn("font-quran text-lg", VERDICT_CLASS.near)}
                  title={`قريبة (${Math.round((op.sim ?? 0) * 100)}٪) — الصواب: ${op.expected}`}
                >
                  {op.user}{" "}
                  <sup className="text-[10px]">({op.expected})</sup>{" "}
                </span>
              )
            } else if (op.type === "wrong") {
              node = (
                <span key={i} className="font-quran text-lg">
                  <span className="text-red-700 dark:text-red-400">{op.user}</span>
                  <sup className="text-[10px] text-emerald-700 dark:text-emerald-300"> الصواب: {op.expected}</sup>{" "}
                </span>
              )
            } else if (op.type === "missing") {
              node = (
                <span key={i} className={cn("font-quran text-lg", VERDICT_CLASS.missing)} title="ساقطة من التسميع">
                  [{op.expected}]{" "}
                </span>
              )
            } else {
              node = (
                <span key={i} className={cn("font-quran text-lg", VERDICT_CLASS.extra)} title="كلمة زائدة ليست في الآية">
                  {op.user}{" "}
                </span>
              )
            }
            return node
          })
        })()}
      </div>
    </div>
  )
}
