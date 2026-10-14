/** کاتالوگ خدمات و درخواست خدمات — facility-svc: /service-types , /service-requests */
import { api } from './client'

const F = '/facility'

export interface ServiceType {
  id: string
  title: string
  icon: string | null
  description: string | null
  department_code: string
  department_name: string | null
  manager_name: string | null
  is_active: boolean
}
export interface ServiceTypeInput {
  title: string
  icon?: string
  description?: string
  department_code: string
  is_active?: boolean
}

export type RequestStatus = 'submitted' | 'scheduled' | 'assigned' | 'in_progress' | 'done' | 'rejected' | 'cancelled'
export interface ServiceRequest {
  id: string
  service_type_id: string | null
  service_title: string
  department_code: string
  department_name: string | null
  unit_id: string | null
  unit_no: string | null
  requester_person: string
  requester_name: string | null
  preferred_at: string
  scheduled_at: string | null
  note: string | null
  status: RequestStatus
  reject_reason: string | null
  assigned_to: string | null
  assigned_name: string | null
  completed_at: string | null
  created_at: string
}
export interface ManagedRequest extends ServiceRequest {
  /** کاربر فعلی مدیر این دپارتمان (یا مدیر ساختمان) است */
  can_manage: boolean
  /** کار به خود کاربر سپرده شده */
  is_mine: boolean
}
export interface TeamMember { id: string; full_name: string; open_count: number }

export const types = {
  list: (all = false) => api.get<ServiceType[]>(`${F}/service-types${all ? '?all=1' : ''}`),
  create: (i: ServiceTypeInput) => api.post<ServiceType>(`${F}/service-types`, i),
  update: (id: string, i: Partial<ServiceTypeInput>) => api.patch<ServiceType>(`${F}/service-types/${id}`, i),
  remove: (id: string) => api.delete<{ ok: true }>(`${F}/service-types/${id}`),
}

export const mine = {
  list: () => api.get<ServiceRequest[]>(`${F}/service-requests/mine`),
  create: (i: { service_type_id: string; preferred_at: string; note?: string }) => api.post<ServiceRequest>(`${F}/service-requests`, i),
  cancel: (id: string) => api.post<ServiceRequest>(`${F}/service-requests/${id}/cancel`, {}),
}

export const desk = {
  list: (status = 'open', department_code?: string) => {
    const q = new URLSearchParams({ status })
    if (department_code) q.set('department_code', department_code)
    return api.get<{ managed_departments: { code: string; name: string }[]; items: ManagedRequest[] }>(`${F}/service-requests?${q}`)
  },
  team: (department_code: string) => api.get<TeamMember[]>(`${F}/service-requests/team?department_code=${encodeURIComponent(department_code)}`),
  schedule: (id: string, i: { scheduled_at?: string; assigned_to?: string }) => api.post<ServiceRequest>(`${F}/service-requests/${id}/schedule`, i),
  assign: (id: string, assigned_to: string) => api.post<ServiceRequest>(`${F}/service-requests/${id}/assign`, { assigned_to }),
  reject: (id: string, reason: string) => api.post<ServiceRequest>(`${F}/service-requests/${id}/reject`, { reason }),
  start: (id: string) => api.post<ServiceRequest>(`${F}/service-requests/${id}/start`, {}),
  done: (id: string) => api.post<ServiceRequest>(`${F}/service-requests/${id}/done`, {}),
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: 'در انتظار تأیید',
  scheduled: 'زمان تأیید شد',
  assigned: 'به مجری سپرده شد',
  in_progress: 'در حال انجام',
  done: 'انجام شد',
  rejected: 'رد شد',
  cancelled: 'لغو شد',
}
