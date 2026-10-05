import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Role } from '../lib/types'
import { roles } from '../lib/roles'
import { useAuth } from './AuthContext'

interface RoleContextValue {
  role: Role
  setRole: (r: Role) => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

/**
 * سوییچر نقش فقط برای توسعه‌ی محلی (npm run dev) است. در هر build واقعی/آنلاین خاموش است،
 * وگرنه هر کاربری (مثلاً ساکن) می‌توانست ظاهر پنل مدیریت را برای خودش باز کند.
 */
export const ROLE_SWITCHER_ENABLED = import.meta.env.DEV

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // نقشی که سوییچر دمو انتخاب کرده؛ null = نقش واقعی کاربر. قبلاً نقش در state جدا نگه داشته می‌شد
  // و در اولین رندر بعد از بازیابی نشست هنوز 'admin' بود؛ در حالت توسعه رفرش روی لینک مستقیم
  // (مثلاً /resident/family/requests) کاربر را به خانه‌ی نقش پرت می‌کرد.
  const [override, setOverride] = useState<Role | null>(null)

  useEffect(() => {
    setOverride(null)
  }, [user])

  const realRole = (user?.role as Role | undefined) ?? 'admin'
  const effectiveRole = ROLE_SWITCHER_ENABLED ? override ?? realRole : realRole
  const guardedSetRole = (r: Role) => {
    if (ROLE_SWITCHER_ENABLED) setOverride(r)
  }

  return <RoleContext.Provider value={{ role: effectiveRole, setRole: guardedSetRole }}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used within RoleProvider')
  return ctx
}

export function useRoleInfo() {
  const { role } = useRole()
  return roles.find((r) => r.id === role)!
}
