/**
 * بخش‌ها و دسترسی‌های کارکنان.
 * باید با backend/identity-service/src/users/staff.constants.ts و CHECKهای
 * مایگریشن 004_staff_accounts.sql هم‌خوان بماند.
 *
 * بخش (department) = جایگاه اصلی کارمند؛ هر بخش چند دسترسی پیش‌فرض دارد.
 * مدیر می‌تواند دسترسی اضافه بدهد (مثلاً کارمند آشپزخانه در شیفتی که کافی‌شاپ می‌ایستد).
 */
import {
  ClipboardList, ConciergeBell, Coffee, ChefHat, ShieldCheck, Wrench, CalendarRange, Megaphone,
  UtensilsCrossed, BookOpenText, HandHelping, type LucideIcon,
} from 'lucide-react'

export type StaffPermission = 'lobby' | 'amenity_desk' | 'kitchen' | 'cafe' | 'security' | 'maintenance' | 'service_desk'
/**
 * کد دپارتمان. از مایگریشن 009 دپارتمان‌ها پویا هستند (مدیر ساختمان تعریف می‌کند)؛
 * ۷ دپارتمان قدیمی «سیستمی»اند و کدشان ثابت است (SystemDepartment).
 */
export type StaffDepartment = string
export type SystemDepartment = 'lobby' | 'amenity_desk' | 'kitchen' | 'cafe' | 'security' | 'maintenance' | 'cleaning'

export const ALL_PERMISSIONS: StaffPermission[] = ['lobby', 'amenity_desk', 'kitchen', 'cafe', 'security', 'maintenance', 'service_desk']

export const permissionInfo: Record<StaffPermission, { label: string; desc: string; icon: LucideIcon }> = {
  lobby: { label: 'پنل لابی (ورودی)', desc: 'پذیرش مهمان و بررسی کد، ثبت و تحویل مرسوله', icon: ConciergeBell },
  amenity_desk: { label: 'پنل مسئول مشاعات', desc: 'تعریف مشاعات و تایم‌تیبل، تایید/رد رزروها، اسکن بلیت مهمان استخر و ثبت مصرف خدمات واحدها', icon: CalendarRange },
  kitchen: { label: 'آشپزخانه / رستوران', desc: 'دریافت سفارش رستوران و مدیریت منوی رستوران', icon: ChefHat },
  cafe: { label: 'کافی‌شاپ', desc: 'دریافت سفارش کافی‌شاپ و مدیریت منوی کافی‌شاپ', icon: Coffee },
  security: { label: 'نگهبانی', desc: 'کنترل مهمان، مرسولات و تردد خودرو', icon: ShieldCheck },
  maintenance: { label: 'تأسیسات و نگهداری', desc: 'کارهای تعمیر و سرویس دوره‌ای', icon: Wrench },
  service_desk: { label: 'درخواست‌های خدمات', desc: 'خدمات ساکنین (کارواش، خانه‌داری، نظافت …): مدیر دپارتمان زمان را تأیید و کار را بین کارکنان تقسیم می‌کند، مجری کارهای خودش را می‌بیند', icon: HandHelping },
}

/** دپارتمان‌های سیستمی — برچسب پیش‌فرض و دسترسی‌های پیش‌فرض (برای دپارتمان سفارشی از API می‌آید) */
export const departments: { id: SystemDepartment; label: string; defaults: StaffPermission[] }[] = [
  { id: 'lobby', label: 'لابی‌من', defaults: ['lobby'] },
  { id: 'amenity_desk', label: 'مسئول مشاعات', defaults: ['amenity_desk'] },
  { id: 'kitchen', label: 'آشپزخانه / رستوران', defaults: ['kitchen'] },
  { id: 'cafe', label: 'کافی‌شاپ', defaults: ['cafe'] },
  { id: 'security', label: 'نگهبانی', defaults: ['security'] },
  { id: 'maintenance', label: 'تأسیسات', defaults: ['maintenance'] },
  { id: 'cleaning', label: 'نظافت', defaults: ['maintenance'] },
]

export function isSystemDepartment(id?: string | null): id is SystemDepartment {
  return !!id && departments.some((d) => d.id === id)
}

/** برچسب دپارتمان؛ برای دپارتمان سفارشی نام را از `name` (پاسخ API) بگیرید */
export function departmentLabel(id?: string | null, name?: string | null) {
  return name || departments.find((d) => d.id === id)?.label || '—'
}

/** دسترسی‌های پیش‌فرض دپارتمان: سیستمی → ثابت؛ سفارشی → فقط «درخواست‌های خدمات» */
export function departmentDefaults(id?: string | null): StaffPermission[] {
  if (!id) return []
  return departments.find((d) => d.id === id)?.defaults ?? ['service_desk']
}

export const shiftLabels: Record<string, string> = {
  morning: 'صبح',
  evening: 'عصر',
  night: 'شب',
  rotating: 'چرخشی',
}

export interface StaffNavItem {
  to: string
  label: string
  icon: LucideIcon
  permission: StaffPermission | null
}

/**
 * منوی پنل کارکنان به تفکیک دسترسی. کارمند فقط آیتم‌هایی را می‌بیند که دسترسی‌شان را دارد.
 * permission=null یعنی برای همه‌ی کارکنان (مثل اعلانات).
 */
export const staffNavItems: StaffNavItem[] = [
  { to: '/staff/lobby', label: 'میز لابی', icon: ConciergeBell, permission: 'lobby' },
  { to: '/staff/amenity-desk', label: 'مشاعات', icon: CalendarRange, permission: 'amenity_desk' },
  { to: '/staff/kitchen', label: 'سفارش‌های رستوران', icon: ChefHat, permission: 'kitchen' },
  { to: '/staff/menu/restaurant', label: 'منوی رستوران', icon: UtensilsCrossed, permission: 'kitchen' },
  { to: '/staff/cafe', label: 'سفارش‌های کافی‌شاپ', icon: Coffee, permission: 'cafe' },
  { to: '/staff/menu/cafe', label: 'منوی کافی‌شاپ', icon: BookOpenText, permission: 'cafe' },
  { to: '/staff/security', label: 'نگهبانی', icon: ShieldCheck, permission: 'security' },
  { to: '/staff/work-orders', label: 'کارهای نگهداری', icon: Wrench, permission: 'maintenance' },
  { to: '/staff/schedule', label: 'سرویس دوره‌ای', icon: ClipboardList, permission: 'maintenance' },
  { to: '/staff/services', label: 'درخواست‌های خدمات', icon: HandHelping, permission: 'service_desk' },
  { to: '/staff/announcements', label: 'اعلانات', icon: Megaphone, permission: null },
]

/** venue منو ↔ دسترسی لازم */
export const venueByKey = {
  restaurant: { venueId: 'v1', permission: 'kitchen' as StaffPermission, title: 'رستوران' },
  cafe: { venueId: 'v2', permission: 'cafe' as StaffPermission, title: 'کافی‌شاپ' },
}
export type VenueKey = keyof typeof venueByKey
