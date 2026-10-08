/**
 * نسخه‌ی کم‌حجم ماتریس سطوح سرویس — منبع اصلی: backend/identity-service/src/platform/tiers.ts
 * (هر تغییری در ماتریس باید در همه‌ی کپی‌ها اعمال شود؛ هر سرویس فقط همین ماتریس را برای تصمیم‌گیری لازم دارد).
 */
export type BuildingTier = 'simple' | 'economic' | 'professional'

export type FeatureKey =
  | 'finance_transparency' | 'charge_issue' | 'charge_payment' | 'fault_report' | 'purchase_log'
  | 'periodic_service' | 'housekeeping' | 'announcements'
  | 'amenity_booking' | 'amenity_rules' | 'live_calendar' | 'voting'
  | 'guard_desk' | 'guest_pass' | 'parcels' | 'vehicle_traffic' | 'fnb_ordering' | 'facility_cmms' | 'audit_log'

const BASE: FeatureKey[] = ['finance_transparency', 'charge_issue', 'charge_payment', 'fault_report', 'purchase_log', 'periodic_service', 'housekeeping', 'announcements']
const AMENITY: FeatureKey[] = ['amenity_booking', 'amenity_rules', 'live_calendar', 'voting']
const FULL: FeatureKey[] = ['guard_desk', 'guest_pass', 'parcels', 'vehicle_traffic', 'fnb_ordering', 'facility_cmms', 'audit_log']

const FEATURES: Record<BuildingTier, FeatureKey[]> = {
  simple: BASE,
  economic: [...BASE, ...AMENITY],
  professional: [...BASE, ...AMENITY, ...FULL],
}

export function isBuildingTier(v: unknown): v is BuildingTier {
  return typeof v === 'string' && v in FEATURES
}

export function tierHasFeature(tier: BuildingTier, feature: FeatureKey): boolean {
  return FEATURES[tier].includes(feature)
}
