"use client"

// مشغل تلاوة الآيات — تشغيل فردي أو تسلسل صفحة كاملة
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { DEFAULT_QARI_ID, QARI_LS_KEY, ayahAudioUrl } from "@/lib/audio"

export interface PlayAyah {
  key: string
  s: number
  n: number
}

// متجر محلي صغير لاختيار القارئ: قراءة/كتابة localStorage مع إشعار المشتركين
// (useSyncExternalStore يتعامل مع SSR والـ hydration بشكل صحيح بلا تأثيرات)
const qariListeners = new Set<() => void>()
function qariSnapshot(): string {
  try {
    return localStorage.getItem(QARI_LS_KEY) ?? DEFAULT_QARI_ID
  } catch {
    return DEFAULT_QARI_ID
  }
}
function serverQariSnapshot(): string {
  return DEFAULT_QARI_ID
}

export function useAyahAudio() {
  const qariId = useSyncExternalStore(
    (cb) => {
      qariListeners.add(cb)
      return () => {
        qariListeners.delete(cb)
      }
    },
    qariSnapshot,
    serverQariSnapshot,
  )
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [seqPlaying, setSeqPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const seqRef = useRef<PlayAyah[]>([])
  const idxRef = useRef(0)
  const seqOnRef = useRef(false)
  const qariRef = useRef(DEFAULT_QARI_ID)

  // مزامنة القارئ الحالي مع ref المشغل
  useEffect(() => {
    qariRef.current = qariId
  }, [qariId])

  const stop = useCallback(() => {
    seqRef.current = []
    idxRef.current = 0
    seqOnRef.current = false
    setSeqPlaying(false)
    setPlayingKey(null)
    setBuffering(false)
    const a = audioRef.current
    if (a) {
      a.pause()
      a.removeAttribute("src")
      try {
        a.load()
      } catch {
        /* تجاهل */
      }
    }
  }, [])

  const playOne = useCallback(
    (item: PlayAyah) => {
      const a = audioRef.current
      if (!a) return
      setPlayingKey(item.key)
      setBuffering(true)
      setError(null)
      a.src = ayahAudioUrl(qariRef.current, item.s, item.n)
      a.play().catch(() => {
        setError("تعذر تشغيل التلاوة — تأكد من الاتصال (أول تشغيل يحتاج إنترنت)")
        stop()
      })
    },
    [stop],
  )

  // إنشاء عنصر الصوت مرة واحدة + ربط الأحداث
  useEffect(() => {
    const a = new Audio()
    a.preload = "auto"
    a.addEventListener("ended", () => {
      if (seqOnRef.current) {
        idxRef.current++
        const seq = seqRef.current
        if (idxRef.current < seq.length) playOne(seq[idxRef.current])
        else stop()
      } else {
        setPlayingKey(null)
        setBuffering(false)
      }
    })
    a.addEventListener("playing", () => setBuffering(false))
    a.addEventListener("error", () => {
      setError("تعذر تحميل التلاوة — تأكد من الاتصال ثم أعد المحاولة")
      stop()
    })
    audioRef.current = a
    return () => {
      a.pause()
      a.removeAttribute("src")
      audioRef.current = null
    }
  }, [playOne, stop])

  /** زر آية: تشغيل، أو إيقاف إن كانت هي الجارية */
  const playAyah = useCallback(
    (item: PlayAyah) => {
      if (playingKey === item.key && seqOnRef.current === false) {
        stop()
        return
      }
      seqOnRef.current = false
      setSeqPlaying(false)
      seqRef.current = []
      idxRef.current = 0
      playOne(item)
    },
    [playingKey, playOne, stop],
  )

  /** «استمع للصفحة»: تسلسل كامل بترتيب المصحف */
  const togglePage = useCallback(
    (list: PlayAyah[]) => {
      if (seqOnRef.current) {
        stop()
        return
      }
      if (list.length === 0) return
      seqRef.current = list
      idxRef.current = 0
      seqOnRef.current = true
      setSeqPlaying(true)
      playOne(list[0])
    },
    [playOne, stop],
  )

  const changeQari = useCallback(
    (id: string) => {
      try {
        localStorage.setItem(QARI_LS_KEY, id)
      } catch {
        /* تجاهل */
      }
      qariListeners.forEach((cb) => cb())
    },
    [],
  )

  return { qariId, changeQari, playingKey, seqPlaying, buffering, error, playAyah, togglePage, stop }
}
