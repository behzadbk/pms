import { fa, toman } from './api/residents'
import type { ServiceLine, UnitKind } from './api/entitlements'

/** «۲٫۵» — اعشار فارسی؛ عدد صحیح بدون ممیز */
export const qty = (n: number) => fa(Number.isInteger(n) ? n : Number(n.toFixed(2)))
export const money = (n: number) => `${toman(n)} تومان`
export const qtyUnit = (n: number, label: string) => `${qty(n)} ${label}`

export const KIND_LABEL: Record<UnitKind, string> = { count: 'بار', minutes: 'دقیقه', hours: 'ساعت', people: 'نفر', days: 'روز' }

/** قیمت یک نرخ: «۴۰۰٬۰۰۰ تومان / هر نفر» یا «هر ۳۰ دقیقه» */
export function priceText(t: { unit_price: number; step: number }, unitLabel: string) {
  if (t.unit_price <= 0) return 'رایگان'
  const per = t.step > 1 ? `هر ${qty(t.step)} ${unitLabel}` : `هر ${unitLabel}`
  return `${money(t.unit_price)} / ${per}`
}

/** درصد مصرف سهمیه برای نوار پیشرفت (۰ تا ۱۰۰) */
export function usedPct(s: Pick<ServiceLine, 'included' | 'used'>) {
  if (!s.included) return s.used > 0 ? 100 : 0
  return Math.min(100, Math.round((s.used / s.included) * 100))
}
