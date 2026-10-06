import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useRole } from './RoleContext'
import { residentsApi, type AppModule, type Permissions } from '../lib/api/residents'

interface PermissionsValue {
  /** null = هنوز نیامده یا نقش ساکن/کودک نیست (همه‌چیز نمایش داده می‌شود) */
  perms: Permissions | null
  refresh: () => Promise<void>
  /** آیا بخش در اپ دیده شود؟ (hidden → حذف از تب، کاشی و لینک) */
  visible: (m: AppModule | undefined) => boolean
}

const Ctx = createContext<PermissionsValue>({ perms: null, refresh: async () => {}, visible: () => true })

/**
 * شِل اپ از GET /me/permissions ساخته می‌شود (RESIDENTS.md §3). برای کودک هر ۱۵ ثانیه و با هر
 * بازگشت به اپ دوباره خوانده می‌شود، تا «پنهان» کردن یک بخش در حالت والدین فوراً روی گوشی کودک
 * اعمال شود؛ برای ساکن هر دقیقه.
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { role } = useRole()
  const [perms, setPerms] = useState<Permissions | null>(null)
  const active = !!user && (user.role === 'resident' || user.role === 'child') && role === user.role

  const refresh = useCallback(async () => {
    if (!active) {
      setPerms(null)
      return
    }
    try {
      setPerms(await residentsApi.permissions())
    } catch {
      /* شبکه قطع است — آخرین نقشه می‌ماند */
    }
  }, [active])

  useEffect(() => {
    void refresh()
    if (!active) return
    const every = user?.role === 'child' ? 15_000 : 60_000
    const t = window.setInterval(() => void refresh(), every)
    // علاوه بر تایمر، با هر بازگشت به اپ (focus / visibilitychange) و با رویداد سفارشی pms:permissions-changed هم دوباره
    // خوانده می‌شود؛ تا تغییر حالت والدین (مثلاً پنهان‌کردن یک بخش) بدون صبر برای تایمر روی گوشی کودک اعمال شود.
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('pms:permissions-changed', onFocus)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('pms:permissions-changed', onFocus)
    }
  }, [active, refresh, user?.role])

  // visible فقط «پنهان‌سازی در UI» است و امنیت واقعی نیست؛ اعمال نهایی قفل/حالت والدین سمت بک‌اند انجام می‌شود.
  // تا perms نرسیده یا برای نقش‌های بدون محدودیت، پیش‌فرض «نمایش» است. بخش «خانوار» فقط برای سرپرست/بزرگسال/سالمند دیده می‌شود.
  const visible = useCallback(
    (m: AppModule | undefined) => {
      if (!m || !perms) return true
      if (m === 'household') return perms.kind === 'resident' && ['head', 'adult', 'senior'].includes(String(perms.role))
      return perms.modules[m] !== 'hidden'
    },
    [perms],
  )

  return <Ctx.Provider value={{ perms, refresh, visible }}>{children}</Ctx.Provider>
}

export function usePermissions() {
  return useContext(Ctx)
}
