import { api } from './client'
import type { Charge } from '../types'

/** ردیف finance.monthly_charges (همان منبعی که قانون «واحد بدهکار» می‌خواند) */
interface ChargeRow {
  id: string
  period: string
  base_amount: string | number
  late_fee_amount: string | number | null
  total_amount: string | number
  due_date: string | null
  status: 'pending' | 'paid' | 'overdue'
}

const faDate = (iso: string | null) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('fa-IR') : '—')
const faPeriod = (p: string) => {
  const m = p.match(/^(\d{4})-(\d{2})/)
  return m ? new Date(`${m[1]}-${m[2]}-15T12:00:00Z`).toLocaleDateString('fa-IR', { month: 'long', year: 'numeric' }) : p
}

/** شارژهای یک واحد از سرور، به شکل مورد استفاده‌ی صفحه‌ها */
export async function unitCharges(unitId: string): Promise<Charge[]> {
  const rows = await api.get<ChargeRow[]>(`/finance/units/${unitId}/charges`)
  return rows.map((r) => ({
    id: r.id,
    unit: '',
    period: faPeriod(r.period),
    base: Number(r.base_amount) || 0,
    lateFee: Number(r.late_fee_amount) || 0,
    total: Number(r.total_amount) || 0,
    dueDate: faDate(r.due_date),
    status: r.status,
  }))
}
