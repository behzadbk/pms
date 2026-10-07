import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { enablePush, getPushState, isIosNeedingInstall, type PushState } from '../lib/pushNotifications'
import { useAuth } from '../context/AuthContext'

const DISMISS_KEY = 'pms_notif_prompt_dismissed'

/** دعوت به فعال‌سازی اعلان — فقط وقتی هنوز تصمیمی گرفته نشده و دستگاه پشتیبانی می‌کند */
export function NotificationPrompt() {
  const { user } = useAuth()
  const [state, setState] = useState<PushState | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!user || user.role === 'super_admin') return
    void getPushState().then(setState)
  }, [user])

  if (!user || dismissed || (state !== 'off' && state !== 'needs-install')) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }
  async function enable() {
    setBusy(true)
    setErr('')
    try {
      await enablePush()
      setState('on')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'فعال‌سازی ناموفق بود')
    } finally {
      setBusy(false)
    }
  }

  const ios = state === 'needs-install' || isIosNeedingInstall()
  return (
    <div className="mx-4 sm:mx-6 mt-4 flex items-start justify-between gap-3 rounded-2xl bg-tile-soft text-tile px-4 py-3" role="region" aria-label="فعال‌سازی اعلان‌ها">
      <div className="flex items-start gap-2.5 min-w-0">
        <BellRing size={18} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm leading-6">
            {ios ? 'برای اعلان: Share ← Add to Home Screen' : 'اعلان‌ها را فعال کنید'}
          </p>
          {err && <p className="text-xs mt-1 text-bad">{err}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {!ios && (
          <button onClick={enable} disabled={busy} className="text-xs font-bold bg-tile text-white px-3.5 min-h-[36px] rounded-lg hover:opacity-90 disabled:opacity-60">
            {busy ? '…' : 'فعال‌سازی'}
          </button>
        )}
        <button onClick={dismiss} className="text-tile/60 hover:text-tile p-1" aria-label="بستن">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
