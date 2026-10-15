/**
 * بخش‌ها و دسترسی‌های کارکنان — باید با frontend/src/lib/staff.ts و CHECKهای
 * مایگریشن 004_staff_accounts.sql هم‌خوان بماند.
 */
export const STAFF_PERMISSIONS = ['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'housekeeping'] as const
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number]

/** cleaning = دپارتمان نظافت (همه‌ی کادر نظافت؛ یک نفرشان «مسئول» است — is_dept_head) */
export const STAFF_DEPARTMENTS = ['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'cleaning'] as const
export type StaffDepartment = (typeof STAFF_DEPARTMENTS)[number]

/** دسترسی‌هایی که هر بخش به‌صورت پیش‌فرض دارد (مدیر می‌تواند دسترسی اضافه بدهد) */
export const DEPARTMENT_DEFAULTS: Record<StaffDepartment, StaffPermission[]> = {
  lobby: ['lobby'],
  amenity_desk: ['amenity_desk'],
  kitchen: ['kitchen'],
  cafe: ['cafe'],
  security: ['security'],
  maintenance: ['maintenance'],
  cleaning: ['maintenance', 'housekeeping'],
}

/** دسترسی‌هایی که فقط از «مسئول دپارتمان بودن» می‌آیند و دستی داده نمی‌شوند */
export const HEAD_PERMISSIONS: Partial<Record<StaffDepartment, string[]>> = {
  cleaning: ['cleaning_supervisor'],
}

/** دسترسی مؤثر = پیش‌فرض بخش ∪ دسترسی‌های دستی ∪ (اگر مسئول دپارتمان است) دسترسی مسئول */
export function effectivePermissions(department: string | null, extra: string[] | null, isHead = false): string[] {
  const base = department && department in DEPARTMENT_DEFAULTS ? DEPARTMENT_DEFAULTS[department as StaffDepartment] : []
  const head = isHead && department ? (HEAD_PERMISSIONS[department as StaffDepartment] ?? []) : []
  return [...new Set([...base, ...(extra ?? []), ...head])].filter(
    (p) => (STAFF_PERMISSIONS as readonly string[]).includes(p) || head.includes(p),
  )
}
