#!/usr/bin/env bash
# بناء APK أندرويد لنسخة وِردي الأوفلاين.
# المتطلبات المسبقة:
#   1) out/ موجوداً — ناتج scripts/build-offline.sh (من جذر المستودع)
#   2) JAVA 17 + Android SDK (ANDROID_HOME)
# الناتج: android-shell/dist/wirdi-offline.apk
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"

if [ ! -f "$ROOT/out/index.html" ]; then
  echo "خطأ: out/ غير موجود — شغّل أولاً: bash scripts/build-offline.sh" >&2
  exit 1
fi

echo "==> 1/5 تجهيز ملفات الويب"
rm -rf www
cp -r "$ROOT/out" www
# لا حاجة لملفات زائفة داخل الأصول
rm -f www/__next.__PAGE__.txt www/__next._full.txt www/__next._head.txt www/__next._index.txt www/__next._tree.txt 2>/dev/null || true

echo "==> 2/5 تثبيت الاعتماديات (Capacitor)"
npm install --no-fund --no-audit --loglevel=error

echo "==> 3/5 توليد مشروع أندرويد"
rm -rf android
npx cap add android

echo "==> 4/5 الأيقونات والمزامنة"
node scripts/make-icons.mjs
npx cap sync android

echo "==> 5/5 بناء APK (debug — موقّع وجاهز للتثبيت)"
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon -q
cd ..

mkdir -p dist
cp android/app/build/outputs/apk/debug/app-debug.apk dist/wirdi-offline.apk
echo "==> تم: dist/wirdi-offline.apk ($(du -h dist/wirdi-offline.apk | cut -f1))"
