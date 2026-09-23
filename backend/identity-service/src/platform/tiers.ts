/**
 * ماتریس سطوح سرویس (Service Tier) — ساده / اقتصادی / حرفه‌ای
 *
 * نسخه‌ی متناظر سمت فرانت‌اند: `frontend/src/lib/tiers.ts`
 * (هر تغییری باید در هر دو فایل اعمال شود).
 *
 * سطح هر ساختمان تعیین می‌کند چه ماژول‌هایی برای آن tenant فعال است؛ سرویس‌های
 * دیگر (facility/guard/fnb/...) باید پیش از اجرای عملیات، فعال بودن قابلیت
 * مربوطه را از همین ماتریس بررسی کنند.
 */

export type BuildingTier = 'simple' | 'economic' | 'professional'

export type FeatureKey =
  | 'finance_transparency'
  | 'charge_issue'
  | 'charge_payment'
  | 'fault_report'
  | 'purchase_log'
  | 'periodic_service'
  | 'housekeeping'
  | 'announcements'
  | 'amenity_booking'
  | 'amenity_rules'
  | 'live_calendar'
  | 'voting'
  | 'guard_desk'
  | 'guest_pass'
  | 'parcels'
  | 'vehicle_traffic'
  | 'fnb_ordering'
  | 'facility_cmms'
  | 'audit_log'

const BASE_FEATURES: FeatureKey[] = [
  'finance_transparency',
  'charge_issue',
  'charge_payment',
  'fault_report',
  'purchase_log',
  'periodic_service',
  'housekeeping',
  'announcements',
]

const AMENITY_FEATURES: FeatureKey[] = ['amenity_booking', 'amenity_rules', 'live_calendar', 'voting']

const FULL_FEATURES: FeatureKey[] = [
  'guard_desk',
  'guest_pass',
  'parcels',
  'vehicle_traffic',
  'fnb_ordering',
  'facility_cmms',
  'audit_log',
]

export interface TierDefinition {
  id: BuildingTier
  label: string
  summary: string
  fitFor: string
  features: FeatureKey[]
  /** قیمت پایه‌ی ماهانه به ازای هر واحد (تومان) */
  pricePerUnit: number
}

export const TIERS: TierDefinition[] = [
  {
    id: 'simple',
    label: 'ساده',
    summary: 'شفافیت مالی، شارژ، گزارش خرابی، خریدها، سرویس دوره‌ای و نظافت',
    fitFor: 'ساختمان‌هایی بدون مشاعات، لابی و نگهبانی',
    features: BASE_FEATURES,
    pricePerUnit: 25_000,
  },
  {
    id: 'economic',
    label: 'اقتصادی',
    summary: 'همه‌ی امکانات ساده + رزرو مشاعات، تقویم زنده و رأی‌گیری',
    fitFor: 'ساختمان‌هایی با چند مشاعات (سینما، باشگاه) بدون لابی/نگهبانی/تأسیسات',
    features: [...BASE_FEATURES, ...AMENITY_FEATURES],
    pricePerUnit: 40_000,
  },
  {
    id: 'professional',
    label: 'حرفه‌ای',
    summary: 'تمامی خدمات — نگهبانی و لابی، تردد خودرو، مرسولات، تأسیسات، سفارش غذا و لاگ',
    fitFor: 'برج‌ها و مجتمع‌های کامل با لابی، نگهبانی و تأسیسات',
    features: [...BASE_FEATURES, ...AMENITY_FEATURES, ...FULL_FEATURES],
    pricePerUnit: 65_000,
  },
]

export const TIER_IDS: BuildingTier[] = TIERS.map((t) => t.id)

export function getTier(tier: BuildingTier): TierDefinition {
  const found = TIERS.find((t) => t.id === tier)
  if (!found) throw new Error(`سطح سرویس نامعتبر: ${tier}`)
  return found
}

export function tierHasFeature(tier: BuildingTier, feature: FeatureKey): boolean {
  return getTier(tier).features.includes(feature)
}

export function suggestMonthlyFee(tier: BuildingTier, unitCount: number): number {
  return getTier(tier).pricePerUnit * Math.max(unitCount, 0)
}
