"use client"

import { useState } from "react"
import { useApp } from "@/hooks/use-app"
import { Logo, LogoMark } from "@/components/quran-app/logo"
import { OnboardingView } from "@/components/quran-app/onboarding"
import { DashboardView } from "@/components/quran-app/dashboard"
import { ProgressView } from "@/components/quran-app/progress-view"
import { SettingsView } from "@/components/quran-app/settings-view"
import { MushafView, type WirdTarget } from "@/components/quran-app/mushaf-view"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CalendarCheck2,
  TrendingUp,
  Settings2,
  BookOpen,
  Sun,
  Moon,
  Flame,
  Star,
  RefreshCw,
} from "lucide-react"

type View = "today" | "mushaf" | "progress" | "settings"

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="تبديل المظهر بين النهاري والليلي"
    >
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="h-4 w-4 dark:hidden" />
    </Button>
  )
}

export default function Page() {
  const { state, loading, error, load, action } = useApp()
  const [view, setView] = useState<View>("today")
  const [refreshing, setRefreshing] = useState(false)
  const [wird, setWird] = useState<WirdTarget | null>(null)

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  /** الانتقال المباشر إلى الوِرد داخل المصحف */
  const openWird = (from: number, to: number, label: string) => {
    setWird({ from, to, label })
    setView("mushaf")
  }

  // شاشة التحميل
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background pattern-islamic">
        <div className="flex h-20 w-20 animate-pulse items-center justify-center rounded-3xl bg-primary text-primary-foreground glow-emerald">
          <Logo className="h-12 w-12" />
        </div>
        <p className="text-lg font-extrabold text-foreground">وِردي</p>
        <p className="text-sm text-muted-foreground">نجهز خطتك...</p>
      </div>
    )
  }

  // خطأ الاتصال
  if (error || !state) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-4xl">🌙</p>
        <p className="text-lg font-bold">{error ?? "حدث خطأ غير متوقع"}</p>
        <Button onClick={refresh}>
          <RefreshCw className="h-4 w-4" />
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  // التهيئة الأولى
  if (!state.onboarded) {
    return <OnboardingView onComplete={load} />
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* الترويسة */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <LogoMark className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-extrabold leading-tight">وِردي</p>
              <p className="text-[11px] leading-tight text-muted-foreground">رفيقك في مراجعة القرآن</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className="hidden items-center gap-1 rounded-full border border-amber-300/50 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 sm:inline-flex dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300"
              title="سلسلة الأيام المتتابعة"
            >
              <Flame className="h-3.5 w-3.5" />
              {state.profile.streak}
            </span>
            <span
              className="hidden items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary sm:inline-flex"
              title={`المستوى: ${state.level.name} — ${state.profile.xp} نقطة`}
            >
              <Star className="h-3.5 w-3.5" />
              {state.level.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={refresh}
              aria-label="تحديث البيانات"
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-4.5 w-4.5", refreshing && "animate-spin")} />
            </Button>
            <ThemeToggle />
          </div>
        </div>

        {/* التبويبات */}
        <div className="mx-auto w-full max-w-5xl px-4 pb-2.5">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList className="grid h-11 w-full grid-cols-4">
              <TabsTrigger value="today" className="gap-1.5 text-xs sm:text-sm">
                <CalendarCheck2 className="h-4 w-4" />
                يومي
              </TabsTrigger>
              <TabsTrigger value="mushaf" className="gap-1.5 text-xs sm:text-sm">
                <BookOpen className="h-4 w-4" />
                المصحف
              </TabsTrigger>
              <TabsTrigger value="progress" className="gap-1.5 text-xs sm:text-sm">
                <TrendingUp className="h-4 w-4" />
                تقدمي
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
                <Settings2 className="h-4 w-4" />
                خطتي
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* المحتوى */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:py-6">
        {view === "today" && <DashboardView state={state} load={load} action={action} openWird={openWird} />}
        {view === "mushaf" && (
          <MushafView state={state} wird={wird} onCloseWird={() => setWird(null)} />
        )}
        {view === "progress" && <ProgressView state={state} />}
        {view === "settings" && <SettingsView state={state} load={load} action={action} />}
      </main>

      {/* تذييل ثابت أسفل الصفحة */}
      <footer className="mt-auto border-t border-border/60 bg-card/60">
        <div className="mx-auto w-full max-w-5xl px-4 py-5 text-center">
          <p className="font-quran text-sm text-foreground/75" dir="rtl">
            وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            وِردي — صُنع بحب لخدمة حفظة كتاب الله • خطة ذكية تتكيف معك كل يوم
          </p>
        </div>
      </footer>
    </div>
  )
}
