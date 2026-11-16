#!/usr/bin/env bash
# بناء النسخة الأوفلاين الثابتة (لتطبيق الجوال):
# 1) يستثنى مجلد مسارات API مؤقتاً (لا خادم في التصدير الثابت)
# 2) يُبدَّل مؤقتاً:
#      src/lib/db.ts                       <- src/lib/db-offline.ts            (localStorage بدل Prisma)
#      src/lib/client-backend/entry.ts     <- src/lib/client-backend/offline.ts (نداءات محلية بدل HTTP)
# 3) next build بتصدير ثابت (WARDI_OFFLINE=1)
# كل شيء يُستعاد كما كان مهما حدث (trap).
# الناتج: out/ جاهز للتغليف في أندرويد (android-shell/build-apk.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

API_SRC="src/app/api"
API_BAK=".offline-build-backup/api"
DB_SRC="src/lib/db.ts"
DB_BAK=".offline-build-backup/db.ts"
ENTRY_SRC="src/lib/client-backend/entry.ts"
ENTRY_BAK=".offline-build-backup/entry.ts"
OUT="out"

SWAPPED=0

restore_all() {
  if [ "$SWAPPED" = "1" ]; then
    mv "$DB_BAK" "$DB_SRC"
    mv "$ENTRY_BAK" "$ENTRY_SRC"
    rm -rf "$API_SRC"
    mv "$API_BAK" "$API_SRC"
    SWAPPED=0
  fi
  rm -rf ".offline-build-backup"
}

echo "==> بناء نسخة أوفلاين ثابتة (WARDI_OFFLINE=1)"

for f in "$API_SRC" "$DB_SRC" "$ENTRY_SRC" src/lib/db-offline.ts src/lib/client-backend/offline.ts; do
  if [ ! -f "$f" ] && [ ! -d "$f" ]; then
    echo "خطأ: $f غير موجود" >&2
    exit 1
  fi
done

rm -rf ".offline-build-backup" "$OUT"
mkdir -p ".offline-build-backup"

mv "$API_SRC" "$API_BAK"
cp "$DB_SRC" "$DB_BAK"
cp "$ENTRY_SRC" "$ENTRY_BAK"
cp src/lib/db-offline.ts "$DB_SRC"
cp src/lib/client-backend/offline.ts "$ENTRY_SRC"
SWAPPED=1
trap restore_all EXIT

WARDI_OFFLINE=1 bun x next build

restore_all
trap - EXIT

echo "==> تم البناء: $OUT/"
du -sh "$OUT" | cut -f1
