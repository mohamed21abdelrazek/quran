"use client"

import { useEffect } from "react"

/** تسجيل عامل الخدمة — يجعل وِردي يعمل أوفلاين وقابلاً للتثبيت كتطبيق */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
    if (document.readyState === "complete") {
      register()
    } else {
      window.addEventListener("load", register, { once: true })
    }
    return () => window.removeEventListener("load", register)
  }, [])
  return null
}
