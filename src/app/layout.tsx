import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { PWARegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "وِردي — رفيقك في مراجعة القرآن",
  description:
    "خطط مراجعة ذكية للقرآن الكريم تتكيف مع قدرتك يومياً: راجع ما ينبغي لك كل يوم، ولا تنسَ القديم أبداً.",
  keywords: ["القرآن", "مراجعة", "حفظ", "خطة", "ورد", "تكرار متباعد", "متشابهات", "مصحف"],
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF7F0" },
    { media: "(prefers-color-scheme: dark)", color: "#101A16" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen flex flex-col">
        {/* الخطوط محلية بالكامل في /public/fonts — لا اعتماد على جوجل، يعمل أوفلاين */}
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <PWARegister />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
