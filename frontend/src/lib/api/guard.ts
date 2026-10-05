/**
 * کلاینت guard-svc (پورت ۳۰۰۵، مسیر /api/guard) — مرسولات، کد مهمان، تردد خودرو و داشبورد نگهبانی.
 */
import { api } from './client'

export interface Parcel {
  id: string
  unit_id: string
  unit_number: string | null
  courier_company: string | null
  tracking_code: string | null
  photo_url: string | null
  status: 'pending_pickup' | 'picked_up'
  received_at: string
  picked_up_at: string | null
}

export interface GuestPass {
  id: string
  unit_id: string
  unit_number: string | null
  guest_name: string
  code: string
  valid_from: string
  valid_until: string
  max_uses: number
  uses_count: number
  status: 'active' | 'used' | 'expired' | 'revoked'
  created_at: string
}

export type VerifyResult =
  | { ok: true; passId: string; guestName: string; unitId: string; unitNumber: string | null; usesLeft: number }
  | { ok: false; reason: string }

export interface GuestVisit {
  id: string
  guest_name: string
  unit_id: string
  unit_number: string | null
  entry_at: string
  label?: string
}

export interface UnitOption {
  id: string
  no: string
  floor: number | null
}

export interface Vehicle {
  id: string
  plate: string
  owner_name: string | null
  label: string | null
  unit_id: string
  unit_number: string | null
}

export interface VehicleLog {
  id: string
  plate: string
  unit_id: string | null
  unit_number: string | null
  direction: 'in' | 'out'
  is_guest: boolean
  note: string | null
  recorded_at: string
}

export interface GuardSummary {
  pending_parcels: number
  guests_today: number
  expected_guests: number
  vehicles_today: number
}

export interface FeedEntry {
  type: 'guest_entry' | 'parcel' | 'vehicle_in' | 'vehicle_out'
  id: string
  at: string
  unit_number: string | null
  summary: string
}

export const guardApi = {
  units: (q?: string) => api.get<UnitOption[]>(`/guard/units${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  summary: () => api.get<GuardSummary>('/guard/summary'),
  feed: (limit = 20) => api.get<FeedEntry[]>(`/guard/feed?limit=${limit}`),

  // مرسولات
  parcels: (status?: string) => api.get<Parcel[]>(`/guard/parcels${status ? `?status=${status}` : ''}`),
  myParcels: () => api.get<Parcel[]>('/guard/parcels/mine'),
  registerParcel: (b: { unitId: string; courierCompany?: string; trackingCode?: string }) => api.post<Parcel>('/guard/parcels', b),
  confirmPickup: (id: string) => api.post<Parcel>(`/guard/parcels/${id}/pickup-confirm`, {}),

  // کد مهمان — ساکن
  myPasses: () => api.get<GuestPass[]>('/guard/me/guest-passes'),
  issuePass: (b: { guestName: string; validUntil: string; maxUses?: number }) => api.post<GuestPass>('/guard/me/guest-passes', b),
  revokePass: (id: string) => api.post<GuestPass>(`/guard/me/guest-passes/${id}/revoke`, {}),

  // کد مهمان — نگهبان
  activePasses: () => api.get<GuestPass[]>('/guard/guest-passes?scope=active'),
  visitsToday: () => api.get<GuestVisit[]>('/guard/guest-visits'),
  verify: (code: string) => api.get<VerifyResult>(`/guard/guest-passes/verify?code=${encodeURIComponent(code)}`),
  checkIn: (passId: string) => api.post<GuestVisit>(`/guard/guest-passes/${passId}/check-in`, {}),

  // خودرو
  lookupPlate: (plate: string) => api.get<{ found: boolean; vehicle: Vehicle | null }>(`/guard/vehicles/lookup?plate=${encodeURIComponent(plate)}`),
  addVehicle: (b: { unitId: string; plate: string; ownerName?: string }) => api.post<Vehicle>('/guard/vehicles', b),
  logsToday: () => api.get<VehicleLog[]>('/guard/vehicle-logs'),
  logVehicle: (b: { plate: string; direction: 'in' | 'out'; unitId?: string; note?: string }) => api.post<VehicleLog>('/guard/vehicle-logs', b),
}
