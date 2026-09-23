import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantSubdomain, setTenantSubdomain] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password, tenantSubdomain)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود ناموفق بود')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          <img src="/icons/icon-192.png" alt="همین" className="w-16 h-16 rounded-2xl shadow-sm" />
          <h1 className="font-bold text-xl text-ink-text">همین</h1>
          <p className="text-xs text-muted -mt-1">سامانه مدیریت ساختمان</p>
          <p className="text-sm text-muted">برای ورود، اطلاعات حساب کاربری خود را وارد کنید</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-4"
        >
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
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-tile/40"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-ink-text">
              ایمیل
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              dir="ltr"
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-tile/40"
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
              minLength={6}
              dir="ltr"
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-tile/40"
            />
          </div>

          {error && (
            <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-ink text-white py-2.5 text-sm font-medium disabled:opacity-60 active:scale-[0.99] transition-transform"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            ورود
          </button>
        </form>
      </div>
    </div>
  )
}
