/**
 * بخش‌ها و دسترسی‌های کارکنان — باید با frontend/src/lib/staff.ts و CHECKهای
 * مایگریشن 004/009 هم‌خوان بماند.
 *
 * دپارتمان‌ها از مایگریشن 009 پویا هستند (identity.departments): مدیر ساختمان خودش دپارتمان
 * تعریف می‌کند. ۷ دپارتمان قدیمی «سیستمی»اند و پنل‌های ثابتشان را دارند؛ دپارتمان سفارشی
 * فقط پنل «درخواست‌های خدمات» (service_desk) را باز می‌کند.
 */
export const STAFF_PERMISSIONS = ['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'service_desk'] as const
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number]

/** شکل مجاز code دپارتمان (هم‌خوان با CHECK دیتابیس) */
export const DEPARTMENT_CODE_RE = /^[a-z][a-z0-9_]{1,30}$/

/** دپارتمان‌های سیستمی که برای هر ساختمان ساخته می‌شوند */
export const SYSTEM_DEPARTMENTS = [
  { code: 'lobby', name: 'لابی‌من', sort: 10 },
  { code: 'amenity_desk', name: 'مسئول مشاعات', sort: 20 },
  { code: 'kitchen', name: 'آشپزخانه / رستوران', sort: 30 },
  { code: 'cafe', name: 'کافی‌شاپ', sort: 40 },
  { code: 'security', name: 'نگهبانی', sort: 50 },
  { code: 'maintenance', name: 'تأسیسات', sort: 60 },
  { code: 'cleaning', name: 'نظافت', sort: 70 },
] as const
export type SystemDepartment = (typeof SYSTEM_DEPARTMENTS)[number]['code']

/** دسترسی‌هایی که هر دپارتمان سیستمی به‌صورت پیش‌فرض دارد (مدیر می‌تواند دسترسی اضافه بدهد) */
export const DEPARTMENT_DEFAULTS: Record<SystemDepartment, StaffPermission[]> = {
  lobby: ['lobby'],
  amenity_desk: ['amenity_desk'],
  kitchen: ['kitchen'],
  cafe: ['cafe'],
  security: ['security'],
  maintenance: ['maintenance'],
  cleaning: ['maintenance'],
}

export function isSystemDepartment(code: string | null | undefined): code is SystemDepartment {
  return !!code && code in DEPARTMENT_DEFAULTS
}

/**
 * دسترسی مؤثر = پیش‌فرض دپارتمان ∪ دسترسی‌های دستی.
 * دپارتمان سفارشی (غیر سیستمی) پیش‌فرضش «service_desk» است.
 */
export function effectivePermissions(department: string | null, extra: string[] | null): StaffPermission[] {
  const base = isSystemDepartment(department) ? DEPARTMENT_DEFAULTS[department] : department ? (['service_desk'] as StaffPermission[]) : []
  return [...new Set([...base, ...((extra ?? []) as StaffPermission[])])].filter((p) =>
    (STAFF_PERMISSIONS as readonly string[]).includes(p),
  )
}
