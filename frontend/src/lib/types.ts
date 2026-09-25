export type Role = 'admin' | 'resident' | 'guard' | 'staff' | 'accountant' | 'super_admin'

export interface RoleInfo {
  id: Role
  label: string
  personaName: string
  personaSub: string
}

export type ChargeStatus = 'pending' | 'paid' | 'overdue'

export interface Charge {
  id: string
  unit: string
  period: string
  base: number
  lateFee: number
  total: number
  dueDate: string
  status: ChargeStatus
}

export type TicketStatus = 'open' | 'in_progress' | 'resolved'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface Ticket {
  id: string
  subject: string
  unit: string
  category: string
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
}

export interface Reservation {
  id: string
  amenity: string
  unit: string
  date: string
  time: string
  status: 'confirmed' | 'pending' | 'cancelled' | 'rejected'
}

export interface GuestPass {
  id: string
  guestName: string
  code: string
  validUntil: string
  usesLeft: number
  status: 'active' | 'used' | 'expired'
}

export interface Parcel {
  id: string
  unit: string
  courier: string
  receivedAt: string
  status: 'pending_pickup' | 'picked_up'
}

export interface WorkOrder {
  id: string
  title: string
  asset: string
  priority: TicketPriority
  status: TicketStatus | 'assigned' | 'done'
  dueDate: string
}

/* ---------- ۷.۱ قوانین رزرو هوشمند مشاعات ---------- */

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

export interface AmenitySession {
  id: string
  amenityId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  sessionType: SessionType
  maxOccupancy: number
}

/* ---------- ۷.۲ تقویم بصری زنده ---------- */

export type SlotStatus = 'available' | 'pending_approval' | 'confirmed' | 'maintenance' | 'past'

export interface CalendarSlot {
  id: string
  amenityId: string
  startHour: number
  status: SlotStatus
  unitLabel?: string
  sessionType?: SessionType
}

/* ---------- ۷.۳ نگهبانی و شفافیت مالی ---------- */

export interface GuardLogEntry {
  id: string
  type: 'guest_entry' | 'parcel' | 'vehicle_in' | 'vehicle_out'
  summary: string
  time: string
}

export interface ExpenseCategoryShare {
  category: string
  amount: number
  colorVar: string
}

export interface PlatformTenant {
  id: string
  name: string
  subdomain: string
  plan: string
  status: 'active' | 'trial' | 'suspended' | 'cancelled'
  unitCount: number
  unitLimit: number
  mrr: number
  joinedAt: string
}

export interface PlatformPlan {
  id: string
  name: string
  monthlyPrice: number
  maxUnits: number
  modules: string[]
  tenantCount: number
}

export interface PlatformInvoice {
  id: string
  tenantName: string
  period: string
  amount: number
  status: 'paid' | 'pending' | 'failed'
  date: string
}

/* ---------- ۹.۱ سفارش غذای مشاعات (FnB) ---------- */
/* مطابق docs/UPDATE-V2-AUDIT-FNB-DESIGN.md بخش ۲.۲ و ۳.۲/۳.۳ */

export type OrderStatus =
  | 'draft'
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'rejected'
  | 'cancelled'

export type ItemAvailability = 'available' | 'sold_out' | 'hidden'
export type DeliveryType = 'in_unit' | 'amenity_zone'
export type VenueBilling = 'wallet' | 'monthly_charge'

export interface FnbVenue {
  id: string
  name: string
  icon: string
  isOpen: boolean
  prepTimeMinutes: number
  billing: VenueBilling
  categories: string[]
}

export interface MenuItem {
  id: string
  venueId: string
  category: string
  name: string
  price: number
  icon: string
  color: string
  availability: ItemAvailability
}

export interface DeliveryZone {
  id: string
  name: string
}

export interface CartRow {
  item: MenuItem
  quantity: number
}

export interface OrderItemLine {
  itemId: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface FnbOrder {
  id: string
  orderNumber: string
  venueId: string
  venueName: string
  deliveryType: DeliveryType
  destinationLabel: string
  deliveryNote?: string
  status: OrderStatus
  billing: VenueBilling
  items: OrderItemLine[]
  subtotal: number
  total: number
  placedAt: string
  prepTimeMinutes: number
}

/* ---------- ۹.۲ Audit Logging / داشبورد لاگ ---------- */
/* مطابق docs/UPDATE-V2-AUDIT-FNB-DESIGN.md بخش ۲.۱ و ۳.۱ و ۴.۳ */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AuditDevice {
  os: string
  browser: string
  isPwa: boolean
}

export interface AuditLogEntry {
  id: string
  occurredAt: string
  sessionId: string
  traceId: string
  userId?: string
  actorRole?: string
  source: string
  level: LogLevel
  action: string
  httpMethod?: string
  httpPath?: string
  statusCode?: number
  durationMs?: number
  device?: AuditDevice
}

export interface AuditVolumePoint {
  label: string
  count: number
  errorCount: number
}
