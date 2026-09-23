import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getToken } from '../lib/api/client'
import { identityApi, platformApi } from '../lib/api'
import type { AuthUser } from '../lib/api/identity'
import { ApiError } from '../lib/api/client'

interface AuthContextValue {
  /** کاربر لاگین‌شده فعلی — null یعنی هنوز لاگین نشده (یا نشست منقضی شده) */
  user: AuthUser | null
  /** true فقط در همان لحظه‌ی اول بارگذاری صفحه، تا نشست ذخیره‌شده (accessToken) بررسی شود */
  loading: boolean
  error: string | null
  login: (email: string, password: string, tenantSubdomain: string) => Promise<void>
  /** ورود سوپرادمین با نام کاربری/رمز (بدون subdomain) */
  loginPlatform: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // بازیابی نشست بعد از رفرش صفحه: اگر accessToken قبلاً در localStorage ذخیره شده،
  // با GET /auth/me پروفایل کاربر را می‌گیریم؛ اگر توکن منقضی/نامعتبر بود، پاک می‌شود.
  // (این Endpoint هم کاربر عادی و هم سوپرادمین را برمی‌گرداند — تفکیک در بک‌اند انجام می‌شود.)
  useEffect(() => {
    let cancelled = false
    async function restoreSession() {
      if (!getToken()) {
        setLoading(false)
        return
      }
      try {
        const me = await identityApi.getMe()
        if (!cancelled) setUser(me)
      } catch {
        identityApi.logout()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function login(email: string, password: string, tenantSubdomain: string) {
    setError(null)
    try {
      const res = await identityApi.login(email, password, tenantSubdomain)
      setUser(res.user)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'ورود ناموفق بود'
      setError(message)
      throw err
    }
  }

  async function loginPlatform(username: string, password: string) {
    setError(null)
    try {
      const res = await platformApi.platformLogin(username, password)
      setUser(res.user)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'ورود ناموفق بود'
      setError(message)
      throw err
    }
  }

  function logout() {
    identityApi.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login, loginPlatform, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth باید داخل AuthProvider استفاده شود')
  return ctx
}
