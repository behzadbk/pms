import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, ShieldAlert } from 'lucide-react'
import { api, setRefreshToken, setToken } from '../lib/api/client'
import { errText } from '../lib/api/residents'

interface ChangeResult { accessToken: string; refreshToken: string }

/**
 * تعویض اجباری رمز موقت (حساب‌های ساخته‌شده با رمز تصادفی: مدیر مجتمع جدید، کارمند).
 * تا رمز عوض نشود این پنجره روی کل برنامه می‌ماند. پس از موفقیت، توکن‌های تازه ذخیره و صفحه بازخوانی می‌شود.
 */
export function ForcePasswordChange() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (next.length < 8) return setErr('رمز جدید باید حداقل ۸ کاراکتر باشد')
    if (next !== again) return setErr('تکرار رمز جدید یکسان نیست')
    setBusy(true)
    try {
      const r = await api.post<ChangeResult>('/identity/auth/change-password', { currentPassword: current, newPassword: next })
      setToken(r.accessToken)
      setRefreshToken(r.refreshToken)
      window.location.reload()
    } catch (e2) {
      setErr(errText(e2, 'تغییر رمز ناموفق بود'))
      setBusy(false)
    }
  }

  const input = 'w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-tile/40'
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="تغییر رمز عبور">
      <form onSubmit={submit} className="bg-card w-full max-w-sm rounded-2xl border border-line shadow-xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center gap-2 text-warn">
          <ShieldAlert size={20} />
          <h2 className="font-semibold text-ink-text">رمز عبور خود را تعویض کنید</h2>
        </div>
        <p className="text-xs text-muted leading-6">این حساب با رمز موقت ساخته شده است. برای ادامه یک رمز شخصی (حداقل ۸ کاراکتر) انتخاب کنید.</p>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">رمز فعلی (موقت)</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" dir="ltr" className={input} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">رمز جدید</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" dir="ltr" className={input} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">تکرار رمز جدید</span>
          <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} required minLength={8} autoComplete="new-password" dir="ltr" className={input} />
        </label>
        {err && <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2">{err}</p>}
        <button type="submit" disabled={busy} className="w-full flex items-center justify-center gap-2 bg-ink text-white px-5 py-3 rounded-xl text-sm font-medium disabled:opacity-60">
          {busy && <Loader2 size={15} className="animate-spin" />}
          ذخیره و ادامه
        </button>
      </form>
    </div>,
    document.body,
  )
}
