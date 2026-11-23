#!/usr/bin/env bash
# بناء APK أندرويد لنسخة وِردي الأوفلاين.
# المتطلبات المسبقة:
#   1) out/ موجوداً — ناتج scripts/build-offline.sh (من جذر المستودع)
#   2) JAVA 21 + Android SDK (ANDROID_HOME)
# الناتج: android-shell/dist/wirdi-offline.apk
#
# ملاحظة التوقيع الثابت: نزرع wirdi.keystore (المودوع في المستودع) كمفتاح
# التصحيح — فتُوقَّع كل الإصدارات بالمفتاح نفسه، ويُثبَّت الإصدار الجديد فوق
# القديم مباشرة بلا حذف، وتبقى خطة الحفظ والتقدم محفوظة على الجهاز.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"

if [ ! -f "$ROOT/out/index.html" ]; then
  echo "خطأ: out/ غير موجود — شغّل أولاً: bash scripts/build-offline.sh" >&2
  exit 1
fi

if [ ! -f wirdi.keystore ]; then
  echo "خطأ: wirdi.keystore غير موجود (مفتاح التوقيع الثابت)" >&2
  exit 1
fi

echo "==> 1/6 تجهيز ملفات الويب"
rm -rf www
cp -r "$ROOT/out" www
# لا حاجة لملفات زائفة داخل الأصول
rm -f www/__next.__PAGE__.txt www/__next._full.txt www/__next._head.txt www/__next._index.txt www/__next._tree.txt 2>/dev/null || true

echo "==> 2/6 تثبيت الاعتماديات (Capacitor + إضافات الكلام والتخزين)"
npm install --no-fund --no-audit --loglevel=error

echo "==> 3/6 توليد مشروع أندرويد"
rm -rf android
npx cap add android

echo "==> 4/6 الأذونات والنسخة والتوقيع الثابت"
MANIFEST="android/app/src/main/AndroidManifest.xml"
# الميكروفون للتسميع الصوتي (إضافة SpeechRecognition) + الصوت للتلاوة
if ! grep -q "android.permission.RECORD_AUDIO" "$MANIFEST"; then
  sed -i '/<manifest /a\    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />' "$MANIFEST"
fi
# نسخة متزايدة: رقم تشغيل CI (أو التاريخ محلياً) حتى يقبل أندرويد التحديث دائماً
VERSION="$(node -p "require('$ROOT/package.json').version")"
RUN_CODE="${GITHUB_RUN_NUMBER:-$(date +%y%m%d)}"
sed -i "s/versionCode 1/versionCode ${RUN_CODE}/" android/app/build.gradle
sed -i "s/versionName \"1.0\"/versionName \"${VERSION}\"/" android/app/build.gradle
echo "    الإصدار ${VERSION} (versionCode ${RUN_CODE})"

# توقيع ثابت صريح في مشروع أندرويد — يتجاوز منطق AGP لموقع مفتاح التصحيح
# الافتراضي، فيُوقَّع كل إصدار بالمفتاح نفسه وتُثبَّت التحديثات فوق القديم
# بلا حذف (تبقى خطة الحفظ والتقدم على الجهاز)
cp wirdi.keystore android/app/wirdi.keystore
cat >> android/app/build.gradle <<'GRADLE_PATCH'

// وِردي: توقيع ثابت بمفتاح المستودع — التحديثات تُثبَّت فوق القديم بلا فقدان البيانات
// نوقّع نسخة الإصدار (Release) نفسها بالمفتاح الثابت: أسرع في التشغيل، وبعض
// الهواتف (شاومي/هواوي وأمثالها) ترفض تثبيت نسخ التطوير (debug) أصلاً
android {
    signingConfigs {
        wirdiStable {
            storeFile file("wirdi.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.wirdiStable
        }
        release {
            signingConfig signingConfigs.wirdiStable
            minifyEnabled false
            shrinkResources false
        }
    }
    lint {
        abortOnError false
        checkReleaseBuilds false
    }
}
GRADLE_PATCH
# احتياط إضافي: نزرع المفتاح أيضاً في المواقع الافتراضية المحتملة لمفتاح التصحيح
mkdir -p "$HOME/.android"
cp wirdi.keystore "$HOME/.android/debug.keystore"
if [ -n "${ANDROID_SDK_HOME:-}" ]; then
  mkdir -p "$ANDROID_SDK_HOME/.android"
  cp wirdi.keystore "$ANDROID_SDK_HOME/.android/debug.keystore"
fi
if [ -n "${ANDROID_USER_HOME:-}" ]; then
  mkdir -p "$ANDROID_USER_HOME"
  cp wirdi.keystore "$ANDROID_USER_HOME/debug.keystore"
fi

echo "==> 5/6 الأيقونات والمزامنة"
node scripts/make-icons.mjs
npx cap sync android

echo "==> 6/6 بناء APK إصدار رسمي (Release موقّع بالمفتاح الثابت — يُثبَّت فوق النسخ السابقة)"
cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon -q
cd ..

mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk dist/wirdi-offline.apk
echo "==> تم: dist/wirdi-offline.apk ($(du -h dist/wirdi-offline.apk | cut -f1))"
