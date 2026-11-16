/**
 * توليد أيقونات PWA — بلغة شعار وِردي (نجمة ثمانية + مصحف مفتوح + قاعدة ذهبية)
 * التشغيل: bun scripts/gen-pwa-icons.ts
 */
import sharp from "sharp"

function iconSvg(rx: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b7d61"/>
      <stop offset="1" stop-color="#17b09a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>
  <g fill="none" stroke="#ffffff" stroke-width="13" opacity="0.92">
    <rect x="126" y="126" width="260" height="260" rx="30"/>
    <rect x="126" y="126" width="260" height="260" rx="30" transform="rotate(45 256 256)"/>
  </g>
  <g fill="#ffffff">
    <path d="M188 232c23-15 47-20 68-16v104c-21-4-45 1-68 16V232z" opacity="0.96"/>
    <path d="M324 232c-23-15-47-20-68-16v104c21-4 45 1 68 16V232z" opacity="0.62"/>
  </g>
  <rect x="178" y="368" width="156" height="13" rx="6.5" fill="#f4c43a" opacity="0.95"/>
</svg>`
}

async function main() {
  const out: [string, number, number][] = [
    ["public/icons/icon-512.png", 512, 112],
    ["public/icons/icon-192.png", 192, 112],
    ["public/icons/icon-maskable-512.png", 512, 0],
    ["public/icons/apple-touch-icon.png", 180, 0],
  ]
  for (const [path, size, rx] of out) {
    await sharp(Buffer.from(iconSvg(rx)))
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(path)
    console.log("كُتب", path, size + "x" + size)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
