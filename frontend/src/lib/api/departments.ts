/** دپارتمان‌های ساختمان — identity-svc: /users/departments (فقط مدیر ساختمان) */
import { api } from './client'

export interface DepartmentMember { id: string; fullName: string; isActive: boolean }
export interface Department {
  id: string
  /** کد داخلی (برای سیستمی‌ها: lobby، kitchen …؛ برای سفارشی‌ها: d_xxxx) */
  code: string
  name: string
  icon: string | null
  isSystem: boolean
  isActive: boolean
  managerId: string | null
  managerName: string | null
  memberCount: number
  members: DepartmentMember[]
}

const P = '/identity/users/departments'
export const list = () => api.get<Department[]>(P)
export const create = (input: { name: string; icon?: string }) => api.post<Department>(P, input)
export const update = (id: string, input: { name?: string; icon?: string; isActive?: boolean; managerUserId?: string | null }) =>
  api.patch<Department>(`${P}/${id}`, input)
export const remove = (id: string) => api.delete<{ ok: true }>(`${P}/${id}`)
