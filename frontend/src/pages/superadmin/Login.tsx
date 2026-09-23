import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Loader2, Lock, ShieldCheck, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

/**
 * صفحه‌ی ورود پنل سوپرادمین (سطح پلتفرم) — جدا از صفحه‌ی ورود ساکنین/مدیر ساختمان.
 * اینجا subdomain مجتمع خواسته نمی‌شود؛ کاربر سوپرادمین به هیچ مجتمعی تعلق ندارد.
 */
export function SuperAdminLogin() {
  const { loginPlatform } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await loginPlatform(username.trim(), password)
      navigate('/super-admin/buildings', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود ناموفق بود')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2.5 mb-7 text-center">
          <div className="bg-tile text-white rounded-2xl p-3.5 shadow-lg shadow-black/20">
            <ShieldCheck size={26} />
          </div>
          <h1 className="font-bold text-lg text-white">پنل سوپر ادمین</h1>
          <p className="text-sm text-white/60 leading-6">
            مدیریت ساختمان‌ها و برج‌های تحت همکاری، سطح سرویس و تسویه‌ی اشتراک
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card rounded-2xl border border-line shadow-xl p-5 space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium text-ink-text">
              نام کاربری
            </label>
            <div className="relative">
              <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="نام کاربری"
                required
                dir="ltr"
                className="w-full rounded-xl border border-line bg-canvas ps-3 pe-9 py-2.5 text-sm text-right outline-none focus:ring-2 focus:ring-tile/40"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-ink-text">
              رمز عبور
            </label>
            <div className="relative">
              <Lock size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                dir="ltr"
                className="w-full rounded-xl border border-line bg-canvas ps-3 pe-9 py-2.5 text-sm text-right outline-none focus:ring-2 focus:ring-tile/40"
              />
            </div>
          </div>

          {error && <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-white py-2.5 text-sm font-medium disabled:opacity-60 active:scale-[0.99] transition-transform"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            ورود به پنل
          </button>

          <a
            href="/login"
            className="flex items-center justify-center gap-1.5 text-xs text-muted hover:text-tile pt-1"
          >
            <Building2 size={13} />
            ورود مدیر ساختمان یا ساکنین
          </a>
        </form>
      </div>
    </div>
  )
}
