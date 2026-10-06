/**
 * کلاینت آفرها و سهمیه‌ی خدمات واحد (facility-service، مسیر /api/facility/entitlements).
 * سهمیه‌ی رایگان از روی متراژ واحد تعیین می‌شود؛ مصرف مازاد در صدور شارژ ماه بعد اضافه می‌شود.
 */
import { api } from './client'

const E = '/facility/entitlements'

export type ServiceKind = 'quota' | 'paid' | 'free'
export type PeriodType = 'month' | 'year'
export type UnitKind = 'count' | 'minutes' | 'hours' | 'people' | 'days'
export type TierMatch = 'exact' | 'below_min' | 'unknown'

export interface TariffLine {
  code: string
  title: string
  unit_price: number
  step: number
  counts_toward_quota: boolean
  is_default: boolean
}

export interface ServiceLine {
  code: string
  title: string
  kind: ServiceKind
  unit_kind: UnitKind
  unit_label: string
  period_type: PeriodType
  window_label: string
  supports_ticket: boolean
  note: string | null
  included: number | null
  used: number
  remaining: number | null
  overage_qty: number
  overage_amount: number
  open_tickets: number
  tariffs: TariffLine[]
}

export interface UnitSummary {
  unit: { id: string; unit_number: string; floor: number | null; area: number | null }
  tier: { id: string; name: string; min_area: number } | null
  tier_match: TierMatch
  period: string
  period_label: string
  services: ServiceLine[]
  totals: { overage_this_period: number; unbilled: number }
}

export interface UsageEvent {
  id: string
  unit_id: string
  unit_number: string
  service_code: string
  service_title: string
  unit_label: string
  tariff_title: string | null
  quantity: number
  occurred_at: string
  period: string
  source: 'desk' | 'qr_guest'
  note: string | null
  status: 'active' | 'void'
  void_reason: string | null
  quota_qty: number
  overage_qty: number
  amount: number
  billed: boolean
  recorded_by_name: string | null
}

export interface Ticket {
  id: string
  unit_id: string
  unit_number?: string
  service_code: string
  service_title: string
  guest_name: string
  qr: string
  valid_until: string
  status: 'issued' | 'used' | 'void' | 'expired'
  used_at: string | null
  created_at: string
}

export interface AreaPreview {
  area: number
  tier: { id: string; name: string; min_area: number } | null
  tier_match: TierMatch
  quotas: { code: string; title: string; unit_label: string; period_type: PeriodType; included: number }[]
}

export interface DeskUnit { id: string; unit_number: string; floor: number | null; area: number | null }

export interface ScanResult {
  ok: true
  guest_name: string
  unit_number: string
  service_title: string
  charged: boolean
  amount: number
  remaining: number | null
  included: number | null
  used: number
  unit_label: string
  event: UsageEvent
}

export interface Tier { id: string; name: string; min_area: number; sort: number }
export interface Tariff {
  id: string
  service_id: string
  code: string
  title: string
  unit_price: number
  step: number
  counts_toward_quota: boolean
  is_default: boolean
  is_active: boolean
  sort: number
}
export interface CatalogService {
  id: string
  code: string
  title: string
  kind: ServiceKind
  unit_kind: UnitKind
  unit_label: string
  period_type: PeriodType
  supports_ticket: boolean
  note: string | null
  sort: number
  is_active: boolean
  tariffs: Tariff[]
}
export interface Catalog {
  tiers: Tier[]
  services: CatalogService[]
  /** quotas[serviceId][tierId] = تعداد رایگان */
  quotas: Record<string, Record<string, number>>
}

export const entitlementsApi = {
  // ساکن
  me: () => api.get<UnitSummary>(`${E}/me`),
  myEvents: (limit = 50) => api.get<UsageEvent[]>(`${E}/me/events?limit=${limit}`),
  myTickets: () => api.get<Ticket[]>(`${E}/me/tickets`),
  issueTicket: (b: { serviceCode: string; guestName: string; date?: string }) => api.post<Ticket>(`${E}/me/tickets`, b),
  voidTicket: (id: string) => api.post<Ticket>(`${E}/me/tickets/${id}/void`),

  // میز مسئول (مدیر یا کارمند دارای دسترسی مشاعات)
  catalog: () => api.get<Catalog>(`${E}/catalog`),
  preview: (area: number) => api.get<AreaPreview>(`${E}/preview?area=${encodeURIComponent(String(area))}`),
  deskUnits: (q: string) => api.get<DeskUnit[]>(`${E}/desk/units?q=${encodeURIComponent(q)}`),
  deskSummary: (unitId: string) => api.get<UnitSummary>(`${E}/desk/units/${unitId}/summary`),
  deskEvents: (p: { unitId?: string; period?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    if (p.unitId) qs.set('unitId', p.unitId)
    if (p.period) qs.set('period', p.period)
    if (p.limit) qs.set('limit', String(p.limit))
    return api.get<UsageEvent[]>(`${E}/desk/events?${qs.toString()}`)
  },
  record: (b: { unitId: string; serviceCode: string; variantCode?: string; quantity: number; note?: string }) =>
    api.post<{ event: UsageEvent; service: ServiceLine | null }>(`${E}/desk/usage`, b),
  voidEvent: (id: string, reason: string) => api.post<UsageEvent>(`${E}/desk/events/${id}/void`, { reason }),
  scan: (token: string) => api.post<ScanResult>(`${E}/desk/scan`, { token }),

  // مدیر
  config: () => api.get<Catalog>(`${E}/config`),
  setQuota: (b: { tierId: string; serviceId: string; included: number }) =>
    api.put<{ ok: boolean; recomputed_units: number }>(`${E}/config/quotas`, b),
  patchTariff: (id: string, b: Partial<Pick<Tariff, 'title' | 'unit_price' | 'step' | 'counts_toward_quota' | 'is_active'>>) =>
    api.patch<Tariff>(`${E}/config/tariffs/${id}`, b),
  patchService: (id: string, b: { title?: string; note?: string; is_active?: boolean }) => api.patch<CatalogService>(`${E}/config/services/${id}`, b),
  addTier: (b: { min_area: number; name?: string }) => api.post<Tier>(`${E}/config/tiers`, b),
  patchTier: (id: string, b: { name?: string; min_area?: number }) => api.patch<Tier>(`${E}/config/tiers/${id}`, b),
  deleteTier: (id: string) => api.delete<{ ok: boolean }>(`${E}/config/tiers/${id}`),
  applyTemplate: (overwrite = false) => api.post<Record<string, unknown>>(`${E}/config/apply-template`, { template: 'baran3', overwrite }),
  recompute: () => api.post<{ ok: boolean; pairs: number }>(`${E}/config/recompute`),
}
