/**
 * کلاینت پنل «نظافت منازل» (facility-service، مسیر /api/facility/entitlements/cleaning).
 * نظافتچی واحد را انتخاب و شروع/پایان را ثبت می‌کند؛ مدت از سهمیه‌ی ساعتِ «خانه‌داری» واحد کم می‌شود و مازاد
 * طبق نرخ شیفت در شارژ ماه بعد می‌آید (همان موتور آفرها — هیچ منطق مالی موازی نیست).
 */
import { api } from './client'
import type { ServiceLine, Tier, TierMatch } from './entitlements'

const C = '/facility/entitlements/cleaning'

export type CleaningShift = 'day' | 'overtime' | 'night'
export type CleaningStatus = 'running' | 'done' | 'cancelled' | 'void'

export interface CleaningUnit { id: string; unit_number: string; floor: number | null; area: number | null }

export interface CleaningSession {
  id: string
  unit_id: string
  unit_number: string
  floor: number | null
  started_at: string
  ended_at: string | null
  status: CleaningStatus
  entry: 'timer' | 'manual'
  note: string | null
  quantity: number | null
  unit_label: string | null
  tariff_title: string | null
  quota_qty: number
  overage_qty: number
  amount: number
  billed: boolean
  can_void: boolean
}

/** نتیجه‌ی (واقعی یا پیش‌نمایش) یک نظافت: چه مقدار از سهمیه کم می‌شود و چه مقدار مازاد است */
export interface CleaningOutcome {
  minutes: number
  duration_label: string
  quantity: number
  unit_label: string
  shift: CleaningShift
  shift_label: string
  tariff_title: string | null
  free_qty: number
  overage_qty: number
  amount: number
  included: number
  remaining_after: number
  no_tier: boolean
  window_label: string
}

export interface CleaningHome {
  service: { configured: boolean; unit_label: string }
  active: CleaningSession | null
  recent_units: CleaningUnit[]
  month: { period_label: string; sessions: number; minutes: number; overage_amount: number }
}

export interface CleaningUnitInfo {
  unit: CleaningUnit
  tier: Tier | null
  tier_match: TierMatch
  line: ServiceLine | null
}

export interface CleaningCommit { session: CleaningSession; result: CleaningOutcome }

export const cleaningApi = {
  home: () => api.get<CleaningHome>(`${C}/home`),
  units: (q: string) => api.get<CleaningUnit[]>(`${C}/units?q=${encodeURIComponent(q)}`),
  unit: (id: string) => api.get<CleaningUnitInfo>(`${C}/units/${id}`),
  mine: (limit = 30) => api.get<CleaningSession[]>(`${C}/mine?limit=${limit}`),
  preview: (b: { unitId: string; startedAt: string; endedAt?: string }) => api.post<CleaningOutcome>(`${C}/preview`, b),
  start: (unitId: string) => api.post<CleaningSession>(`${C}/start`, { unitId }),
  finish: (id: string, b: { endedAt?: string; note?: string } = {}) => api.post<CleaningCommit>(`${C}/${id}/finish`, b),
  cancel: (id: string) => api.post<CleaningSession>(`${C}/${id}/cancel`),
  voidSession: (id: string) => api.post<CleaningSession>(`${C}/${id}/void`),
  manual: (b: { unitId: string; startedAt: string; endedAt: string; note?: string }) => api.post<CleaningCommit>(`${C}/manual`, b),
}
