"use client"

// المشغل الصوتي المتقدم — تلاوة الآيات بتحكم كامل:
// تشغيل/إيقاف مؤقت، تنقّل بين الآيات، تقديم داخل الآية، سرعة، تكرار،
// واستئناف من حيث توقفت عبر حفظ الموضع تلقائياً
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { DEFAULT_QARI_ID, QARI_LS_KEY, ayahAudioUrl } from "@/lib/audio"

export interface PlayAyah {
  key: string
  s: number
  n: number
}

/** وضع التكرار: بلا / الآية الحالية / الصفحة كاملة */
export type RepeatMode = "off" | "ayah" | "page"

/** سرعات التشغيل المتاحة */
export const RATES = [0.75, 1, 1.25, 1.5] as const
export type Rate = (typeof RATES)[number]

/** موضع محفوظ لاستئناف التلاوة لاحقاً */
export interface SavedPosition {
  qariId: string
  /** صفحة التسلسل — ليعرف العارض قائمة الآيات عند الاستئناف */
  page: number
  /** فهرس الآية داخل تسلسل الصفحة */
  index: number
  key: string
  s: number
  n: number
  /** الثانية داخل الآية */
  time: number
  at: number
}

const POS_LS_KEY = "wardi:audioPos"
const RATE_LS_KEY = "wardi:audioRate"
const REPEAT_LS_KEY = "wardi:audioRepeat"

// متجر محلي صغير لاختيار القارئ: قراءة/كتابة localStorage مع إشعار المشتركين
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

function readJson<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}

function fmtTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "٠:٠٠"
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, "0")}`
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
  /** إيقاف مؤقت — الصوت محمّل لكن متوقف */
  const [paused, setPaused] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRateState] = useState<Rate>(1)
  const [repeat, setRepeatState] = useState<RepeatMode>("off")
  /** موضع محفوظ من جلسة سابقة — لعرض زر الاستئناف */
  const [savedPosition, setSavedPosition] = useState<SavedPosition | null>(null)
  /** فهرس الآية الجارية داخل التسلسل وحجمه (حالة للعرض) */
  const [seqIndex, setSeqIndex] = useState(0)
  const [seqTotal, setSeqTotal] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const seqRef = useRef<PlayAyah[]>([])
  const pageRef = useRef<number | null>(null)
  const idxRef = useRef(0)
  const seqOnRef = useRef(false)
  const qariRef = useRef(DEFAULT_QARI_ID)
  const rateRef = useRef<Rate>(1)
  const repeatRef = useRef<RepeatMode>("off")
  const seekToRef = useRef<number | null>(null)
  const lastSavedSecRef = useRef(-1)

  useEffect(() => {
    qariRef.current = qariId
  }, [qariId])

  // قراءة التفضيلات المحفوظة والموضع الأخير — إطاراً واحداً بعد التركيب
  // (نمط rAF: بلا تعارض hydration ولا setState متزامن داخل التأثير)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const r = localStorage.getItem(RATE_LS_KEY)
        if (r) {
          const v = Number(r) as Rate
          if ((RATES as readonly number[]).includes(v)) {
            rateRef.current = v
            setRateState(v)
          }
        }
        const rep = localStorage.getItem(REPEAT_LS_KEY) as RepeatMode | null
        if (rep === "off" || rep === "ayah" || rep === "page") {
          repeatRef.current = rep
          setRepeatState(rep)
        }
      } catch {
        /* تجاهل */
      }
      setSavedPosition(readJson<SavedPosition>(POS_LS_KEY))
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const persistPos = useCallback((time: number) => {
    if (!seqOnRef.current || pageRef.current == null) return
    const item = seqRef.current[idxRef.current]
    if (!item) return
    const sec = Math.floor(time)
    if (sec === lastSavedSecRef.current) return
    lastSavedSecRef.current = sec
    const pos: SavedPosition = {
      qariId: qariRef.current,
      page: pageRef.current,
      index: idxRef.current,
      key: item.key,
      s: item.s,
      n: item.n,
      time: Math.max(0, sec),
      at: Date.now(),
    }
    try {
      localStorage.setItem(POS_LS_KEY, JSON.stringify(pos))
    } catch {
      /* تجاهل */
    }
  }, [])

  const stop = useCallback(() => {
    seqRef.current = []
    idxRef.current = 0
    seqOnRef.current = false
    pageRef.current = null
    setSeqPlaying(false)
    setPlayingKey(null)
    setBuffering(false)
    setPaused(false)
    setCurrentTime(0)
    setDuration(0)
    setSeqIndex(0)
    setSeqTotal(0)
    lastSavedSecRef.current = -1
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
    // أبرز آخر موضع محفوظ — لعرض «استئناف من حيث توقفت»
    setSavedPosition(readJson<SavedPosition>(POS_LS_KEY))
  }, [])

  const playOne = useCallback(
    (item: PlayAyah, seekTo = 0) => {
      const a = audioRef.current
      if (!a) return
      setPlayingKey(item.key)
      setBuffering(true)
      setPaused(false)
      setCurrentTime(seekTo)
      setError(null)
      lastSavedSecRef.current = -1
      seekToRef.current = seekTo > 0 ? seekTo : null
      a.src = ayahAudioUrl(qariRef.current, item.s, item.n)
      a.playbackRate = rateRef.current
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

    const onLoaded = () => {
      setDuration(a.duration || 0)
      if (seekToRef.current != null && seekToRef.current > 0) {
        try {
          a.currentTime = seekToRef.current
        } catch {
          /* تجاهل */
        }
        seekToRef.current = null
      }
    }
    const onTime = () => {
      setCurrentTime(a.currentTime)
      persistPos(a.currentTime)
    }
    const onPlay = () => {
      setBuffering(false)
      setPaused(false)
    }
    const onPause = () => {
      if (a.src) setPaused(true)
    }
    const onEnded = () => {
      if (repeatRef.current === "ayah") {
        a.currentTime = 0
        void a.play()
        return
      }
      if (seqOnRef.current) {
        idxRef.current++
        const seq = seqRef.current
        if (idxRef.current < seq.length) {
          setSeqIndex(idxRef.current)
          playOne(seq[idxRef.current])
        } else if (repeatRef.current === "page" && seq.length > 0) {
          idxRef.current = 0
          setSeqIndex(0)
          playOne(seq[0])
        } else {
          stop()
        }
      } else {
        setPlayingKey(null)
        setBuffering(false)
        setCurrentTime(0)
      }
    }
    const onError = () => {
      if (!a.src) return
      setError("تعذر تحميل التلاوة — تأكد من الاتصال ثم أعد المحاولة")
      stop()
    }

    a.addEventListener("loadedmetadata", onLoaded)
    a.addEventListener("timeupdate", onTime)
    a.addEventListener("playing", onPlay)
    a.addEventListener("pause", onPause)
    a.addEventListener("ended", onEnded)
    a.addEventListener("error", onError)
    audioRef.current = a
    return () => {
      a.pause()
      a.removeAttribute("src")
      audioRef.current = null
    }
  }, [playOne, stop, persistPos])

  /** زر آية: تشغيل، أو إيقاف إن كانت هي الجارية */
  const playAyah = useCallback(
    (item: PlayAyah) => {
      if (playingKey === item.key && !seqOnRef.current) {
        stop()
        return
      }
      seqOnRef.current = false
      pageRef.current = null
      setSeqPlaying(false)
      seqRef.current = [item]
      idxRef.current = 0
      setSeqIndex(0)
      setSeqTotal(1)
      playOne(item)
    },
    [playingKey, playOne, stop],
  )

  /** «استمع للصفحة»: تسلسل كامل بترتيب المصحف — مع سياق الصفحة للاستئناف */
  const togglePage = useCallback(
    (list: PlayAyah[], page?: number) => {
      if (seqOnRef.current) {
        stop()
        return
      }
      if (list.length === 0) return
      seqRef.current = list
      idxRef.current = 0
      seqOnRef.current = true
      pageRef.current = page ?? null
      setSeqPlaying(true)
      setSeqIndex(0)
      setSeqTotal(list.length)
      playOne(list[0])
    },
    [playOne, stop],
  )

  /** تشغيل/إيقاف مؤقت للتيار */
  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a || !a.src) return
    if (a.paused) {
      void a.play().catch(() => {
        setError("تعذر استئناف التلاوة — أعد المحاولة")
      })
    } else {
      a.pause()
    }
  }, [])

  /** تقديم/إرجاع داخل الآية الحالية */
  const seek = useCallback((t: number) => {
    const a = audioRef.current
    if (!a || !Number.isFinite(t)) return
    try {
      a.currentTime = Math.max(0, Math.min(t, a.duration || t))
      setCurrentTime(a.currentTime)
      persistPos(a.currentTime)
    } catch {
      /* تجاهل */
    }
  }, [persistPos])

  /** الآية التالية/السابقة — ضمن التسلسل أو المفردة */
  const step = useCallback(
    (dir: 1 | -1) => {
      const seq = seqRef.current
      if (!seqOnRef.current || seq.length === 0) return
      const next = Math.min(seq.length - 1, Math.max(0, idxRef.current + dir))
      idxRef.current = next
      setSeqIndex(next)
      playOne(seq[next])
    },
    [playOne],
  )

  const setRate = useCallback((r: Rate) => {
    rateRef.current = r
    setRateState(r)
    const a = audioRef.current
    if (a) a.playbackRate = r
    try {
      localStorage.setItem(RATE_LS_KEY, String(r))
    } catch {
      /* تجاهل */
    }
  }, [])

  const setRepeat = useCallback((m: RepeatMode) => {
    repeatRef.current = m
    setRepeatState(m)
    try {
      localStorage.setItem(REPEAT_LS_KEY, m)
    } catch {
      /* تجاهل */
    }
  }, [])

  const changeQari = useCallback(
    (id: string) => {
      try {
        localStorage.setItem(QARI_LS_KEY, id)
      } catch {
        /* تجاهل */
      }
      qariListeners.forEach((cb) => cb())
      // إعادة تشغيل الآية الحالية بالقارئ الجديد (من بدايتها)
      const a = audioRef.current
      const item = seqRef.current[idxRef.current]
      if (a?.src && item) playOne(item)
    },
    [playOne],
  )

  /** استئناف موضع محفوظ: قائمة الصفحة من العارض + الموضع */
  const resume = useCallback(
    (list: PlayAyah[], page: number, saved: SavedPosition) => {
      if (list.length === 0) return
      const idx = Math.max(0, Math.min(list.length - 1, saved.index))
      seqRef.current = list
      idxRef.current = idx
      seqOnRef.current = true
      pageRef.current = page
      setSeqPlaying(true)
      setSeqIndex(idx)
      setSeqTotal(list.length)
      playOne(list[idx], saved.time)
    },
    [playOne],
  )

  /** نسيان الموضع المحفوظ */
  const clearSaved = useCallback(() => {
    try {
      localStorage.removeItem(POS_LS_KEY)
    } catch {
      /* تجاهل */
    }
    setSavedPosition(null)
  }, [])

  return {
    qariId,
    changeQari,
    playingKey,
    seqPlaying,
    buffering,
    error,
    paused,
    currentTime,
    duration,
    fmtTime,
    rate,
    setRate,
    repeat,
    setRepeat,
    index: seqIndex,
    total: seqTotal,
    playAyah,
    togglePage,
    toggle,
    seek,
    step,
    stop,
    savedPosition,
    resume,
    clearSaved,
  }
}
