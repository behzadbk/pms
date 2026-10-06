import { useEffect, useRef, useState } from 'react'

/** اسکن QR با دوربین (فقط مرورگرهایی که BarcodeDetector دارند — مثل Chrome اندروید/تبلت) */
export function useQrScanner(onCode: (v: string) => void) {
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window
  const [active, setActive] = useState(false)
  const [cameraErr, setCameraErr] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!active) return
    // stop: اگر کاربر قبل از آماده‌شدنِ دوربین (getUserMedia ناهمگام) از صفحه برود، بعد از رسیدن stream چیزی راه نیفتد.
    // facingMode: 'environment' = دوربین پشتِ گوشی.
    let stop = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stop || !videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
        // BarcodeDetector یک API مرورگر است (همه‌ی مرورگرها ندارند، پس supported بالا چک می‌شود). هر ۳۵۰ms یک فریم
        // ویدیو بررسی می‌شود؛ با اولین QR معتبر callback صدا زده و اسکن (و دوربین) خاموش می‌شود.
        timer = setInterval(async () => {
          if (!videoRef.current) return
          try {
            const r = await detector.detect(videoRef.current)
            if (r[0]?.rawValue) {
              onCode(String(r[0].rawValue))
              setActive(false)
            }
          } catch { /* فریم نامعتبر */ }
        }, 350)
      } catch {
        setCameraErr('دسترسی به دوربین ممکن نشد')
        setActive(false)
      }
    })()
    // پاکسازی: تایمر را متوقف و همه‌ی trackهای دوربین را می‌بندد؛ بدون این چراغ دوربین روشن می‌ماند.
    return () => {
      stop = true
      if (timer) clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  return { supported, active, setActive, cameraErr, videoRef }
}
