import { useAuth } from '../context/AuthContext'
import { useRole } from '../context/RoleContext'
import { ALL_PERMISSIONS, departmentDefaults, staffNavItems, type StaffPermission } from './staff'
import { viewerAudiences } from './store'

/**
 * دسترسی‌های مؤثر کارمند فعلی.
 * - کارمند واقعی (role=staff): همان چیزی که بک‌اند در /auth/me برگردانده (پیش‌فرض بخش ∪ دسترسی دستی)
 * - مدیر ساختمان: به همه‌ی پنل‌های کارکنان دسترسی دارد (مثلاً مدیر هم می‌تواند رزرو تایید کند)
 * - پیش‌نمایش دمو (سوییچر نقش): همه
 */
export function useStaffPermissions(): StaffPermission[] {
  const { user } = useAuth()
  if (user?.role === 'staff') return (user.permissions ?? []) as StaffPermission[]
  return ALL_PERMISSIONS
}

export function useHasPermission(p: StaffPermission | null) {
  const perms = useStaffPermissions()
  return p === null || perms.includes(p)
}

/** مخاطب‌های اعلان برای کاربر فعلی (نقش + دسترسی‌های کارمند) */
export function useViewerAudiences() {
  const { role } = useRole()
  const perms = useStaffPermissions()
  return viewerAudiences(role, role === 'staff' ? perms : [])
}

/**
 * منوی پنل کارکنان: فقط آیتم‌های مجاز، و پنل‌های بخش اصلی کارمند اول
 * (کارمند آشپزخانه‌ای که دسترسی کافی‌شاپ هم دارد، اول سفارش‌های رستوران را می‌بیند).
 */
export function useStaffNav() {
  const { user } = useAuth()
  const perms = useStaffPermissions()
  const primary = departmentDefaults(user?.role === 'staff' ? user.department : null)
  const rank = (p: StaffPermission | null) => (p === null ? 2 : primary.includes(p) ? 0 : 1)
  return staffNavItems
    .filter((i) => i.permission === null || perms.includes(i.permission))
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => rank(a.item.permission) - rank(b.item.permission) || a.idx - b.idx)
    .map(({ item }) => item)
}
