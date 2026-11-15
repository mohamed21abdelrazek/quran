"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageGrid } from "./page-grid"
import type { AppState } from "@/lib/types"
import { INTENSITY_META, type Intensity } from "@/lib/content"
import { formatPages, pagesToRanges } from "@/lib/format"
import { juzPageRange } from "@/lib/quran"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  User,
  Target,
  Brain,
  MapPin,
  BookOpen,
  Save,
  Trash2,
  Pencil,
  Loader2,
  Clock3,
} from "lucide-react"

const TIMEZONES = [
  "Africa/Cairo",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Amman",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Europe/Istanbul",
  "Europe/London",
  "America/New_York",
  "UTC",
]

export function SettingsView({
  state,
  load,
  action,
}: {
  state: AppState
  load: () => Promise<void>
  action: (url: string, body: unknown) => Promise<Record<string, unknown>>
}) {
  const { toast } = useToast()
  const p = state.profile
  const [name, setName] = useState(p.name)
  const [capacity, setCapacity] = useState(p.dailyCapacity)
  const [unitSize, setUnitSize] = useState(p.unitSize)
  const [intensity, setIntensity] = useState<Intensity>(p.intensity)
  const [autoAdjust, setAutoAdjust] = useState(p.autoAdjust)
  const [timezone, setTimezone] = useState(p.timezone)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editSet, setEditSet] = useState<Set<number>>(new Set())
  const [savingRanges, setSavingRanges] = useState(false)

  const memorizedSet = useMemo(() => {
    const s = new Set<number>()
    state.memorized.strengths.forEach((v, i) => {
      if (v >= 0) s.add(i + 1)
    })
    return s
  }, [state.memorized.strengths])

  const set = (fn: () => void) => {
    fn()
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      await action("/api/settings", {
        name: name.trim(),
        dailyCapacity: capacity,
        unitSize,
        intensity,
        autoAdjust,
        timezone,
      })
      toast({ title: "تم الحفظ", description: "ستُطبق إعداداتك الجديدة على الخطط القادمة" })
      setDirty(false)
      await load()
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "تعذر الحفظ" })
    } finally {
      setSaving(false)
    }
  }

  const openEditor = () => {
    setEditSet(new Set(memorizedSet))
    setEditOpen(true)
  }

  const saveRanges = async () => {
    setSavingRanges(true)
    try {
      const added: number[] = []
      const removed: number[] = []
      for (let page = 1; page <= 604; page++) {
        const was = memorizedSet.has(page)
        const now = editSet.has(page)
        if (now && !was) added.push(page)
        if (!now && was) removed.push(page)
      }
      if (added.length === 0 && removed.length === 0) {
        setEditOpen(false)
        return
      }
      await action("/api/ranges", { add: pagesToRanges(added), remove: pagesToRanges(removed) })
      toast({
        title: "تم تحديث حفظك",
        description: `${added.length > 0 ? `أضفنا ${formatPages(added.length)}` : ""}${added.length > 0 && removed.length > 0 ? " و" : ""}${removed.length > 0 ? `أزلنا ${formatPages(removed.length)}` : ""} — وستتكيف خطتك فوراً`,
      })
      setEditOpen(false)
      await load()
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "تعذر التحديث" })
    } finally {
      setSavingRanges(false)
    }
  }

  const reset = async () => {
    try {
      await action("/api/reset", {})
      toast({ title: "تمت إعادة الضبط", description: "سنبدأ من جديد — حدد حفظك من جديد" })
      await load()
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "تعذرت العملية" })
    }
  }

  const cycleEstimate = Math.ceil(state.memorized.total / capacity)

  return (
    <div className="space-y-5">
      {/* الاسم */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-5 w-5 text-primary" />
            ملفك
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="settings-name">الاسم</Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => set(() => setName(e.target.value))}
              placeholder="اسمك الذي يخاطبك به وِردي"
              maxLength={40}
            />
          </div>
        </CardContent>
      </Card>

      {/* الخطة اليومية */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-5 w-5 text-primary" />
            سعة الخطة اليومية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>عدد الصفحات يومياً</Label>
              <Badge variant="secondary" className="text-sm font-extrabold tabular-nums">{capacity}</Badge>
            </div>
            <Slider
              value={[capacity]}
              min={1}
              max={10}
              step={1}
              onValueChange={(v) => set(() => setCapacity(v[0]))}
              aria-label="عدد الصفحات اليومي"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              بهذه الوتيرة تكمل جولة كاملة على {formatPages(state.memorized.total)} خلال{" "}
              <span className="font-bold text-foreground">{cycleEstimate} يوماً تقريباً</span> (يُطبق من خطة الغد).
            </p>
          </div>

          <div className="space-y-2.5">
            <Label>حجم المهمة الواحدة</Label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 5].map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => set(() => setUnitSize(u))}
                  aria-pressed={unitSize === u}
                  className={cn(
                    "rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-all",
                    unitSize === u ? "border-primary bg-primary text-primary-foreground" : "border-border/60 hover:border-primary/40"
                  )}
                >
                  {u === 1 ? "صفحة" : `${u} صفحات`}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* وتيرة المراجعة */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            وتيرة المراجعة والذكاء
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(INTENSITY_META) as Intensity[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set(() => setIntensity(k))}
                aria-pressed={intensity === k}
                className={cn(
                  "rounded-xl border-2 p-3.5 text-right transition-all",
                  intensity === k ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/40"
                )}
              >
                <p className="text-sm font-bold">{INTENSITY_META[k].name}</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{INTENSITY_META[k].desc}</p>
                <p className="mt-2 text-[10px] font-bold text-primary/70" dir="ltr">
                  {INTENSITY_META[k].intervals.join(" → ")} يوم
                </p>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 p-4">
            <div className="max-w-[75%]">
              <Label htmlFor="auto-adjust" className="text-sm font-bold">التعديل التلقائي اليومي</Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                يراقب النظام إنجازك في آخر 7 أيام: إن قصّرت خفّف الحمل تدريجياً، وإن أتممت كل شيء مع سلسلة قوية زاده بحدود.
              </p>
            </div>
            <Switch id="auto-adjust" checked={autoAdjust} onCheckedChange={(v) => set(() => setAutoAdjust(v))} />
          </div>
        </CardContent>
      </Card>

      {/* المنطقة الزمنية */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-5 w-5 text-primary" />
            المنطقة الزمنية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={timezone} onValueChange={(v) => set(() => setTimezone(v))}>
            <SelectTrigger className="w-full sm:w-72" aria-label="المنطقة الزمنية">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz === "Africa/Cairo" ? "القاهرة (Africa/Cairo)" : tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            تُحسب بها بداية يومك الجديد ووردك اليومي
          </p>
        </CardContent>
      </Card>

      {/* حفظ الصفحات المحفوظة */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-primary" />
            صفحاتك المحفوظة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-sm font-bold">
              {state.memorized.total} صفحة
            </Badge>
            <Badge variant="outline" className="text-xs">
              {pagesToRanges([...memorizedSet]).length} نطاق متصل
            </Badge>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            إن حفظت صفحات جديدة أضفها هنا لتدخل خطة المراجعة فوراً، وإن أردت إزالة صفحة حدّثها في أي وقت.
          </p>
          <Button variant="secondary" onClick={openEditor}>
            <Pencil className="h-4 w-4" />
            تعديل الصفحات المحفوظة
          </Button>
        </CardContent>
      </Card>

      {/* زر الحفظ */}
      {dirty && (
        <div className="sticky bottom-4 z-10 flex justify-center">
          <Button size="lg" className="glow-emerald shadow-lg" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            حفظ التغييرات
          </Button>
        </div>
      )}

      {/* منطقة الخطر */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-bold text-destructive">إعادة ضبط كاملة</p>
            <p className="mt-1 text-xs text-muted-foreground">يمحو كل بياناتك وسجلاتك ويعيد التهيئة من الصفر</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4" />
                إعادة الضبط
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>هل أنت متأكد تماماً؟</AlertDialogTitle>
                <AlertDialogDescription>
                  ستمحو هذه العملية خططك وسجل إنجازك ونقاطك وأوسمتك نهائياً. لا يمكن التراجع.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>تراجع</AlertDialogCancel>
                <AlertDialogAction onClick={reset} className="bg-destructive text-white hover:bg-destructive/90">
                  نعم، امح كل شيء
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* حوار تعديل الصفحات */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تعديل الصفحات المحفوظة</DialogTitle>
            <DialogDescription>
              اضغط على الصفحات لتحديدها أو إلغائها، أو اضغط على اسم الجزء لتغييره كاملاً. الإطار الذهبي يعني بداية سورة.
            </DialogDescription>
          </DialogHeader>
          <PageGrid
            mode="select"
            selected={editSet}
            onTogglePage={(page) =>
              setEditSet((prev) => {
                const next = new Set(prev)
                if (next.has(page)) next.delete(page)
                else next.add(page)
                return next
              })
            }
            onToggleJuz={(juz) => {
              const { from, to } = juzPageRange(juz)
              const allIn = Array.from({ length: to - from + 1 }, (_, i) => from + i).every((pg) => editSet.has(pg))
              setEditSet((prev) => {
                const next = new Set(prev)
                for (let pg = from; pg <= to; pg++) {
                  if (allIn) next.delete(pg)
                  else next.add(pg)
                }
                return next
              })
            }}
          />
          <DialogFooter className="flex-row-reverse sm:justify-start">
            <Button onClick={saveRanges} disabled={savingRanges}>
              {savingRanges ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ التعديلات ({editSet.size} صفحة)
            </Button>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
