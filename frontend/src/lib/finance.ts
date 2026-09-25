import type { ChargeRec, DemoState, InvoiceRec } from './store'

/**
 * موجودی افتتاحیه‌ی صندوق — موجودی فعلی = افتتاحیه + شارژهای وصول‌شده − فاکتورهای پرداخت‌شده.
 * (با داده‌ی نمونه، موجودی دقیقاً همان ۱۸۴٫۵ میلیون داشبورد قبلی می‌شود.)
 */
export const OPENING_BALANCE = 199_250_000

export function fundBalance(s: Pick<DemoState, 'charges' | 'invoices'>) {
  const income = s.charges.filter((c) => c.status === 'paid').reduce((a, c) => a + c.total, 0)
  const expense = s.invoices.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount, 0)
  return OPENING_BALANCE + income - expense
}

export interface LedgerEntry {
  id: string
  desc: string
  type: 'income' | 'expense'
  amount: number
  date?: string
  method: string
  invoiceId?: string
}

export function ledger(s: Pick<DemoState, 'charges' | 'invoices'>): LedgerEntry[] {
  const inc: LedgerEntry[] = s.charges
    .filter((c) => c.status === 'paid')
    .map((c) => ({ id: `c-${c.id}`, desc: `واریز شارژ ${c.unit} — ${c.period}`, type: 'income', amount: c.total, date: c.paidAt, method: c.payMethod ?? '—' }))
  const exp: LedgerEntry[] = s.invoices
    .filter((i) => i.status === 'paid')
    .map((i) => ({ id: `i-${i.id}`, desc: `${i.description} (${i.vendor})`, type: 'expense', amount: i.amount, date: i.paidAt ?? i.issuedAt, method: i.method, invoiceId: i.id }))
  return [...inc, ...exp].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

export function chargeStats(charges: ChargeRec[]) {
  const total = charges.reduce((a, c) => a + c.total, 0)
  const paid = charges.filter((c) => c.status === 'paid').reduce((a, c) => a + c.total, 0)
  const overdue = charges.filter((c) => c.status === 'overdue')
  const pending = charges.filter((c) => c.status === 'pending')
  return {
    total,
    paid,
    outstanding: total - paid,
    overdueTotal: overdue.reduce((a, c) => a + c.total, 0),
    overdueCount: overdue.length,
    pendingCount: pending.length,
    rate: total ? Math.round((paid / total) * 100) : 0,
  }
}

export function expenseByCategory(invoices: InvoiceRec[]) {
  const map = new Map<string, number>()
  invoices.forEach((i) => map.set(i.category, (map.get(i.category) ?? 0) + i.amount))
  return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount)
}

export const periods = (charges: ChargeRec[]) => [...new Set(charges.map((c) => c.period))]
