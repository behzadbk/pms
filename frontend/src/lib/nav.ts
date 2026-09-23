import {
  LayoutDashboard, Wallet, Landmark, Ticket, Megaphone, CalendarRange,
  Wrench, Building2, QrCode, PackageCheck, CarFront, ClipboardList, SlidersHorizontal, PieChart,
  Layers, Receipt, CreditCard, UtensilsCrossed, ChefHat, ScrollText,
} from 'lucide-react'
import type { Role } from './types'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

export const navByRole: Record<Role, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'داشبورد', icon: LayoutDashboard },
    { to: '/admin/charges', label: 'شارژ و مطالبات', icon: Wallet },
    { to: '/admin/finance', label: 'صندوق و فاکتورها', icon: Landmark },
    { to: '/admin/tickets', label: 'تیکت‌ها', icon: Ticket },
    { to: '/admin/announcements', label: 'اعلانات و رأی‌گیری', icon: Megaphone },
    { to: '/admin/reservations', label: 'رزرو مشاعات', icon: CalendarRange },
    { to: '/admin/amenity-rules', label: 'قوانین رزرو هوشمند', icon: SlidersHorizontal },
    { to: '/admin/units', label: 'واحدها', icon: Building2 },
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
  ],
  guard: [
    { to: '/guard', label: 'داشبورد نگهبانی', icon: LayoutDashboard },
    { to: '/guard/guest-check', label: 'پنل فوق‌ساده نگهبانی', icon: QrCode },
    { to: '/guard/parcels', label: 'مرسولات پستی', icon: PackageCheck },
    { to: '/guard/traffic', label: 'تردد خودرو', icon: CarFront },
  ],
  staff: [
    { to: '/staff', label: 'کارهای نگهداری', icon: Wrench },
    { to: '/staff/schedule', label: 'برنامه سرویس دوره‌ای', icon: ClipboardList },
    { to: '/staff/kitchen', label: 'صف آشپزخانه', icon: ChefHat },
  ],
  super_admin: [
    { to: '/super-admin', label: 'داشبورد پلتفرم', icon: LayoutDashboard },
    { to: '/super-admin/buildings', label: 'ساختمان‌ها و برج‌ها', icon: Building2 },
    { to: '/super-admin/plans', label: 'سطوح سرویس', icon: CreditCard },
    { to: '/super-admin/tenants', label: 'مجتمع‌ها (Tenants)', icon: Layers },
    { to: '/super-admin/billing', label: 'تراکنش‌های پلتفرم', icon: Receipt },
  ],
}
