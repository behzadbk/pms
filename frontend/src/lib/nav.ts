import {
  LayoutDashboard, Wallet, Landmark, Ticket, Megaphone, CalendarRange,
  Building2, QrCode, PackageCheck, CarFront, SlidersHorizontal, PieChart,
  Layers, Receipt, CreditCard, UtensilsCrossed, ScrollText, FileText, Users,
} from 'lucide-react'
import type { Role } from './types'
import { staffNavItems } from './staff'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

export const navByRole: Record<Role, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'داشبورد', icon: LayoutDashboard },
    { to: '/admin/finance', label: 'گزارش مالی', icon: Landmark },
    { to: '/admin/tickets', label: 'تیکت‌ها', icon: Ticket },
    { to: '/admin/announcements', label: 'اعلانات و رأی‌گیری', icon: Megaphone },
    { to: '/admin/reservations', label: 'رزرو مشاعات', icon: CalendarRange },
    { to: '/admin/amenity-rules', label: 'قوانین رزرو هوشمند', icon: SlidersHorizontal },
    { to: '/admin/units', label: 'واحدها', icon: Building2 },
    { to: '/admin/staff', label: 'کارکنان', icon: Users },
    { to: '/admin/logs', label: 'داشبورد لاگ', icon: ScrollText },
  ],
  resident: [
    { to: '/resident', label: 'داشبورد واحد', icon: LayoutDashboard },
    { to: '/resident/charges', label: 'شارژ و پرداخت', icon: Wallet },
    { to: '/resident/finance', label: 'شفافیت مالی', icon: PieChart },
    { to: '/resident/food-order', label: 'سفارش غذا', icon: UtensilsCrossed },
    { to: '/resident/guest', label: 'صدور کد مهمان', icon: QrCode },
    { to: '/resident/reservations', label: 'رزرو مشاعات', icon: CalendarRange },
    { to: '/resident/tickets', label: 'تیکت‌های من', icon: Ticket },
    { to: '/resident/announcements', label: 'اعلانات و نظرسنجی', icon: Megaphone },
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
    { to: '/super-admin/plans', label: 'سطوح سرویس', icon: CreditCard },
    { to: '/super-admin/tenants', label: 'مجتمع‌ها (Tenants)', icon: Layers },
    { to: '/super-admin/billing', label: 'تراکنش‌های پلتفرم', icon: Receipt },
  ],
}
