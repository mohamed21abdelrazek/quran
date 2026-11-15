// شعار التطبيق: نجمة ثمانية (رُبع الحزب) مع مصحف مفتوح
export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <rect x="9" y="9" width="30" height="30" rx="4" stroke="currentColor" strokeWidth="2.5" />
      <rect
        x="9"
        y="9"
        width="30" height="30"
        rx="4"
        stroke="currentColor"
        strokeWidth="2.5"
        transform="rotate(45 24 24)"
      />
      <path
        d="M17 20.5c2.3-1.4 4.6-1.9 7-1.5V32c-2.4-.4-4.7.1-7 1.5V20.5z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M31 20.5c-2.3-1.4-4.6-1.9-7-1.5V32c2.4-.4 4.7.1 7 1.5V20.5z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  )
}

export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <rect x="10" y="10" width="28" height="28" rx="3" stroke="currentColor" strokeWidth="3" />
      <rect
        x="10"
        y="10"
        width="28"
        height="28"
        rx="3"
        stroke="currentColor"
        strokeWidth="3"
        transform="rotate(45 24 24)"
      />
    </svg>
  )
}
