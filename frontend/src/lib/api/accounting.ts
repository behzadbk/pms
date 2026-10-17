import { api } from './client'

/**
 * پروفایل مالی واحد/کارمند — فقط‌خواندنی از منبع حسابداری (finance-svc: /accounting/*).
 * «همین» نرم‌افزار حسابداری نیست؛ این‌ها نمای همان داده‌ای است که از حسابداری مجموعه خوانده می‌شود.
 */
const A = '/finance/accounting'

export type EntryKind = 'charge' | 'variable' | 'penalty' | 'payment' | 'adjustment'
export interface LedgerRow { date: string | null; period: string | null; kind: EntryKind; title: string; debit: number; credit: number; ref?: string | null }
export interface SourceStatus { source: string; connected: boolean; label: string }
export interface AccountingStatus { units: SourceStatus; staff: SourceStatus; read_only: true }

export interface UnitRow { unit_id: string; unit_number: string; floor: number | null; area: number | null; balance: number; overdue_count: number; last_payment_at: string | null }
export interface UnitProfile {
  source: string
  unit: { unit_id: string; unit_number: string; floor: number | null; area: number | null }
  summary: { total_fixed: number; total_variable: number; total_penalty: number; total_paid: number; balance: number; overdue_count: number; last_payment_at: string | null }
  periods: { period: string; fixed: number; variable: number; penalty: number; total: number; paid: number; status: 'pending' | 'paid' | 'overdue'; due_date: string | null }[]
  entries: LedgerRow[]
}

export interface StaffRow { id: string; full_name: string; department: string | null; is_active: boolean }
export interface StaffFinanceProfile {
  source: string
  available: boolean
  staff: StaffRow
  summary: { total_net: number; total_paid: number; balance: number; total_bonus: number; total_penalty: number; last_payment_at: string | null }
  payslips: { period: string; base: number; overtime: number; bonus: number; deductions: number; net: number; paid: boolean }[]
  entries: LedgerRow[]
}

export const accountingApi = {
  status: () => api.get<AccountingStatus>(`${A}/status`),
  units: () => api.get<UnitRow[]>(`${A}/units`),
  unitProfile: (id: string) => api.get<UnitProfile>(`${A}/units/${id}/profile`),
  staff: () => api.get<StaffRow[]>(`${A}/staff`),
  staffProfile: (id: string) => api.get<StaffFinanceProfile>(`${A}/staff/${id}/profile`),
}
