/**
 * ماتریس سطوح سرویس (Service Tier) — ساده / اقتصادی / حرفه‌ای
 *
 * هر ساختمانِ مشتری با یکی از این سه سطح تعریف می‌شود و همین سطح تعیین می‌کند
 * کدام ماژول‌های نرم‌افزار برای آن مجتمع فعال باشد. این فایل «منبع حقیقت» سمت
 * فرانت‌اند است و نسخه‌ی متناظر آن در بک‌اند در
 * `backend/identity-service/src/platform/tiers.ts` قرار دارد — هر تغییری باید
 * در هر دو فایل اعمال شود (یا در آینده به یک پکیج مشترک منتقل شود).
 */

export type BuildingTier = 'simple' | 'economic' | 'professional'

/** کلید هر قابلیت — همین کلیدها در بک‌اند هم برای صدور مجوز ماژول استفاده می‌شوند */
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

export const featureLabels: Record<FeatureKey, string> = {
  finance_transparency: 'شفافیت مالی و صندوق',
  charge_issue: 'ثبت و صدور شارژ',
  charge_payment: 'پرداخت آنلاین شارژ',
  fault_report: 'ثبت گزارش خرابی (تیکت)',
  purchase_log: 'ثبت خریدها و هزینه‌ها',
  periodic_service: 'سرویس‌های دوره‌ای',
  housekeeping: 'برنامه نظافت',
  announcements: 'اطلاعیه‌ها',
  amenity_booking: 'رزرو مشاعات',
  amenity_rules: 'قوانین رزرو هوشمند',
  live_calendar: 'تقویم بصری زنده',
  voting: 'رأی‌گیری و نظرسنجی',
  guard_desk: 'پنل نگهبانی / لابی',
  guest_pass: 'کد مهمان (QR)',
  parcels: 'ثبت مرسولات پستی',
  vehicle_traffic: 'تردد خودرو و پارکینگ',
  fnb_ordering: 'سفارش غذا و کافی‌شاپ',
  facility_cmms: 'مدیریت تأسیسات (CMMS)',
  audit_log: 'داشبورد لاگ و رهگیری',
}

/** قابلیت‌های پایه — در هر سه سطح فعال است */
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

/** قابلیت‌های مشاعات — از سطح اقتصادی به بالا */
const AMENITY_FEATURES: FeatureKey[] = ['amenity_booking', 'amenity_rules', 'live_calendar', 'voting']

/** قابلیت‌های کامل (لابی، نگهبانی، تأسیسات، FnB) — فقط سطح حرفه‌ای */
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
  /** توضیح یک‌خطی — همان تعریفی که در پنل سوپرادمین هنگام انتخاب سطح نشان داده می‌شود */
  summary: string
  /** برای چه ساختمان‌هایی مناسب است */
  fitFor: string
  features: FeatureKey[]
  /** قیمت پایه‌ی ماهانه به ازای هر واحد (تومان) — مبنای پیشنهاد اولیه‌ی مبلغ اشتراک */
  pricePerUnit: number
  /** رنگ نشان‌گر در UI (کلاس‌های Tailwind پروژه) */
  accent: string
}

export const tiers: TierDefinition[] = [
  {
    id: 'simple',
    label: 'ساده',
    summary: 'شفافیت مالی، شارژ، گزارش خرابی، خریدها، سرویس دوره‌ای و نظافت',
    fitFor: 'ساختمان‌هایی که مشاعات، لابی یا نگهبانی ندارند و فقط به نظم مالی و ثبت خرابی نیاز دارند',
    features: BASE_FEATURES,
    pricePerUnit: 25_000,
    accent: 'text-muted bg-canvas border-line',
  },
  {
    id: 'economic',
    label: 'اقتصادی',
    summary: 'همه‌ی امکانات ساده + رزرو مشاعات، تقویم زنده و رأی‌گیری',
    fitFor: 'ساختمان‌هایی با چند مشاعات (سینما، باشگاه) اما بدون لابی، نگهبانی یا تأسیسات',
    features: [...BASE_FEATURES, ...AMENITY_FEATURES],
    pricePerUnit: 40_000,
    accent: 'text-brass bg-brass-soft border-brass',
  },
  {
    id: 'professional',
    label: 'حرفه‌ای',
    summary: 'تمامی خدمات — نگهبانی و لابی، تردد خودرو، مرسولات، تأسیسات، سفارش غذا و لاگ',
    fitFor: 'برج‌ها و مجتمع‌های کامل با لابی، نگهبانی ۲۴ ساعته و تأسیسات اختصاصی',
    features: [...BASE_FEATURES, ...AMENITY_FEATURES, ...FULL_FEATURES],
    pricePerUnit: 65_000,
    accent: 'text-tile bg-tile-soft border-tile',
  },
]

export const tierById: Record<BuildingTier, TierDefinition> = {
  simple: tiers[0],
  economic: tiers[1],
  professional: tiers[2],
}

/** همه‌ی قابلیت‌ها به ترتیب نمایش — برای جدول مقایسه‌ی سطوح */
export const allFeatures: FeatureKey[] = [...BASE_FEATURES, ...AMENITY_FEATURES, ...FULL_FEATURES]

export function tierHasFeature(tier: BuildingTier, feature: FeatureKey): boolean {
  return tierById[tier].features.includes(feature)
}

/** پیشنهاد مبلغ اشتراک ماهانه بر اساس سطح و تعداد واحد */
export function suggestMonthlyFee(tier: BuildingTier, unitCount: number): number {
  return tierById[tier].pricePerUnit * Math.max(unitCount, 0)
}
