import type { NextConfig } from "next"

/* بناء النسخة الأوفلاين (تطبيق الجوال):
   WARDI_OFFLINE=1 next build
   - تصدير ثابت (output: export) بلا خادم
   - يسبقه scripts/build-offline.sh: تبديل مؤقت لوحدتي "@/lib/db"
     و"@/lib/client-backend/entry" إلى النسختين المحليتين (db-offline / offline)
   نسخة الموقع العادية (خادم + Prisma) لا تتأثر إطلاقاً. */
const OFFLINE = process.env.WARDI_OFFLINE === "1"

const baseConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
}

const nextConfig: NextConfig = OFFLINE
  ? {
      ...baseConfig,
      output: "export",
      images: { unoptimized: true },
    }
  : {
      ...baseConfig,
      output: "standalone",
    }

export default nextConfig
