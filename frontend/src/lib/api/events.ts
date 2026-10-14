/** رویدادهای ساکنین (مافیا، فیلم، فوتبال …) — facility-svc: /events */
import { api } from './client'

const F = '/facility'

export type EventKind = 'game' | 'screening' | 'sport' | 'other'
export const KIND_LABEL: Record<EventKind, string> = { game: 'بازی', screening: 'نمایش فیلم', sport: 'ورزش', other: 'دیگر' }
export type MyStatus = 'invited' | 'going' | 'declined' | 'none' | null

export interface Participant { person_id: string; name: string | null; unit_no: string | null }
export interface CommunityEvent {
  id: string
  title: string
  kind: EventKind
  description: string | null
  place: string | null
  amenity_id: string | null
  amenity_name: string | null
  starts_at: string
  needed_players: number | null
  audience: 'all' | 'selected'
  status: 'open' | 'cancelled'
  created_by_person: string
  host_name: string | null
  host_unit: string | null
  going_count: number
  pending_count: number
  declined_count: number
  my_status: MyStatus
  /** ظرفیت باقی‌مانده (null = نامحدود) */
  spots_left?: number | null
  is_host?: boolean
  going: Participant[]
  /** فقط برای میزبان/مدیر */
  pending?: Participant[]
}
export interface EventInput {
  title: string
  kind: EventKind
  description?: string
  place?: string
  amenity_id?: string
  starts_at: string
  needed_players?: number
  audience: 'all' | 'selected'
  invite_person_ids?: string[]
  invite_unit_ids?: string[]
}
export interface PersonHit { person_id: string; name: string; units: string[] }
export interface UnitHit { unit_id: string; unit_number: string; names: string[] }

export const list = () => api.get<CommunityEvent[]>(`${F}/events`)
export const people = (q: string) => api.get<{ people: PersonHit[]; units: UnitHit[] }>(`${F}/events/people?q=${encodeURIComponent(q)}`)
export const create = (i: EventInput) => api.post<{ id: string; invited: number }>(`${F}/events`, i)
export const rsvp = (id: string, status: 'going' | 'declined') => api.put<{ id: string; status: string; full: boolean }>(`${F}/events/${id}/rsvp`, { status })
export const update = (id: string, i: Partial<Pick<EventInput, 'title' | 'description' | 'place' | 'starts_at' | 'needed_players'>>) =>
  api.patch<{ id: string }>(`${F}/events/${id}`, i)
export const cancel = (id: string) => api.delete<{ id: string; status: string }>(`${F}/events/${id}`)
