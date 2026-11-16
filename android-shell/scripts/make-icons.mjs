// توليد أيقونات التطبيق من أيقونة الويب (public/icons/icon-512.png)
// إلى جميع كثافات أندرويد، وإزالة الأيقونة التكيّفية الافتراضية
// كي تظهر أيقونتنا على كل الواجهات.
import sharp from "sharp"
import { rmSync } from "node:fs"
import path from "node:path"

const SRC = path.resolve("../public/icons/icon-512.png")
const RES = path.resolve("android/app/src/main/res")

const DENSITIES = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
}

for (const [dir, size] of Object.entries(DENSITIES)) {
  for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
    await sharp(SRC).resize(size, size).png().toFile(path.join(RES, dir, name))
  }
  console.log(`✓ ${dir}`)
}

// إسقاط الأيقونة التكيّفية الافتراضية (vector) — تعمل الأيقونة النقطية بدلاً منها
try {
  rmSync(path.join(RES, "mipmap-anydpi-v26"), { recursive: true, force: true })
  console.log("✓ أُسقطت الأيقونة التكيّفية الافتراضية")
} catch {
  /* ليست موجودة أصلاً */
}
console.log("تمت الأيقونات")
