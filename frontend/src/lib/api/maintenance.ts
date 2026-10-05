import { api } from './client'

/** تیکت‌ها + CMMS (تجهیزات، دستور کار، سرویس دوره‌ای) — facility-service (پشت /api/facility) */
const F = '/facility'

export type TicketKind = 'fault' | 'criticism' | 'suggestion' | 'direct'
export type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type AssetCategory = 'elevator' | 'lighting' | 'plumbing' | 'hvac' | 'fire' | 'electrical' | 'door' | 'other'
export type ServiceType = 'repair' | 'replace' | 'service' | 'inspection'
export type WoStatus = 'open' | 'in_progress' | 'done' | 'cancelled'

export const KIND_LABEL: Record<TicketKind, string> = {
  fault: 'گزارش خرابی',
  criticism: 'انتقاد',
  suggestion: 'پیشنهاد',
  direct: 'پیام به مدیر',
}
export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'باز',
  assigned: 'ارجاع‌شده',
  in_progress: 'در حال انجام',
  resolved: 'حل‌شده',
  closed: 'بسته',
}
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'کم', normal: 'عادی', high: 'مهم', urgent: 'فوری' }
export const SERVICE_LABEL: Record<ServiceType, string> = { repair: 'تعمیر', replace: 'تعویض', service: 'سرویس دوره‌ای', inspection: 'بازدید' }
export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  elevator: 'آسانسور',
  lighting: 'روشنایی',
  plumbing: 'لوله‌کشی و آب',
  hvac: 'موتورخانه و تهویه',
  fire: 'اطفا حریق',
  electrical: 'برق',
  door: 'درب و ورودی',
  other: 'سایر',
}

export interface Ticket {
  id: string
  no: number
  kind: TicketKind
  category: string
  asset_category: AssetCategory | null
  subject: string
  body: string
  priority: Priority
  status: TicketStatus
  location: string | null
  unit_id: string | null
  unit: string | null
  reporter_name: string | null
  asset_id: string | null
  asset_name: string | null
  assignee_login?: string | null
  assignee_name: string | null
  sla_due_at: string | null
  sla_breached: boolean
  first_response_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  last_event: string | null
  event_count: number
  last_service: { type: ServiceType; performed_on: string } | null
}

export interface TicketEvent {
  id: string
  type: string
  text: string
  actor_name: string | null
  actor_role: string | null
  internal: boolean
  created_at: string
}

export interface AssetLite { id: string; name: string; category: AssetCategory; location: string | null }
export interface ServiceRecord {
  id: string
  type: ServiceType
  description: string
  performer: string
  cost: number
  performed_on: string
  ticket_id?: string | null
}

export interface TicketDetail extends Ticket {
  events: TicketEvent[]
  match?: {
    category: AssetCategory | null
    category_label: string | null
    asset: AssetLite | null
    candidates: AssetLite[]
    history: ServiceRecord[]
    related: { id: string; subject: string; status: TicketStatus; created_at: string }[]
    overdue: boolean
    service_interval_days: number | null
  }
  work_order?: { id: string; status: WoStatus; due_date: string | null; assignee_name: string | null } | null
}

export interface TicketContext {
  unit: { id: string; number: string; floor: number | null; building: string | null } | null
  role: string
}

export interface TeamMember { id: string; name: string; username: string | null; department: string | null; open_orders: number }

export interface Asset {
  id: string
  name: string
  category: AssetCategory
  location: string | null
  service_interval_days: number | null
  notes: string | null
  is_active: boolean
  last_service: { type: ServiceType; performed_on: string; description: string } | null
  open_tickets: number
  next_due: string | null
}

export interface Schedule {
  id: string
  asset_id: string
  asset_name: string
  asset_category: AssetCategory
  asset_location: string | null
  title: string
  interval_days: number
  lead_days: number
  last_done: string | null
  next_due: string
  assignee_login: string | null
  assignee_name: string | null
  priority: Priority
  days_left: number
  work_order: { id: string; status: WoStatus } | null
}

export interface WorkOrder {
  id: string
  title: string
  description: string | null
  priority: Priority
  status: WoStatus
  due_date: string | null
  completed_at: string | null
  result_note: string | null
  created_at: string
  assignee_login: string | null
  assignee_name: string | null
  asset_id: string | null
  asset_name: string | null
  asset_location: string | null
  ticket_id: string | null
  ticket_subject: string | null
  ticket_location: string | null
  ticket_unit: string | null
  reporter_name: string | null
  schedule_id: string | null
  overdue: boolean
}

export interface NewTicket {
  kind: TicketKind
  subject: string
  body?: string
  priority?: Priority
  location?: string
  unit_id?: string
}

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const maintenanceApi = {
  context: () => api.get<TicketContext>(`${F}/tickets/context`),
  tickets: (f: { status?: string; kind?: string } = {}) => api.get<Ticket[]>(`${F}/tickets${qs(f)}`),
  ticket: (id: string) => api.get<TicketDetail>(`${F}/tickets/${id}`),
  createTicket: (b: NewTicket) => api.post<{ id: string; no: number }>(`${F}/tickets`, b),
  patchTicket: (id: string, b: { priority?: Priority; asset_id?: string | null }) => api.patch(`${F}/tickets/${id}`, b),
  setStatus: (id: string, status: TicketStatus, note?: string) => api.post(`${F}/tickets/${id}/status`, { status, note }),
  comment: (id: string, text: string, internal = false) => api.post(`${F}/tickets/${id}/comments`, { text, internal }),
  assign: (id: string, assignee_login: string | null, due_date?: string, note?: string) =>
    api.post(`${F}/tickets/${id}/assign`, { assignee_login, due_date, note }),
  ticketService: (
    id: string,
    b: { type: ServiceType; description: string; performer?: string; cost?: number; performed_on?: string; asset_id?: string; asset_name?: string; asset_location?: string; resolve?: boolean },
  ) => api.post(`${F}/tickets/${id}/service`, b),

  team: () => api.get<TeamMember[]>(`${F}/maintenance/team`),
  assets: () => api.get<{ categories: { id: AssetCategory; label: string }[]; assets: Asset[] }>(`${F}/assets`),
  createAsset: (b: { name: string; category: AssetCategory; location?: string; service_interval_days?: number }) => api.post<{ id: string }>(`${F}/assets`, b),
  deleteAsset: (id: string) => api.delete(`${F}/assets/${id}`),

  schedules: () => api.get<Schedule[]>(`${F}/maintenance/schedules`),
  createSchedule: (b: { asset_id: string; title: string; interval_days: number; next_due?: string; lead_days?: number; assignee_login?: string | null; priority?: Priority }) =>
    api.post(`${F}/maintenance/schedules`, b),
  deleteSchedule: (id: string) => api.delete(`${F}/maintenance/schedules/${id}`),
  runSchedules: () => api.post<{ created: number }>(`${F}/maintenance/schedules/run`),

  workOrders: (status: 'active' | 'done' | 'all' = 'active') => api.get<WorkOrder[]>(`${F}/work-orders?status=${status}`),
  createWorkOrder: (b: { title: string; description?: string; asset_id?: string; priority?: Priority; assignee_login?: string | null; due_date?: string }) =>
    api.post(`${F}/work-orders`, b),
  workOrderStatus: (id: string, status: WoStatus, b: { note?: string; cost?: number; performer?: string } = {}) =>
    api.post(`${F}/work-orders/${id}/status`, { status, ...b }),
}
