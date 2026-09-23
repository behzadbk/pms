import type { Charge, GuestPass, Parcel, Reservation, RoleInfo, Ticket, WorkOrder, PlatformTenant, PlatformPlan, PlatformInvoice } from './types'

export const roles: RoleInfo[] = [
  { id: 'admin', label: 'مدیر ساختمان', personaName: 'م. رستمی', personaSub: 'مدیر برج آفتاب' },
  { id: 'resident', label: 'ساکن / مالک', personaName: 'س. کریمی', personaSub: 'واحد ۱۲ — بلوک A' },
  { id: 'guard', label: 'نگهبانی', personaName: 'ح. یوسفی', personaSub: 'شیفت صبح — درب اصلی' },
  { id: 'staff', label: 'تکنسین / حسابدار', personaName: 'ن. صادقی', personaSub: 'واحد فنی' },
  { id: 'super_admin', label: 'Super-Admin', personaName: 'پ. احمدزاده', personaSub: 'مدیر پلتفرم SaaS' },
]

export const charges: Charge[] = [
  { id: 'c1', unit: 'واحد ۴', period: 'شهریور ۱۴۰۴', base: 2_450_000, lateFee: 0, total: 2_450_000, dueDate: '۱۴۰۴/۰۶/۱۰', status: 'paid' },
  { id: 'c2', unit: 'واحد ۷', period: 'شهریور ۱۴۰۴', base: 3_100_000, lateFee: 155_000, total: 3_255_000, dueDate: '۱۴۰۴/۰۶/۱۰', status: 'overdue' },
  { id: 'c3', unit: 'واحد ۱۲', period: 'شهریور ۱۴۰۴', base: 2_800_000, lateFee: 0, total: 2_800_000, dueDate: '۱۴۰۴/۰۶/۱۰', status: 'pending' },
  { id: 'c4', unit: 'واحد ۱۵', period: 'شهریور ۱۴۰۴', base: 2_600_000, lateFee: 0, total: 2_600_000, dueDate: '۱۴۰۴/۰۶/۱۰', status: 'paid' },
  { id: 'c5', unit: 'واحد ۲۰', period: 'شهریور ۱۴۰۴', base: 3_400_000, lateFee: 170_000, total: 3_570_000, dueDate: '۱۴۰۴/۰۶/۱۰', status: 'overdue' },
]

export const myCharges: Charge[] = [
  { id: 'm1', unit: 'واحد ۱۲', period: 'شهریور ۱۴۰۴', base: 2_800_000, lateFee: 0, total: 2_800_000, dueDate: '۱۴۰۴/۰۶/۱۰', status: 'pending' },
  { id: 'm2', unit: 'واحد ۱۲', period: 'مرداد ۱۴۰۴', base: 2_800_000, lateFee: 0, total: 2_800_000, dueDate: '۱۴۰۴/۰۵/۱۰', status: 'paid' },
  { id: 'm3', unit: 'واحد ۱۲', period: 'تیر ۱۴۰۴', base: 2_750_000, lateFee: 0, total: 2_750_000, dueDate: '۱۴۰۴/۰۴/۱۰', status: 'paid' },
]

export const tickets: Ticket[] = [
  { id: 't1', subject: 'نشتی آب در پارکینگ طبقه -۱', unit: 'مشاعات', category: 'گزارش خرابی', status: 'in_progress', priority: 'high', createdAt: '۲ روز پیش' },
  { id: 't2', subject: 'صدای غیرعادی آسانسور B', unit: 'مشاعات', category: 'گزارش خرابی', status: 'open', priority: 'urgent', createdAt: '۵ ساعت پیش' },
  { id: 't3', subject: 'درخواست نصب دوربین در راهرو', unit: 'واحد ۷', category: 'پیشنهاد', status: 'open', priority: 'low', createdAt: '۱ هفته پیش' },
  { id: 't4', subject: 'چراغ راه‌پله طبقه ۳ خراب است', unit: 'واحد ۱۲', category: 'گزارش خرابی', status: 'resolved', priority: 'normal', createdAt: '۳ روز پیش' },
]

export const reservations: Reservation[] = [
  { id: 'r1', amenity: 'سالن اجتماعات', unit: 'واحد ۹', date: '۱۴۰۴/۰۶/۰۳', time: '۱۸:۰۰ - ۲۰:۰۰', status: 'confirmed' },
  { id: 'r2', amenity: 'استخر', unit: 'واحد ۱۲', date: '۱۴۰۴/۰۶/۰۴', time: '۱۰:۰۰ - ۱۱:۰۰', status: 'pending' },
  { id: 'r3', amenity: 'روف‌گاردن', unit: 'واحد ۱۵', date: '۱۴۰۴/۰۶/۰۵', time: '۱۹:۰۰ - ۲۲:۰۰', status: 'confirmed' },
]

export const guestPasses: GuestPass[] = [
  { id: 'g1', guestName: 'آرش محمدی', code: '۴۸۱۹۲۶', validUntil: 'امروز، ۲۳:۵۹', usesLeft: 1, status: 'active' },
  { id: 'g2', guestName: 'شرکت پیک تهران', code: '۷۷۲۰۱۱', validUntil: 'دیروز', usesLeft: 0, status: 'used' },
]

export const parcels: Parcel[] = [
  { id: 'p1', unit: 'واحد ۴', courier: 'اسنپ‌باکس', receivedAt: '۱۰:۲۰', status: 'pending_pickup' },
  { id: 'p2', unit: 'واحد ۱۲', courier: 'پست', receivedAt: '۰۹:۰۵', status: 'pending_pickup' },
  { id: 'p3', unit: 'واحد ۷', courier: 'تیپاکس', receivedAt: 'دیروز', status: 'picked_up' },
]

export const workOrders: WorkOrder[] = [
  { id: 'w1', title: 'سرویس دوره‌ای موتورخانه', asset: 'موتورخانه مرکزی', priority: 'normal', status: 'assigned', dueDate: '۱۴۰۴/۰۶/۰۲' },
  { id: 'w2', title: 'تعمیر نشتی پارکینگ -۱', asset: 'لوله‌کشی مشاعات', priority: 'high', status: 'in_progress', dueDate: '۱۴۰۴/۰۵/۳۰' },
  { id: 'w3', title: 'بازدید سالانه کپسول آتش‌نشانی', asset: 'سیستم اطفا حریق', priority: 'urgent', status: 'open', dueDate: '۱۴۰۴/۰۵/۲۹' },
  { id: 'w4', title: 'سرویس آسانسور B', asset: 'آسانسور B', priority: 'normal', status: 'done', dueDate: '۱۴۰۴/۰۵/۲۵' },
]

export const financeSummary = {
  fundBalance: 184_500_000,
  monthIncome: 42_300_000,
  monthExpense: 19_800_000,
  overdueTotal: 6_825_000,
  overdueUnits: 4,
}

export const monthlyTrend = [
  { month: 'فروردین', income: 36, expense: 22 },
  { month: 'اردیبهشت', income: 38, expense: 19 },
  { month: 'خرداد', income: 40, expense: 25 },
  { month: 'تیر', income: 39, expense: 18 },
  { month: 'مرداد', income: 41, expense: 21 },
  { month: 'شهریور', income: 42, expense: 20 },
]

export function toman(n: number) {
  return n.toLocaleString('fa-IR') + ' تومان'
}

/* ---------- ۷.۱ / ۷.۲ مشاعات، قوانین رزرو و تقویم ---------- */

import type { Amenity, BookingRule, AmenitySession, CalendarSlot, GuardLogEntry, ExpenseCategoryShare } from './types'

export const amenitiesList: Amenity[] = [
  { id: 'am1', name: 'استخر', type: 'pool', capacity: 12, requiresApproval: false, color: '#0E9594' },
  { id: 'am2', name: 'سالن اجتماعات', type: 'hall', capacity: 40, requiresApproval: true, color: '#C08A3E' },
  { id: 'am3', name: 'روف‌گاردن', type: 'roof_garden', capacity: 20, requiresApproval: false, color: '#1D9A6C' },
  { id: 'am4', name: 'سالن بدنسازی', type: 'gym', capacity: 8, requiresApproval: false, color: '#16324F' },
]

export const bookingRules: Record<string, BookingRule> = {
  am1: {
    amenityId: 'am1', maxBookingsPerUnitPerPeriod: 4, periodType: 'month',
    minAdvanceHours: 12, maxAdvanceDays: 3, minSlotMinutes: 60, maxSlotMinutes: 120,
    cancellationWindowHours: 6, depositAmount: 0, depositRefundPolicy: 'full_if_cancelled_in_window',
  },
  am2: {
    amenityId: 'am2', maxBookingsPerUnitPerPeriod: 2, periodType: 'month',
    minAdvanceHours: 48, maxAdvanceDays: 30, minSlotMinutes: 120, maxSlotMinutes: 240,
    cancellationWindowHours: 24, depositAmount: 1_500_000, depositRefundPolicy: 'partial_50',
  },
  am3: {
    amenityId: 'am3', maxBookingsPerUnitPerPeriod: 3, periodType: 'month',
    minAdvanceHours: 6, maxAdvanceDays: 7, minSlotMinutes: 60, maxSlotMinutes: 180,
    cancellationWindowHours: 12, depositAmount: 500_000, depositRefundPolicy: 'full_if_cancelled_in_window',
  },
  am4: {
    amenityId: 'am4', maxBookingsPerUnitPerPeriod: 8, periodType: 'month',
    minAdvanceHours: 2, maxAdvanceDays: 2, minSlotMinutes: 30, maxSlotMinutes: 90,
    cancellationWindowHours: 2, depositAmount: 0, depositRefundPolicy: 'full_if_cancelled_in_window',
  },
}

export const amenitySessions: AmenitySession[] = [
  { id: 's1', amenityId: 'am1', dayOfWeek: 6, startTime: '09:00', endTime: '13:00', sessionType: 'female_only', maxOccupancy: 12 },
  { id: 's2', amenityId: 'am1', dayOfWeek: 6, startTime: '14:00', endTime: '18:00', sessionType: 'male_only', maxOccupancy: 12 },
  { id: 's3', amenityId: 'am1', dayOfWeek: 5, startTime: '10:00', endTime: '22:00', sessionType: 'family', maxOccupancy: 10 },
]

const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]

// تولید داده نمایشی تقویم روزانه برای هر مشاع — رنگ‌بندی وضعیت طبق بخش ۷.۲ سند
export function generateDaySlots(amenityId: string, seed = 0): CalendarSlot[] {
  const pattern: Record<string, CalendarSlot['status'][]> = {
    am1: ['available', 'available', 'confirmed', 'confirmed', 'available', 'pending_approval', 'available', 'maintenance', 'available', 'confirmed', 'available', 'available', 'past'],
    am2: ['available', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'available', 'available', 'pending_approval', 'pending_approval', 'available', 'confirmed', 'available', 'available'],
    am3: ['available', 'available', 'available', 'confirmed', 'available', 'available', 'confirmed', 'available', 'maintenance', 'maintenance', 'available', 'confirmed', 'available'],
    am4: ['confirmed', 'available', 'available', 'confirmed', 'available', 'confirmed', 'available', 'available', 'confirmed', 'available', 'pending_approval', 'available', 'available'],
  }
  const statuses = pattern[amenityId] ?? hours.map(() => 'available' as const)
  const units = ['واحد ۴', 'واحد ۷', 'واحد ۹', 'واحد ۱۲', 'واحد ۱۵', 'واحد ۲۰']
  return hours.map((h, i) => ({
    id: `${amenityId}-${seed}-${h}`,
    amenityId,
    startHour: h,
    status: statuses[i],
    unitLabel: statuses[i] === 'confirmed' || statuses[i] === 'pending_approval' ? units[i % units.length] : undefined,
  }))
}

export const guardLiveFeed: GuardLogEntry[] = [
  { id: 'gl1', type: 'guest_entry', summary: 'مهمان آرش محمدی — واحد ۱۲ وارد شد', time: '۲ دقیقه پیش' },
  { id: 'gl2', type: 'parcel', summary: 'مرسوله اسنپ‌باکس برای واحد ۴ ثبت شد', time: '۱۵ دقیقه پیش' },
  { id: 'gl3', type: 'vehicle_in', summary: 'پلاک ۱۲ ایران ۴۴۵ ب ۷۷ وارد پارکینگ شد', time: '۲۲ دقیقه پیش' },
  { id: 'gl4', type: 'vehicle_out', summary: 'پلاک ۳۳ ایران ۹۰۱ الف ۲۲ از پارکینگ خارج شد', time: '۴۰ دقیقه پیش' },
]

export const expenseBreakdown: ExpenseCategoryShare[] = [
  { category: 'حقوق و دستمزد پرسنل', amount: 12_500_000, colorVar: '#16324F' },
  { category: 'قبض برق و آب مشاعات', amount: 4_100_000, colorVar: '#0E9594' },
  { category: 'نظافت و مواد مصرفی', amount: 3_200_000, colorVar: '#C08A3E' },
  { category: 'تعمیر و نگهداری', amount: 5_800_000, colorVar: '#1D9A6C' },
  { category: 'بیمه و متفرقه', amount: 1_400_000, colorVar: '#C4442E' },
]

export const myChargeSplit = {
  period: 'شهریور ۱۴۰۴',
  total: 2_800_000,
  ownerShare: 1_800_000,
  tenantShare: 1_000_000,
  payerType: 'tenant' as const,
  note: 'طبق قرارداد اجاره: شارژ ثابت با مالک، هزینه‌های مصرفی مشاعات با مستأجر تسویه می‌شود.',
}

// تعداد رزرو انجام‌شده توسط واحد ۱۲ در بازه جاری هر مشاع — برای بررسی سقف رزرو
export const myBookingCounts: Record<string, number> = {
  am1: 1, // استخر — سقف ۴ بار در ماه
  am2: 2, // سالن اجتماعات — سقف ۲ بار در ماه (تکمیل‌شده، برای نمایش رد قانون)
  am3: 0, // روف‌گاردن
  am4: 3, // سالن بدنسازی — سقف ۸ بار در ماه
}

export const myInvoices = [
  { id: 'inv1', title: 'رسید شارژ مرداد ۱۴۰۴', date: '۱۴۰۴/۰۵/۱۰', amount: 2_800_000 },
  { id: 'inv2', title: 'رسید شارژ تیر ۱۴۰۴', date: '۱۴۰۴/۰۴/۱۰', amount: 2_750_000 },
  { id: 'inv3', title: 'فاکتور بیعانه رزرو سالن اجتماعات', date: '۱۴۰۴/۰۳/۲۲', amount: 1_500_000 },
]

/* ---------- پنل Super-Admin (مدیریت SaaS) ---------- */

export const platformPlans: PlatformPlan[] = [
  { id: 'pl1', name: 'استارتر', monthlyPrice: 1_200_000, maxUnits: 30, modules: ['مالی', 'تیکتینگ'], tenantCount: 18 },
  { id: 'pl2', name: 'حرفه‌ای', monthlyPrice: 3_400_000, maxUnits: 100, modules: ['مالی', 'رزرو مشاعات', 'نگهبانی', 'تیکتینگ'], tenantCount: 34 },
  { id: 'pl3', name: 'سازمانی', monthlyPrice: 8_900_000, maxUnits: 500, modules: ['همه ماژول‌ها', 'SLA اختصاصی', 'API'], tenantCount: 6 },
]

export const platformTenants: PlatformTenant[] = [
  { id: 'tn1', name: 'برج آفتاب', subdomain: 'aftab', plan: 'حرفه‌ای', status: 'active', unitCount: 24, unitLimit: 100, mrr: 3_400_000, joinedAt: '۱۴۰۳/۰۲/۱۵' },
  { id: 'tn2', name: 'مجتمع نگین', subdomain: 'negin', plan: 'استارتر', status: 'active', unitCount: 22, unitLimit: 30, mrr: 1_200_000, joinedAt: '۱۴۰۳/۰۶/۰۱' },
  { id: 'tn3', name: 'برج پارسیان', subdomain: 'parsian', plan: 'سازمانی', status: 'active', unitCount: 340, unitLimit: 500, mrr: 8_900_000, joinedAt: '۱۴۰۲/۱۱/۱۰' },
  { id: 'tn4', name: 'مجتمع یاس', subdomain: 'yas', plan: 'استارتر', status: 'trial', unitCount: 12, unitLimit: 30, mrr: 0, joinedAt: '۱۴۰۴/۰۵/۲۰' },
  { id: 'tn5', name: 'برج الماس', subdomain: 'almas', plan: 'حرفه‌ای', status: 'suspended', unitCount: 60, unitLimit: 100, mrr: 0, joinedAt: '۱۴۰۳/۰۱/۰۵' },
]

export const platformInvoices: PlatformInvoice[] = [
  { id: 'pinv1', tenantName: 'برج آفتاب', period: 'شهریور ۱۴۰۴', amount: 3_400_000, status: 'paid', date: '۱۴۰۴/۰۶/۰۱' },
  { id: 'pinv2', tenantName: 'برج پارسیان', period: 'شهریور ۱۴۰۴', amount: 8_900_000, status: 'paid', date: '۱۴۰۴/۰۶/۰۱' },
  { id: 'pinv3', tenantName: 'مجتمع نگین', period: 'شهریور ۱۴۰۴', amount: 1_200_000, status: 'pending', date: '۱۴۰۴/۰۶/۰۱' },
  { id: 'pinv4', tenantName: 'برج الماس', period: 'مرداد ۱۴۰۴', amount: 3_400_000, status: 'failed', date: '۱۴۰۴/۰۵/۰۱' },
]

export const platformSummary = {
  totalMrr: 13_500_000,
  activeTenants: 3,
  trialTenants: 1,
  suspendedTenants: 1,
  totalUnitsManaged: 458,
}

/* ---------- ۹.۱ سفارش غذای مشاعات (FnB) — بر اساس docs/UPDATE-V2-AUDIT-FNB-DESIGN.md ---------- */

import type { FnbVenue, MenuItem, DeliveryZone, FnbOrder, AuditLogEntry, AuditVolumePoint } from './types'

export const fnbVenues: FnbVenue[] = [
  { id: 'v1', name: 'کافه‌رستوران آفتاب', icon: 'restaurant', isOpen: true, prepTimeMinutes: 25, billing: 'wallet', categories: ['همه', 'غذای اصلی', 'صبحانه', 'دسر'] },
  { id: 'v2', name: 'کافی‌شاپ لابی', icon: 'cafe', isOpen: true, prepTimeMinutes: 8, billing: 'monthly_charge', categories: ['همه', 'قهوه', 'دمنوش', 'کیک و شیرینی'] },
]

export const menuItems: MenuItem[] = [
  { id: 'm1', venueId: 'v1', category: 'غذای اصلی', name: 'برگر خانگی آفتاب', price: 385_000, icon: 'burger', color: '#c9a227', availability: 'available' },
  { id: 'm2', venueId: 'v1', category: 'غذای اصلی', name: 'پاستا آلفردو', price: 320_000, icon: 'pasta', color: '#0e9594', availability: 'available' },
  { id: 'm3', venueId: 'v1', category: 'غذای اصلی', name: 'استیک راسته', price: 690_000, icon: 'steak', color: '#c0392b', availability: 'sold_out' },
  { id: 'm4', venueId: 'v1', category: 'صبحانه', name: 'املت مخصوص', price: 210_000, icon: 'egg', color: '#b8860b', availability: 'available' },
  { id: 'm7', venueId: 'v1', category: 'دسر', name: 'چیزکیک زعفرانی', price: 190_000, icon: 'cake', color: '#c9a227', availability: 'available' },
  { id: 'm8', venueId: 'v1', category: 'دسر', name: 'بستنی سنتی', price: 160_000, icon: 'icecream', color: '#4c6ef5', availability: 'sold_out' },
  { id: 'c1', venueId: 'v2', category: 'قهوه', name: 'اسپرسو دوبل', price: 95_000, icon: 'espresso', color: '#7a5c3e', availability: 'available' },
  { id: 'c2', venueId: 'v2', category: 'قهوه', name: 'لاته وانیل', price: 135_000, icon: 'latte', color: '#c9a227', availability: 'available' },
  { id: 'c3', venueId: 'v2', category: 'قهوه', name: 'آیس آمریکانو', price: 125_000, icon: 'iced-coffee', color: '#0e9594', availability: 'available' },
  { id: 'c4', venueId: 'v2', category: 'دمنوش', name: 'چای ماسالا', price: 88_000, icon: 'tea', color: '#b8860b', availability: 'available' },
  { id: 'c5', venueId: 'v2', category: 'دمنوش', name: 'دمنوش به‌لیمو', price: 72_000, icon: 'tea', color: '#1d9a6c', availability: 'sold_out' },
  { id: 'c6', venueId: 'v2', category: 'کیک و شیرینی', name: 'براونی فندقی', price: 110_000, icon: 'cake', color: '#7a5c3e', availability: 'available' },
  { id: 'c7', venueId: 'v2', category: 'کیک و شیرینی', name: 'کروسان کره', price: 98_000, icon: 'croissant', color: '#c9a227', availability: 'available' },
]

export const deliveryZones: DeliveryZone[] = [
  { id: 'z1', name: 'استخر' },
  { id: 'z2', name: 'سینما' },
  { id: 'z3', name: 'بدنسازی' },
  { id: 'z4', name: 'روف‌گاردن' },
]

// صف زنده آشپزخانه — کارت‌های Kanban برای Kitchen Display (بخش ۴.۴ سند)
export const kitchenQueue: FnbOrder[] = [
  {
    id: 'o1043', orderNumber: '۱۰۴۳', venueId: 'v1', venueName: 'کافه‌رستوران آفتاب',
    deliveryType: 'amenity_zone', destinationLabel: 'استخر — تخت شماره ۷', status: 'placed', billing: 'wallet',
    items: [{ itemId: 'm1', name: 'برگر خانگی آفتاب', quantity: 2, unitPrice: 385_000, lineTotal: 770_000 }],
    subtotal: 770_000, total: 770_000, placedAt: '۱۴:۰۲', prepTimeMinutes: 25,
  },
  {
    id: 'o1041', orderNumber: '۱۰۴۱', venueId: 'v1', venueName: 'کافه‌رستوران آفتاب',
    deliveryType: 'in_unit', destinationLabel: 'واحد ۱۲', status: 'preparing', billing: 'wallet',
    items: [{ itemId: 'm2', name: 'پاستا آلفردو', quantity: 1, unitPrice: 320_000, lineTotal: 320_000 }],
    subtotal: 320_000, total: 320_000, placedAt: '۱۳:۴۸', prepTimeMinutes: 25,
  },
  {
    id: 'o2288', orderNumber: '۲۲۸۸', venueId: 'v2', venueName: 'کافی‌شاپ لابی',
    deliveryType: 'amenity_zone', destinationLabel: 'سینما', status: 'preparing', billing: 'monthly_charge',
    items: [{ itemId: 'c2', name: 'لاته وانیل', quantity: 2, unitPrice: 135_000, lineTotal: 270_000 }],
    subtotal: 270_000, total: 270_000, placedAt: '۱۳:۵۵', prepTimeMinutes: 8,
  },
  {
    id: 'o1039', orderNumber: '۱۰۳۹', venueId: 'v2', venueName: 'کافی‌شاپ لابی',
    deliveryType: 'amenity_zone', destinationLabel: 'سینما', status: 'ready', billing: 'monthly_charge',
    items: [{ itemId: 'c3', name: 'آیس آمریکانو', quantity: 3, unitPrice: 125_000, lineTotal: 375_000 }],
    subtotal: 375_000, total: 375_000, placedAt: '۱۳:۳۰', prepTimeMinutes: 8,
  },
]

/* ---------- ۹.۲ Audit Logging — بر اساس docs/UPDATE-V2-AUDIT-FNB-DESIGN.md بخش ۲.۱/۴.۳ ---------- */

const SESSION_A = 'a1c9e4d2-8f31-4e6a-9b12-77c4f0a1e001'
const SESSION_B = 'b2d8f5e3-7a42-4f1b-8c23-88d5a1b2f002'

export const auditLogs: AuditLogEntry[] = [
  { id: 'lg1', occurredAt: '۱۴:۳۱:۵۸', sessionId: SESSION_A, traceId: 'tr-9001', userId: 'u12', actorRole: 'resident', source: 'identity-svc', level: 'info', action: 'auth.refresh', httpMethod: 'POST', httpPath: '/api/auth/refresh', statusCode: 200, durationMs: 120, device: { os: 'iOS 17.4', browser: 'Safari', isPwa: true } },
  { id: 'lg2', occurredAt: '۱۴:۳۲:۰۶', sessionId: SESSION_A, traceId: 'tr-9002', userId: 'u12', actorRole: 'resident', source: 'fnb-svc', level: 'info', action: 'menu.fetch', httpMethod: 'GET', httpPath: '/api/fnb/venues/v1/menu', statusCode: 200, durationMs: 340, device: { os: 'iOS 17.4', browser: 'Safari', isPwa: true } },
  { id: 'lg3', occurredAt: '۱۴:۳۲:۰۷', sessionId: SESSION_A, traceId: 'tr-9003', userId: 'u12', actorRole: 'resident', source: 'fnb-svc', level: 'error', action: 'order.place', httpMethod: 'POST', httpPath: '/api/fnb/orders', statusCode: 500, durationMs: 1840, device: { os: 'iOS 17.4', browser: 'Safari', isPwa: true } },
  { id: 'lg4', occurredAt: '۱۴:۳۲:۰۹', sessionId: SESSION_A, traceId: 'tr-9004', userId: 'u12', actorRole: 'resident', source: 'fnb-svc', level: 'error', action: 'order.retry', httpMethod: 'POST', httpPath: '/api/fnb/orders', statusCode: 500, durationMs: 1620, device: { os: 'iOS 17.4', browser: 'Safari', isPwa: true } },
  { id: 'lg5', occurredAt: '۱۴:۳۲:۱۲', sessionId: SESSION_A, traceId: 'tr-9005', userId: 'u12', actorRole: 'resident', source: 'fnb-svc', level: 'warn', action: 'inventory.reserve_conflict', httpMethod: 'POST', httpPath: '/api/fnb/orders', statusCode: 409, durationMs: 95, device: { os: 'iOS 17.4', browser: 'Safari', isPwa: true } },
  { id: 'lg6', occurredAt: '۱۳:۵۸:۴۰', sessionId: SESSION_B, traceId: 'tr-8801', userId: 'u4', actorRole: 'guard', source: 'guard-svc', level: 'info', action: 'guest_pass.verify', httpMethod: 'POST', httpPath: '/api/guard/guest-passes/verify', statusCode: 200, durationMs: 80, device: { os: 'Android 14', browser: 'Chrome', isPwa: true } },
  { id: 'lg7', occurredAt: '۱۳:۴۵:۱۱', sessionId: SESSION_B, traceId: 'tr-8802', userId: 'u4', actorRole: 'guard', source: 'guard-svc', level: 'info', action: 'parcel.register', httpMethod: 'POST', httpPath: '/api/guard/parcels', statusCode: 201, durationMs: 145, device: { os: 'Android 14', browser: 'Chrome', isPwa: true } },
  { id: 'lg8', occurredAt: '۱۲:۱۰:۰۲', sessionId: SESSION_A, traceId: 'tr-9000', userId: 'u12', actorRole: 'resident', source: 'client', level: 'debug', action: 'app.foreground', statusCode: undefined, durationMs: undefined, device: { os: 'iOS 17.4', browser: 'Safari', isPwa: true } },
]

export const auditVolume: AuditVolumePoint[] = [
  { label: '۱۰:۰۰', count: 42, errorCount: 1 },
  { label: '۱۱:۰۰', count: 58, errorCount: 0 },
  { label: '۱۲:۰۰', count: 65, errorCount: 2 },
  { label: '۱۳:۰۰', count: 71, errorCount: 3 },
  { label: '۱۴:۰۰', count: 88, errorCount: 6 },
  { label: '۱۵:۰۰', count: 54, errorCount: 1 },
]
