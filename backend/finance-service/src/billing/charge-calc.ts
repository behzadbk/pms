import { diffDays } from '../common/jalali'

/**
 * محاسبات خالص مالی (بدون دیتابیس) — برای تست‌پذیری جدا نگه داشته شده‌اند.
 * همه‌ی مبالغ تومان و عدد صحیح هستند؛ تاریخ‌ها رشته‌ی 'YYYY-MM-DD'.
 */

export interface FixedItem { title: string; amount: number }

export interface Formula {
  id: string
  name: string
  calc_type: 'fixed' | 'per_area' | 'per_person' | 'hybrid'
  base_amount: number
  amount_per_sqm: number
  per_resident_amount: number
  fixed_items: FixedItem[]
  round_to: number
  effective_from: string | null
  is_active: boolean
  created_at?: string
}

export interface UnitFacts { area: number; residents: number }

export interface ChargeBreakdown {
  base: number
  area: number
  residents: number
  fixed_items: FixedItem[]
  raw_total: number
  round_to: number
  total: number
  inputs: { area: number; residents: number }
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** مبلغ شارژ یک واحد = پایه + (متراژ × نرخ متر) + (نفرات × نرخ نفر) + مجموع اقلام ثابت؛ سپس گرد به round_to */
export function calcCharge(f: Pick<Formula, 'base_amount' | 'amount_per_sqm' | 'per_resident_amount' | 'fixed_items' | 'round_to'>, u: UnitFacts): ChargeBreakdown {
  const base = n(f.base_amount)
  const area = n(f.amount_per_sqm) * Math.max(0, n(u.area))
  const residents = n(f.per_resident_amount) * Math.max(0, Math.floor(n(u.residents)))
  const items = (f.fixed_items ?? []).map((i) => ({ title: String(i.title), amount: n(i.amount) }))
  const fixed = items.reduce((a, i) => a + i.amount, 0)
  const raw = base + area + residents + fixed
  const step = Math.max(1, n(f.round_to) || 1)
  const total = Math.max(0, Math.round(raw / step) * step)
  return { base, area: Math.round(area), residents: Math.round(residents), fixed_items: items, raw_total: Math.round(raw), round_to: step, total, inputs: { area: n(u.area), residents: Math.floor(n(u.residents)) } }
}

/** فرمولِ مؤثر برای یک دوره: فعال‌ها با effective_from ≤ دوره؛ جدیدترین effective_from (و سپس جدیدترین ساخت) */
export function resolveFormula<T extends Pick<Formula, 'is_active' | 'effective_from' | 'created_at'>>(formulas: T[], period: string): T | null {
  const ok = formulas.filter((f) => f.is_active && (!f.effective_from || f.effective_from <= period))
  ok.sort((a, b) => (b.effective_from ?? '').localeCompare(a.effective_from ?? '') || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
  return ok[0] ?? null
}

export interface LateFeeRule {
  enabled: boolean
  mode: 'per_month' | 'per_day'
  ratePercent: number
  graceDays: number
  capPercent: number | null
}

/** روزهای دیرکرد مشمول جریمه = (امروز − سررسید) − مهلت؛ کمتر از صفر ⇒ ۰ */
export function lateDays(dueDate: string, today: string, graceDays: number): number {
  return Math.max(0, diffDays(dueDate, today) - Math.max(0, graceDays))
}

/**
 * جریمه‌ی دیرکرد «تجمعی تا امروز» — تابعی از (مبلغ پایه، امروز) است نه افزایشی؛
 * بنابراین اجرای چندباره‌ی job در یک روز هرگز جریمه را دوباره اضافه نمی‌کند.
 *  - per_day  : مبلغ پایه × نرخ٪ × روزهای دیرکرد
 *  - per_month: مبلغ پایه × نرخ٪ × ⌈روزهای دیرکرد ÷ ۳۰⌉ (هر ماه شروع‌شده یک نرخ)
 * سقف اختیاری: capPercent درصدِ مبلغ پایه.
 */
export function computeLateFee(baseAmount: number, dueDate: string, today: string, rule: LateFeeRule): number {
  if (!rule.enabled || !(rule.ratePercent > 0)) return 0
  const days = lateDays(dueDate, today, rule.graceDays)
  if (days <= 0) return 0
  const units = rule.mode === 'per_day' ? days : Math.ceil(days / 30)
  let fee = (n(baseAmount) * rule.ratePercent * units) / 100
  if (rule.capPercent != null && rule.capPercent >= 0) fee = Math.min(fee, (n(baseAmount) * rule.capPercent) / 100)
  return Math.round(fee)
}
