import { api, ApiError, getToken } from './client'
import { formatJalali, JALALI_MONTHS, toJalali } from '../jalali'

/**
 * مالی ساختمان — finance-service (پشت /api/finance) + حساب حسابدار از identity-service.
 * تاریخ‌ها همیشه رشته‌ی 'YYYY-MM-DD' (میلادی) هستند و فقط برای نمایش به شمسی تبدیل می‌شوند؛
 * period شمسی 'YYYY-MM' است (مثلاً 1405-07 = مهر ۱۴۰۵).
 */
const F = '/finance'

export type ChargeStatus = 'pending' | 'paid' | 'overdue'
export type CalcType = 'fixed' | 'per_area' | 'per_person' | 'hybrid'
export type PayMethod = 'cash' | 'card_to_card' | 'bank_transfer' | 'cheque'

export interface FixedItem { title: string; amount: number }
export interface Formula {
  id: string
  name: string
  calc_type: CalcType
  base_amount: number
  amount_per_sqm: number
  per_resident_amount: number
  fixed_items: FixedItem[]
  round_to: number
  effective_from: string | null
  is_active: boolean
  charges_count?: number
}
export type FormulaInput = Omit<Formula, 'id' | 'charges_count'>

export interface FinanceSettings {
  due_day: number
  late_fee_enabled: boolean
  late_fee_mode: 'per_month' | 'per_day'
  late_fee_rate: number
  late_fee_grace_days: number
  late_fee_cap_percent: number | null
  opening_balance: number
}

/**
 * «شارژ متغیر» این شارژ: مازاد مصرف خدمات (آفرها) + سفارش‌های تحویل‌شده‌ی کافه/رستوران.
 * kind='fnb' ⇒ service = نام مجموعه، quantity = تعداد سفارش؛ بدون kind ⇒ مازاد خدمت.
 */
export interface OverageBreakdown {
  total: number
  items: { kind?: 'service' | 'fnb'; service: string; variant: string | null; period: string; quantity: number; unit_label: string; amount: number }[]
}

/** سفارش تحویل‌شده‌ی کافه/رستوران که مبلغش روی شارژ متغیر واحد می‌نشیند — صورتحساب ساکن */
export interface MyFnbBill {
  id: string
  order_number: string
  venue_name: string
  venue_kind: 'restaurant' | 'cafe'
  unit_number: string
  subtotal: number
  surcharge: number
  total: number
  delivered_at: string
  /** ماه تحویل ('1405-07') و ماهی که مبلغ در شارژش می‌نشیند */
  delivered_period: string
  charge_period: string
  /** true = قبلاً در یک شارژ صادرشده نشسته */
  billed: boolean
  charge_status: ChargeStatus | null
  items: { name: string; quantity: number; unit_price: number; line_total: number }[]
}

/** ریز شارژ متغیر به تفکیک واحد در یک ماه — مانیتورینگ مدیر (GET /reports/variable-charges) */
export interface VariableChargesReport {
  period: string
  totals: { fnb: number; services: number; total: number; pending: number; units: number }
  units: { unit_id: string; unit_number: string; fnb_orders: number; fnb_total: number; fnb_pending: number; service_total: number; service_pending: number; total: number; pending: number }[]
  orders: { unit_id: string; unit_number: string; id: string; order_number: string; venue_name: string; total: number; delivered_at: string; billed: boolean; exempt: boolean }[]
  services: { unit_id: string; unit_number: string; service: string; qty: number; amount: number; billed: boolean }[]
}

/** برچسب یک ردیف شارژ متغیر در ریز شارژ */
export function variableItemLabel(it: OverageBreakdown['items'][number]) {
  if (it.kind === 'fnb') return `${it.service} — ${it.quantity.toLocaleString('fa-IR')} سفارش`
  return `مازاد ${it.service}${it.variant && it.variant !== it.service ? ` (${it.variant})` : ''}`
}

export interface Charge {
  id: string
  unit_id: string
  unit_number: string
  floor: number | null
  period: string
  base_amount: number
  late_fee_amount: number
  total_amount: number
  due_date: string | null
  status: ChargeStatus
  paid_at: string | null
  pay_method: string | null
  late_fee_waived: boolean
  note: string | null
  payer_name: string | null
  breakdown: { base?: number; area?: number; residents?: number; fixed_items?: FixedItem[]; inputs?: { area: number; residents: number }; overage?: OverageBreakdown }
}

export interface PlanRow {
  unit_id: string
  unit_number: string
  floor: number | null
  area: number
  residents: number
  amount: number
  /** بخشی از amount که مازاد مصرف خدمات است */
  overage?: number
  existing: { id: string; status: ChargeStatus; total_amount: number } | null
}
export interface ChargePlan {
  period: string
  period_label: string
  due_date: string
  formula: { id: string; name: string; calc_type: CalcType }
  rows: PlanRow[]
  to_create: number
  already_issued: number
  total_new_amount: number
}
export interface IssueResult { period: string; period_label: string; due_date: string; generatedCount: number; skippedExisting: number; total_amount: number }

export interface InvoiceItem { title: string; qty: number; unit_price: number }
export interface Invoice {
  id: string
  number: string
  vendor: string
  category: string
  description: string
  items: InvoiceItem[]
  amount: number
  invoice_date: string
  status: 'pending' | 'paid'
  paid_on: string | null
  pay_method: string | null
  attachment_name: string | null
  has_attachment: boolean
  registered_by_name: string | null
}
export interface InvoiceInput {
  number?: string
  vendor: string
  category: string
  description: string
  items: InvoiceItem[]
  invoice_date: string
  status: 'pending' | 'paid'
  pay_method?: string
  attachment?: { name: string; mime: string; base64: string }
}

export interface LedgerEntry {
  id: string
  type: 'income' | 'expense'
  amount: number
  date: string
  method: string | null
  reference: string | null
  unit_number: string | null
  period: string | null
  vendor: string | null
  description: string | null
  invoice_id: string | null
}

export interface Summary {
  current_period: string
  opening_balance: number
  income_total: number
  expense_total: number
  fund_balance: number
  month_income: number
  month_expense: number
  collection: { period: string; count: number; total: number; paid: number; rate: number; pending_count: number; overdue_count: number; overdue_total: number; outstanding: number }
  overdue: { count: number; total: number; units: { id: string; period: string; total_amount: number; late_fee_amount: number; due_date: string; unit_number: string }[] }
  unpaid_invoices: { count: number; total: number }
  monthly: { period: string; income: number; expense: number }[]
  expense_by_category: { category: string; amount: number }[]
  recent_payments: { id: string; amount: number; method: string | null; paid_at: string | null; period: string; unit_number: string }[]
}

export interface MyCharge extends Omit<Charge, 'floor' | 'payer_name' | 'late_fee_waived' | 'note'> { formula_name: string | null }
export interface Receipt { id: string; amount: number; method: string | null; reference: string | null; paid_at: string | null; period: string; unit_number: string }
export interface Transparency {
  current: MonthExpenses
  previous: MonthExpenses
}
export interface MonthExpenses {
  period: string
  total: number
  by_category: { category: string; amount: number }[]
  invoices: { id: string; vendor: string; category: string; description: string; amount: number; paid_on: string }[]
}

export interface GatewayInfo { online: boolean; gateway: string | null; sandbox: boolean }

export interface ImportChargeRow { line: number; unit_number: string; period: string; amount: number; status: ChargeStatus; due_date?: string; paid_on?: string }
export interface ImportInvoiceRow { line: number; invoice_date: string; description: string; amount: number; vendor?: string; category?: string; status?: 'pending' | 'paid'; number?: string }
export interface ImportResult { created: number; updated?: number; skipped: number; errors: { line: number; message: string }[] }

const qs = (o: Record<string, string | number | undefined>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== '') as [string, string | number][]
  return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''
}

export const financeApi = {
  // فرمول و تنظیمات
  formulas: () => api.get<Formula[]>(`${F}/formulas`),
  createFormula: (b: FormulaInput) => api.post<Formula>(`${F}/formulas`, b),
  updateFormula: (id: string, b: FormulaInput) => api.put<Formula>(`${F}/formulas/${id}`, b),
  deleteFormula: (id: string) => api.delete<{ ok: true }>(`${F}/formulas/${id}`),
  settings: () => api.get<FinanceSettings>(`${F}/settings`),
  saveSettings: (b: Partial<FinanceSettings>) => api.put<FinanceSettings>(`${F}/settings`, b),

  // شارژ
  charges: (f: { period?: string; status?: ChargeStatus } = {}) => api.get<Charge[]>(`${F}/charges${qs(f)}`),
  periods: () => api.get<string[]>(`${F}/charges/periods`),
  preview: (b: { period: string; formulaId?: string; dueDate?: string }) => api.post<ChargePlan>(`${F}/charges/preview`, b),
  issue: (b: { period: string; formulaId?: string; dueDate?: string }) => api.post<IssueResult>(`${F}/charges/generate`, b),
  updateCharge: (id: string, b: { base_amount?: number; due_date?: string; waive_late_fee?: boolean; note?: string }) => api.patch<Charge>(`${F}/charges/${id}`, b),
  voidCharge: (id: string) => api.delete<{ ok: true }>(`${F}/charges/${id}`),
  manualPayment: (id: string, b: { method: PayMethod; reference?: string; note?: string }) => api.post<Charge>(`${F}/charges/${id}/payments/manual`, b),
  runOverdue: () => api.post<{ marked: number; feesUpdated: number; notified: number }>(`${F}/charges/run-overdue`),

  // فاکتور و صندوق
  categories: () => api.get<string[]>(`${F}/invoices/categories`),
  invoices: (f: { category?: string; status?: 'pending' | 'paid' } = {}) => api.get<Invoice[]>(`${F}/invoices${qs(f)}`),
  createInvoice: (b: InvoiceInput) => api.post<Invoice>(`${F}/invoices`, b),
  payInvoice: (id: string, b: { pay_method: string; paid_on?: string }) => api.post<Invoice>(`${F}/invoices/${id}/pay`, b),
  deleteInvoice: (id: string) => api.delete<{ ok: true }>(`${F}/invoices/${id}`),
  ledger: (limit = 100) => api.get<LedgerEntry[]>(`${F}/ledger${qs({ limit })}`),
  summary: (o: { months?: number; period?: string } = {}) => api.get<Summary>(`${F}/summary${qs(o)}`),

  // ورود از فایل حسابداری (حسابدار)
  importCharges: (rows: ImportChargeRow[]) => api.post<ImportResult>(`${F}/charges/import`, { rows }),
  importInvoices: (rows: ImportInvoiceRow[]) => api.post<ImportResult>(`${F}/invoices/import`, { rows }),

  // ساکن
  myCharges: () => api.get<MyCharge[]>(`${F}/me/charges`),
  myReceipts: () => api.get<Receipt[]>(`${F}/me/receipts`),
  myFnbBills: () => api.get<MyFnbBill[]>(`${F}/me/fnb-bills`),
  variableCharges: (period?: string) => api.get<VariableChargesReport>(`${F}/reports/variable-charges${qs({ period })}`),
  transparency: () => api.get<Transparency>(`${F}/resident/transparency`),
  gateway: () => api.get<GatewayInfo>(`${F}/payments/gateway`),
  initiatePayment: (chargeId: string) => api.post<{ redirectUrl: string }>(`${F}/payments/initiate`, { chargeId }),
}

/** باز کردن پیوست فاکتور (نیازمند توکن؛ در تب جدید) */
export async function openInvoiceAttachment(id: string) {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'
  const token = getToken()
  const res = await fetch(`${base}${F}/invoices/${id}/attachment`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new ApiError('پیوست پیدا نشد', res.status)
  const url = URL.createObjectURL(await res.blob())
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/* ───────────── نمایش ───────────── */

/** 'YYYY-MM-DD' → «۱۰ مهر ۱۴۰۵» (بدون new Date؛ بدون جابه‌جایی منطقه‌ی زمانی) */
export const dayFa = (d: string | null | undefined) => (d ? formatJalali(d) : '—')
/** instant (timestamptz) → تاریخ شمسی به وقت تهران */
export function instantFa(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  return formatJalali(d)
}
/** '1405-07' → «مهر ۱۴۰۵» */
export function periodFa(p: string | null | undefined) {
  if (!p) return ''
  const [y, m] = p.split('-').map(Number)
  return `${JALALI_MONTHS[m - 1] ?? ''} ${y.toLocaleString('fa-IR', { useGrouping: false })}`
}
export const periodShortFa = (p: string) => JALALI_MONTHS[Number(p.split('-')[1]) - 1] ?? p
export const tomanText = (n: number) => `${Math.round(n).toLocaleString('fa-IR')} تومان`

export const PAY_METHOD_FA: Record<string, string> = {
  cash: 'نقدی',
  card_to_card: 'کارت به کارت',
  bank_transfer: 'واریز بانکی',
  cheque: 'چک',
  online: 'درگاه آنلاین',
  import: 'ورود از فایل حسابداری',
}
export const methodFa = (m: string | null | undefined) => (m ? (PAY_METHOD_FA[m] ?? m) : '—')

export function chargeStats(charges: Pick<Charge, 'total_amount' | 'status'>[]) {
  const total = charges.reduce((a, c) => a + c.total_amount, 0)
  const paid = charges.filter((c) => c.status === 'paid').reduce((a, c) => a + c.total_amount, 0)
  const overdue = charges.filter((c) => c.status === 'overdue')
  return {
    total,
    paid,
    outstanding: total - paid,
    overdueTotal: overdue.reduce((a, c) => a + c.total_amount, 0),
    overdueCount: overdue.length,
    pendingCount: charges.filter((c) => c.status === 'pending').length,
    rate: total ? Math.round((paid / total) * 100) : 0,
  }
}

/** پیش‌فرض سال/ماه شمسی «امروز» به شکل 'YYYY-MM' برای فرم صدور */
export function currentPeriod(): string {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const [y, m, dd] = d.split('-').map(Number)
  const j = toJalali(y, m, dd)
  return `${j.jy}-${String(j.jm).padStart(2, '0')}`
}
