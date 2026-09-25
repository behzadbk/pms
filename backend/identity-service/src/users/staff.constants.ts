/**
 * بخش‌ها و دسترسی‌های کارکنان — باید با frontend/src/lib/staff.ts و CHECKهای
 * مایگریشن 004_staff_accounts.sql هم‌خوان بماند.
 */
export const STAFF_PERMISSIONS = ['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance'] as const
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number]

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
  cleaning: ['maintenance'],
}

/** دسترسی مؤثر = پیش‌فرض بخش ∪ دسترسی‌های دستی */
export function effectivePermissions(department: string | null, extra: string[] | null): StaffPermission[] {
  const base = department && department in DEPARTMENT_DEFAULTS ? DEPARTMENT_DEFAULTS[department as StaffDepartment] : []
  return [...new Set([...base, ...((extra ?? []) as StaffPermission[])])].filter((p) =>
    (STAFF_PERMISSIONS as readonly string[]).includes(p),
  )
}
