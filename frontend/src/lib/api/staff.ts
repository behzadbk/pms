/**
 * مدیریت کارکنان توسط مدیر ساختمان — identity-svc: /users/staff
 * هر کارمند یک حساب واقعی (نام کاربری/رمز) می‌گیرد و با آن وارد پنل مخصوص خودش می‌شود.
 */
import { api } from './client'
import type { StaffDepartment, StaffPermission } from '../staff'

export interface StaffProfile {
  birthDate?: string
  address?: string
  emergencyName?: string
  emergencyPhone?: string
  hireDate?: string
  shift?: 'morning' | 'evening' | 'night' | 'rotating'
  notes?: string
}

export interface StaffMember {
  id: string
  fullName: string
  username: string | null
  email: string | null
  phone: string | null
  nationalId: string | null
  department: StaffDepartment | null
  /** دسترسی‌های دستیِ اضافه بر پیش‌فرض بخش */
  permissions: StaffPermission[]
  effectivePermissions: StaffPermission[]
  profile: StaffProfile
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface StaffInput {
  fullName: string
  username: string
  password?: string
  department: StaffDepartment
  permissions: StaffPermission[]
  phone?: string | null
  nationalId?: string | null
  email?: string | null
  profile: StaffProfile
  isActive: boolean
}

export const list = () => api.get<StaffMember[]>('/identity/users/staff')
export const create = (input: StaffInput) => api.post<StaffMember>('/identity/users/staff', input)
export const update = (id: string, input: Partial<StaffInput>) => api.patch<StaffMember>(`/identity/users/staff/${id}`, input)
export const remove = (id: string) => api.delete<{ ok: true }>(`/identity/users/staff/${id}`)

/* ───────────── حسابداران (identity-svc: /users/accountants) ───────────── */
export interface Accountant {
  id: string
  fullName: string
  username: string | null
  email: string | null
  phone: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}
export interface AccountantInput {
  fullName: string
  username: string
  password?: string
  phone?: string | null
  email?: string | null
  isActive?: boolean
}
export const accountants = {
  list: () => api.get<Accountant[]>('/identity/users/accountants'),
  create: (b: AccountantInput & { password: string }) => api.post<Accountant>('/identity/users/accountants', b),
  update: (id: string, b: Partial<AccountantInput>) => api.patch<Accountant>(`/identity/users/accountants/${id}`, b),
  remove: (id: string) => api.delete<{ ok: true }>(`/identity/users/accountants/${id}`),
}
