"use client"

// حلقة تقدم دائرية أنيقة
export function ProgressRing({
  value,
  max,
  size = 120,
  thickness = 10,
  label,
  sublabel,
  className = "",
}: {
  value: number
  max: number
  size?: number
  thickness?: number
  label?: string
  sublabel?: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - pct)

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`الإنجاز ${Math.round(pct * 100)}%`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-white/25"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringGold)"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.33, 1, 0.68, 1)" }}
        />
        <defs>
          <linearGradient id="ringGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        {label != null && <span className="text-2xl font-extrabold leading-none">{label}</span>}
        {sublabel != null && <span className="mt-1 text-[11px] font-medium text-white/80">{sublabel}</span>}
      </div>
    </div>
  )
}
