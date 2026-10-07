import { api } from './client'

/** رزرو و مدیریت مشاعات — facility-service (پشت /api/facility) */
const F = '/facility'

export type ReservationStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled'

export type Gender = 'women' | 'men'
export type GenderSplit =
  | { mode: 'parity'; even: Gender; odd: Gender }
  | { mode: 'weekday'; days: Record<string, Gender | null> }
  | { mode: 'hours'; ranges: { from: number; to: number; gender: Gender }[] }
export const GENDER_LABEL: Record<Gender, string> = { women: 'بانوان', men: 'آقایان' }

export interface WeekDay { weekday: number; hours: number[] }
export interface ManagedAmenity {
  id: string
  name: string
  icon: string | null
  description: string | null
  rule_text: string | null
  capacity: number | null
  requires_approval: boolean
  max_hours: number
  max_advance_days: number
  is_active: boolean
  private_enabled: boolean
  private_rules: string | null
  gender_split: GenderSplit | null
  pending_count: number
  upcoming_count: number
  has_schedule: boolean
  schedule: WeekDay[]
}
export interface Closure { id: string; amenity_id: string | null; date_from: string; date_to: string; reason: string | null }
export interface ManageData { amenities: ManagedAmenity[]; closures: Closure[]; icons: string[] }

export interface AmenityInput {
  name: string
  icon?: string
  description?: string
  rule_text?: string
  capacity?: number | null
  requires_approval?: boolean
  max_hours?: number
  max_advance_days?: number
  is_active?: boolean
  private_enabled?: boolean
  private_rules?: string
  gender_split?: GenderSplit | null
}

export interface DeskReservation {
  id: string
  status: ReservationStatus
  start_at: string
  end_at: string
  reject_reason: string | null
  source: string
  created_at: string
  decided_at: string | null
  amenity_id: string
  amenity: string
  icon: string | null
  unit_no: string | null
  requester: string | null
}
export interface BoardReservation { id: string; amenity_id: string; status: 'pending' | 'confirmed'; start_at: string; end_at: string; source: string; unit_no: string | null; requester: string | null }
export interface BoardAmenity { id: string; name: string; icon: string | null; requires_approval: boolean; max_hours: number; closed: string | null; hours: number[]; reservations: BoardReservation[] }
export interface Board { date: string; amenities: BoardAmenity[] }

const qs = (o: Record<string, string | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v) as [string, string][]
  return p.length ? '?' + new URLSearchParams(p).toString() : ''
}

export const amenitiesApi = {
  manage: () => api.get<ManageData>(`${F}/amenities/manage`),
  create: (b: AmenityInput) => api.post<ManagedAmenity>(`${F}/amenities`, b),
  update: (id: string, b: Partial<AmenityInput>) => api.patch<ManagedAmenity>(`${F}/amenities/${id}`, b),
  remove: (id: string) => api.delete<{ ok: boolean; archived: boolean }>(`${F}/amenities/${id}`),
  setSchedule: (id: string, days: WeekDay[]) => api.put<{ schedule: WeekDay[] }>(`${F}/amenities/${id}/schedule`, { days }),
  addClosure: (b: { date_from: string; date_to: string; reason?: string; amenity_id?: string }) => api.post<Closure>(`${F}/amenities/closures`, b),
  removeClosure: (id: string) => api.delete<{ ok: boolean }>(`${F}/amenities/closures/${id}`),

  queue: (f: { status?: string; amenity_id?: string; from?: string; to?: string } = {}) =>
    api.get<DeskReservation[]>(`${F}/reservations${qs({ status: f.status ?? 'pending', amenity_id: f.amenity_id, from: f.from, to: f.to })}`),
  board: (date: string) => api.get<Board>(`${F}/reservations/board${qs({ date })}`),
  units: (q?: string) => api.get<{ id: string; no: string }[]>(`${F}/reservations/units${qs({ q })}`),
  decide: (id: string, approve: boolean, reason?: string) =>
    api.post<{ status: string }>(`${F}/reservations/${id}/${approve ? 'approve' : 'reject'}`, approve ? {} : { reason }),
  cancel: (id: string, reason?: string) => api.post<{ status: string }>(`${F}/reservations/${id}/cancel`, { reason }),
  cancelMine: (id: string) => api.post<{ status: string }>(`${F}/me/reservations/${id}/cancel`, {}),
  bookManual: (b: { amenity_id: string; start: string; hours?: number; unit_id: string }) =>
    api.post<{ id: string; status: string }>(`${F}/reservations`, b),
}
