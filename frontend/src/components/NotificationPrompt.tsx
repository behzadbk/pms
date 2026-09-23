import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { isPushSupported, requestNotificationPermission, subscribeToPush } from '../lib/pushNotifications'

const DISMISS_KEY = 'pms_notif_prompt_dismissed'

export function NotificationPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY)
    const alreadyGranted = 'Notification' in window && Notification.permission !== 'default'
    if (!dismissed && isPushSupported() && !alreadyGranted) {
      setVisible(true)
    }
  }, [])

  async function enable() {
    const permission = await requestNotificationPermission()
    if (permission === 'granted') {
      await subscribeToPush().catch(() => null) // بدون VAPID_PUBLIC_KEY واقعی، subscribe در دمو خاموش می‌ماند
    }
    dismiss()
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-xl bg-tile-soft text-tile px-4 py-3">
      <div className="flex items-center gap-2.5">
        <BellRing size={18} className="shrink-0" />
        <p className="text-sm">برای دریافت آنی اعلان مهمان، مرسوله و شارژ، اعلان‌های فوری را فعال کنید.</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button onClick={enable} className="text-xs font-medium bg-tile text-white px-3 py-1.5 rounded-lg hover:opacity-90">
          فعال‌سازی
        </button>
        <button onClick={dismiss} className="text-tile/60 hover:text-tile">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
