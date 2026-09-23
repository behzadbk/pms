import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Role } from '../lib/types'
import { roles } from '../lib/mockData'
import { useAuth } from './AuthContext'

interface RoleContextValue {
  role: Role
  setRole: (r: Role) => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

/**
 * سوییچر نقش فقط برای دمو/توسعه است. در build واقعی خاموش است، وگرنه هر کاربری
 * (مثلاً ساکن) می‌توانست ظاهر پنل مدیریت را برای خودش باز کند.
 * برای نمایش دمو روی سرور: VITE_DEMO_ROLE_SWITCHER=true
 */
export const ROLE_SWITCHER_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_DEMO_ROLE_SWITCHER === 'true'

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [role, setRole] = useState<Role>(user?.role ?? 'admin')

  // بعد از لاگین واقعی (یا بازیابی نشست)، نقش UI با نقش واقعی کاربر همگام می‌شود.
  // (سوییچر نقش در Layout همچنان برای پیش‌نمایش دمو در دسترس است و می‌تواند override کند.)
  useEffect(() => {
    if (user) setRole(user.role)
  }, [user])

  // در حالت عادی نقش مؤثر همیشه نقش واقعی کاربر است و setRole کاری نمی‌کند
  const effectiveRole = ROLE_SWITCHER_ENABLED ? role : ((user?.role as Role | undefined) ?? role)
  const guardedSetRole = (r: Role) => {
    if (ROLE_SWITCHER_ENABLED) setRole(r)
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
