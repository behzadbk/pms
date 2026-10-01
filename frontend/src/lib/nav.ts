import {
  LayoutDashboard, Wallet, Landmark, Ticket, Megaphone, CalendarRange,
  Building2, QrCode, PackageCheck, CarFront, SlidersHorizontal, PieChart,
  Layers, Receipt, CreditCard, UtensilsCrossed, ScrollText, FileText, Users, Home, UsersRound, Contact,
} from 'lucide-react'
import type { Role } from './types'
import type { AppModule } from './api/residents'
import { staffNavItems } from './staff'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  /** زیرعنوان در صفحه‌ی «بیشتر» */
  sub?: string
  /** بخشی که با /me/permissions پنهان می‌شود (ساکن و کودک) */
  module?: AppModule
}

/**
 * قاعده‌ی نوار پایین (RESIDENTS.md §3): حداکثر ۴ تب اصلی + «بیشتر». ترتیب این آرایه‌ها همان
 * ترتیب نوار است؛ بخش‌های پنجم به بعد در صفحه‌ی «بیشتر» می‌آیند و بخش جدید هرگز به
 * چهار تب اول اضافه نمی‌شود — همیشه انتهای فهرست.
 */
export const MAX_TABS = 4

export const navByRole: Record<Role, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'داشبورد', icon: LayoutDashboard },
    { to: '/admin/residents', label: 'ساکنین', icon: Users, sub: 'ثبت و ویرایش ساکنین' },
    { to: '/admin/tickets', label: 'تیکت‌ها', icon: Ticket },
    { to: '/admin/announcements', label: 'اعلانات', icon: Megaphone, sub: 'انتشار اطلاعیه و نظرسنجی' },
    // ── «بیشتر» ──
    { to: '/admin/staff', label: 'کارکنان', icon: Contact, sub: 'افزودن کارمند، شیفت و دسترسی‌ها' },
    { to: '/admin/reservations', label: 'رزروها', icon: CalendarRange, sub: 'رزرو امکانات و تأیید درخواست‌ها' },
    { to: '/admin/finance', label: 'گزارش مالی', icon: Landmark, sub: 'خلاصه‌ی مالی، فاکتورها و وصول شارژ' },
    { to: '/admin/amenity-rules', label: 'قوانین رزرو هوشمند', icon: SlidersHorizontal, sub: 'سقف رزرو، سانس‌ها و نیاز به تأیید' },
    { to: '/admin/logs', label: 'داشبورد لاگ', icon: ScrollText, sub: 'لاگ متمرکز رفتار کاربران و خطاها' },
  ],
  resident: [
    { to: '/resident', label: 'خانه', icon: Home },
    { to: '/resident/food-order', label: 'غذا', icon: UtensilsCrossed, module: 'food' },
    { to: '/resident/tickets', label: 'تیکت‌ها', icon: Ticket, module: 'ticket' },
    { to: '/resident/announcements', label: 'اعلانات', icon: Megaphone, module: 'notice', sub: 'اطلاعیه‌ها و نظرسنجی‌ها' },
    // ── «بیشتر» ──
    { to: '/resident/reservations', label: 'رزرو مشاعات', icon: CalendarRange, module: 'amenity', sub: 'استخر، سالن اجتماعات، روف‌گاردن، باشگاه' },
    { to: '/resident/family', label: 'خانواده', icon: UsersRound, module: 'household', sub: 'اعضای خانوار، حالت والدین، ورود کودک' },
    { to: '/resident/charges', label: 'شارژ و پرداخت', icon: Wallet, module: 'finance', sub: 'صورتحساب‌ها و پرداخت آنلاین' },
    { to: '/resident/finance', label: 'شفافیت مالی', icon: PieChart, module: 'finance', sub: 'هزینه‌های ساختمان و سهم شما' },
    { to: '/resident/guest', label: 'کارت مهمان', icon: QrCode, module: 'guest', sub: 'صدور کد ورود مهمان' },
  ],
  // اپ کودک: فقط دو تب؛ بخش‌های پنهان‌شده در حالت والدین اصلاً ساخته نمی‌شوند
  child: [
    { to: '/child', label: 'خانه', icon: Home },
    { to: '/child/announcements', label: 'اعلانات', icon: Megaphone, module: 'notice' },
  ],
  guard: [
    { to: '/guard', label: 'داشبورد نگهبانی', icon: LayoutDashboard },
    { to: '/guard/guest-check', label: 'پنل فوق‌ساده نگهبانی', icon: QrCode },
    { to: '/guard/parcels', label: 'مرسولات پستی', icon: PackageCheck },
    { to: '/guard/traffic', label: 'تردد خودرو', icon: CarFront },
    { to: '/guard/announcements', label: 'اعلانات', icon: Megaphone },
  ],
  // منوی کارکنان پویاست و بر اساس دسترسی‌ها ساخته می‌شود — lib/staff.ts → staffNavItems
  staff: staffNavItems.map(({ to, label, icon }) => ({ to, label, icon })),
  accountant: [
    { to: '/accountant', label: 'داشبورد حسابداری', icon: LayoutDashboard },
    { to: '/accountant/charges', label: 'شارژ و مطالبات', icon: Wallet },
    { to: '/accountant/invoices', label: 'صندوق و فاکتورها', icon: FileText },
    { to: '/accountant/announcements', label: 'اعلانات', icon: Megaphone },
  ],
  super_admin: [
    { to: '/super-admin', label: 'داشبورد پلتفرم', icon: LayoutDashboard },
    { to: '/super-admin/buildings', label: 'ساختمان‌ها و برج‌ها', icon: Building2 },
    { to: '/super-admin/residents', label: 'ساکنین', icon: Users, sub: 'ساختمان‌ها با درصد پر بودن، پرونده‌ی شخص' },
    { to: '/super-admin/plans', label: 'سطوح سرویس', icon: CreditCard },
    { to: '/super-admin/tenants', label: 'مجتمع‌ها (Tenants)', icon: Layers },
    { to: '/super-admin/billing', label: 'تراکنش‌های پلتفرم', icon: Receipt },
  ],
}

/** کدام بخشِ ساکن/کودک پشت هر مسیر است — برای حذف deep link بخش پنهان */
export function moduleForPath(pathname: string, items: NavItem[]): AppModule | undefined {
  const hit = items
    .filter((i) => i.module && (pathname === i.to || pathname.startsWith(i.to + '/')))
    .sort((a, b) => b.to.length - a.to.length)[0]
  return hit?.module
}

export function splitTabs(items: NavItem[]) {
  if (items.length <= MAX_TABS) return { tabs: items, more: [] as NavItem[] }
  return { tabs: items.slice(0, MAX_TABS), more: items.slice(MAX_TABS) }
}
