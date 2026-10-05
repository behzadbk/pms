import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, QrCode } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

/** آخرین مجتمعی که از این دستگاه وارد شده — روی تبلت لابی/آشپزخانه هر بار تایپ نشود */
export const LAST_TENANT_KEY = 'hamin.last-tenant'
function readLastTenant() {
  try {
    return localStorage.getItem(LAST_TENANT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function Login() {
  const { login, loginFamily } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantSubdomain, setTenantSubdomain] = useState(readLastTenant)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'account' | 'family'>('account')
  const [code, setCode] = useState('')
  const autoTried = useRef(false)

  // /family-login?t=<subdomain>&k=<qr_token> — اسکن QR خانواده با دوربین گوشی
  useEffect(() => {
    const t = params.get('t')
    const k = params.get('k')
    if (!t || !k || autoTried.current) return
    autoTried.current = true
    setMode('family')
    setTenantSubdomain(t)
    setSubmitting(true)
    loginFamily(t, { qr_token: k })
      .then(() => {
        try {
          localStorage.setItem(LAST_TENANT_KEY, t)
        } catch {
          /* ignore */
        }
        navigate('/', { replace: true })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'کد نامعتبر یا منقضی شده است'))
      .finally(() => setSubmitting(false))
  }, [params, loginFamily, navigate])

  async function handleFamily(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const digits = code.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '')
      await loginFamily(tenantSubdomain.trim(), { code: digits })
      try {
        localStorage.setItem(LAST_TENANT_KEY, tenantSubdomain.trim())
      } catch {
        /* ignore */
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود ناموفق بود')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password, tenantSubdomain.trim())
      try {
        localStorage.setItem(LAST_TENANT_KEY, tenantSubdomain.trim())
      } catch {
        /* ignore */
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود ناموفق بود')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          'radial-gradient(900px 500px at 70% -10%, color-mix(in srgb, var(--lg4-pri) 16%, transparent), transparent), var(--lg-bg-base)',
      }}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          <img src="/icons/icon-192.png" alt="همین" className="w-16 h-16 rounded-2xl shadow-sm" />
          <h1 className="font-bold text-xl text-ink-text">همین</h1>
          <p className="text-xs text-muted -mt-1">سامانه مدیریت ساختمان</p>
          <p className="text-sm text-muted">برای ورود، اطلاعات حساب کاربری خود را وارد کنید</p>
        </div>

        {mode === 'family' ? (
          <form onSubmit={handleFamily} className="lg4-card p-5 space-y-4">
            <p className="text-sm font-bold text-ink-text">ورود با کد خانواده</p>
            <p className="text-xs text-muted leading-6">کد ۶ رقمی را از گوشی بابا یا مامان (خانواده → ورود کودک) وارد کن، یا QR را با دوربین گوشی اسکن کن. نیازی به شماره موبایل نیست.</p>
            <input
              value={tenantSubdomain}
              onChange={(e) => setTenantSubdomain(e.target.value)}
              placeholder="مجتمع، مثلاً borj-aftab"
              required
              dir="ltr"
              aria-label="مجتمع"
              className="w-full rounded-2xl border border-[var(--lg-border-hairline)] bg-[var(--lg-bg-elevated)] px-3 py-2.5 text-sm outline-none"
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.slice(0, 7))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="۰۰۰ ۰۰۰"
              required
              dir="ltr"
              aria-label="کد ۶ رقمی"
              className="w-full rounded-2xl border border-[var(--lg-border-hairline)] bg-[var(--lg-bg-elevated)] px-3 py-3 text-center text-2xl font-bold tracking-[6px] outline-none"
            />
            {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={submitting} className="lg4-capsule w-full flex items-center justify-center gap-2 py-3 text-sm disabled:opacity-60">
              {submitting && <Loader2 size={16} className="animate-spin" />}
              ورود
            </button>
            <button type="button" onClick={() => { setMode('account'); setError(null) }} className="w-full text-xs font-bold" style={{ color: 'var(--lg4-pri)' }}>
              ورود با حساب کاربری
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="lg4-card p-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="tenantSubdomain" className="text-sm font-medium text-ink-text">
              مجتمع (subdomain)
            </label>
            <input
              id="tenantSubdomain"
              type="text"
              value={tenantSubdomain}
              onChange={(e) => setTenantSubdomain(e.target.value)}
              placeholder="مثلاً borj-aftab"
              required
              className="w-full rounded-2xl border border-[var(--lg-border-hairline)] bg-[var(--lg-bg-elevated)] px-3 py-2.5 text-sm outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--lg4-pri) 40%, transparent)' }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-ink-text">
              ایمیل، شماره موبایل یا نام کاربری
            </label>
            <input
              id="email"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="09121234567 یا you@example.com"
              required
              dir="ltr"
              className="w-full rounded-2xl border border-[var(--lg-border-hairline)] bg-[var(--lg-bg-elevated)] px-3 py-2.5 text-sm outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--lg4-pri) 40%, transparent)' }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-ink-text">
              رمز عبور
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              dir="ltr"
              className="w-full rounded-2xl border border-[var(--lg-border-hairline)] bg-[var(--lg-bg-elevated)] px-3 py-2.5 text-sm outline-none focus:ring-2"
              style={{ ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--lg4-pri) 40%, transparent)' }}
            />
          </div>

          {error && (
            <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="lg4-capsule w-full flex items-center justify-center gap-2 py-3 text-sm disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            ورود
          </button>
          <button
            type="button"
            onClick={() => { setMode('family'); setError(null) }}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-bold"
            style={{ color: 'var(--lg4-pri)' }}
          >
            <QrCode size={15} />
            ورود با کد خانواده
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
