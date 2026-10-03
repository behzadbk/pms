import { api } from './client'
import type { Amenity as ServerAmenity } from './residents'
import type { Amenity, BookingRule } from '../types'

const F = '/facility'
type ServerRow = ServerAmenity & { type?: string }

const body = (a: Amenity) => ({ name: a.name.trim(), type: a.type, capacity: a.capacity > 0 ? a.capacity : null, requiresApproval: a.requiresApproval })

/** مشاعات واقعی ساختمان (همان چیزی که ساکن رزرو می‌کند) */
export const listAmenities = () => api.get<ServerRow[]>(`${F}/amenities`)
export const createAmenity = (a: Amenity) => api.post<ServerRow>(`${F}/amenities`, body(a))
export const updateAmenity = (a: Amenity) => api.patch<ServerRow>(`${F}/amenities/${a.id}`, body(a))
export const deleteAmenity = (id: string) => api.delete<{ ok: boolean }>(`${F}/amenities/${id}`)
export const saveBookingRule = (id: string, r: BookingRule) =>
  api.put<unknown>(`${F}/amenities/${id}/booking-rules`, {
    maxBookingsPerUnitPerPeriod: r.maxBookingsPerUnitPerPeriod,
    periodType: r.periodType,
    minAdvanceHours: r.minAdvanceHours,
    maxAdvanceDays: r.maxAdvanceDays,
    depositAmount: r.depositAmount,
  })

const TYPES: Amenity['type'][] = ['pool', 'hall', 'roof_garden', 'gym']
/** ردیف سرور → مدل ویرایشگر (رنگ تقویم محلی است) */
export const toLocal = (r: ServerRow, color: string): Amenity => ({
  id: r.id,
  name: r.name,
  type: TYPES.includes(r.type as Amenity['type']) ? (r.type as Amenity['type']) : 'hall',
  capacity: r.capacity ?? 0,
  requiresApproval: !!(r.requires_approval ?? r.needs_approval),
  color,
})
