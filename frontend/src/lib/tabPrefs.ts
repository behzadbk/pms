import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRole } from '../context/RoleContext'
import { usePermissions } from '../context/PermissionsContext'
import { useStaffNav } from './access'
import { MAX_TABS, navByRole, splitTabs, type NavItem } from './nav'
import type { Role } from './types'

/**
 * شخصی‌سازی نوار پایین: کاربر تا ۴ بخش دلخواه را برای نوار پایین انتخاب و ترتیب می‌دهد؛
 * بقیه در «بیشتر» می‌مانند. برای هر نقش جدا در localStorage ذخیره می‌شود (روی همین دستگاه).
 * اگر چیزی ذخیره نشده یا بخش ذخیره‌شده دیگر دسترس‌پذیر نیست، پیش‌فرض نقش اعمال می‌شود.
 */
const key = (role: Role) => `livo.tabs.v1.${role}`
const EVENT = 'livo:tabs-changed'

function read(role: Role): string[] | null {
  try {
    const raw = localStorage.getItem(key(role))
    if (!raw) return null
    const v = JSON.parse(raw)
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null
  } catch {
    return null
  }
}

function write(role: Role, to: string[] | null) {
  try {
    if (to) localStorage.setItem(key(role), JSON.stringify(to.slice(0, MAX_TABS)))
    else localStorage.removeItem(key(role))
  } catch {
    /* حالت خصوصی/PWA محدود — بی‌خطر */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** تب‌ها و «بیشتر» را با ترجیح کاربر حساب می‌کند */
export function applyTabPrefs(nav: NavItem[], pref: string[] | null) {
  if (!pref) return splitTabs(nav)
  const tabs = pref.map((to) => nav.find((i) => i.to === to)).filter((i): i is NavItem => !!i).slice(0, MAX_TABS)
  if (tabs.length === 0) return splitTabs(nav)
  const more = nav.filter((i) => !tabs.includes(i))
  return { tabs, more }
}

/** منوی در دسترس نقش فعلی + تب‌ها/بیشتر بعد از اعمال ترجیح کاربر */
export function useNavSplit() {
  const { role } = useRole()
  const staffNav = useStaffNav()
  const { visible } = usePermissions()
  const nav = useMemo(
    () => (role === 'staff' ? staffNav : navByRole[role]).filter((i) => visible((i as NavItem).module)),
    [role, staffNav, visible],
  )
  const [pref, setPref] = useState<string[] | null>(() => read(role))

  useEffect(() => {
    setPref(read(role))
    const sync = () => setPref(read(role))
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [role])

  const { tabs, more } = useMemo(() => applyTabPrefs(nav, pref), [nav, pref])
  const save = useCallback((to: string[] | null) => write(role, to), [role])
  return { role, nav, tabs, more, customized: pref !== null, save }
}
