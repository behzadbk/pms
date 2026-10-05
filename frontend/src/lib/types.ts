export type Role = 'admin' | 'resident' | 'guard' | 'staff' | 'accountant' | 'super_admin' | 'child'

export type SessionType = 'general' | 'male_only' | 'female_only' | 'family'
export type DepositRefundPolicy = 'full_if_cancelled_in_window' | 'partial_50' | 'non_refundable'

export interface Amenity {
  id: string
  name: string
  type: 'pool' | 'hall' | 'roof_garden' | 'gym'
  capacity: number
  requiresApproval: boolean
  color: string
}

export interface BookingRule {
  amenityId: string
  maxBookingsPerUnitPerPeriod: number
  periodType: 'day' | 'week' | 'month'
  minAdvanceHours: number
  maxAdvanceDays: number
  minSlotMinutes: number
  maxSlotMinutes: number
  cancellationWindowHours: number
  depositAmount: number
  depositRefundPolicy: DepositRefundPolicy
}
