import { toJalali } from '../reservations/jalali'

/**
 * محاسبات خالص آفرها و سهمیه‌ی واحد (بدون دیتابیس) — برای تست‌پذیری جدا نگه داشته شده‌اند.
 * مبالغ تومان‌اند؛ مقدارها (ساعت/دقیقه/نفر/نوبت) تا دو رقم اعشار.
 */

export interface TierRow {
  id: string
  name: string
  min_area: number
  sort: number
}

export type TierMatch = 'exact' | 'floor' | 'below_min' | 'no_area' | 'no_tiers'

/**
 * سطح آفر یک واحد از روی متراژ: بزرگ‌ترین سطحی که min_area ≤ متراژ واحد است
 * (واحد ۲۵۰ متری ⇒ سطح ۲۴۵؛ واحد بزرگ‌تر از ۷۰۰ ⇒ سطح ۷۰۰).
 * متراژ کمتر از کوچک‌ترین سطح ⇒ همان کوچک‌ترین سطح، با match = 'below_min' تا UI هشدار بدهد.
 * متراژ ثبت‌نشده ⇒ سطحی تعیین نمی‌شود.
 */
export function resolveTier(tiers: TierRow[], area: number | null | undefined): { tier: TierRow | null; match: TierMatch } {
  if (!tiers.length) return { tier: null, match: 'no_tiers' }
  const a = Number(area)
  if (!Number.isFinite(a) || a <= 0) return { tier: null, match: 'no_area' }
  // مرتب‌سازی صعودی تا حلقه‌ی پایین «آخرین سطحِ برقرار» را بدهد: چون min_areaها صعودی‌اند،
  // آخرین سطحی که min_area ≤ متراژ است همان بزرگ‌ترین سطح قابل‌قبول (کفِ متراژ) است.
  const sorted = [...tiers].sort((x, y) => x.min_area - y.min_area)
  let hit: TierRow | null = null
  for (const t of sorted) if (t.min_area <= a) hit = t
  if (!hit) return { tier: sorted[0], match: 'below_min' }
  return { tier: hit, match: hit.min_area === a ? 'exact' : 'floor' }
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
// گرد کردن نویز اعشاری پیش از ceil: مثلاً 0.3 / 0.1 در جاوااسکریپت 2.9999999999999996 می‌شود
// و بدون این، ceil یک «step» اضافه (یا کم) حساب می‌کرد.
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

export interface AllocEvent {
  id: string
  occurred_at: string | Date
  quantity: number
  counts_toward_quota: boolean
  unit_price: number
  step: number
}

export interface Allocation {
  id: string
  quota_qty: number
  overage_qty: number
  amount: number
}

/** مبلغ مازاد: هر «step» شروع‌شده یک نرخ (بولینگ: هر ۳۰ دقیقه‌ی شروع‌شده) */
export function overageAmount(overageQty: number, unitPrice: number, step: number): number {
  if (!(overageQty > 0) || !(unitPrice > 0)) return 0
  const steps = Math.ceil(round6(overageQty / Math.max(step, 1e-9)))
  return Math.round(steps * unitPrice)
}

/**
 * سهم‌بندی رویدادهای یک (واحد، خدمت، دوره‌ی سهمیه) به‌ترتیب زمان:
 *  - رویدادی که از سهمیه کم می‌شود، اول از «باقی‌مانده‌ی رایگان» پوشش داده می‌شود و فقط بخش اضافه پولی است
 *  - رویدادی که counts_toward_quota=false دارد (مثل شستشوی موتور) همیشه کاملاً پولی است و سهمیه را مصرف نمی‌کند
 * ورودی هر رویداد نرخ و step لحظه‌ی ثبت را دارد؛ تابع deterministic است، پس هر بار می‌شود دوباره حسابش کرد.
 */
export function allocate(included: number, events: AllocEvent[]): Allocation[] {
  const sorted = [...events].sort((a, b) => {
    const t = new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    return t !== 0 ? t : a.id.localeCompare(b.id)
  })
  let used = 0
  const quota = Math.max(0, Number(included) || 0)
  return sorted.map((e) => {
    const q = Math.max(0, Number(e.quantity) || 0)
    if (!e.counts_toward_quota) {
      return { id: e.id, quota_qty: 0, overage_qty: round2(q), amount: overageAmount(q, e.unit_price, e.step) }
    }
    // «used» مصرف تجمعی سهمیه است و حتی بعد از تمام‌شدن سهمیه هم بالا می‌رود؛ پس رویدادهای بعدی
    // هرگز سهمیه‌ی رایگانِ برگشتی نمی‌گیرند و کل مقدارشان مازاد (پولی) می‌شود.
    // پوشش رایگان = min(باقی‌مانده، مقدار این رویداد)؛ فقط ابتدای بازه رایگان است، ادامه‌اش مازاد.
    const freeLeft = Math.max(0, quota - used)
    const covered = Math.min(freeLeft, q)
    const over = round2(q - covered)
    used = round2(used + q)
    return { id: e.id, quota_qty: round2(covered), overage_qty: over, amount: overageAmount(over, e.unit_price, e.step) }
  })
}

/** کلید پنجره‌ی سهمیه: ماهانه ⇒ همان دوره‌ی 'YYYY-MM'؛ سالانه ⇒ 'YYYY' */
export function quotaKey(periodType: 'month' | 'year', period: string): string {
  return periodType === 'year' ? period.slice(0, 4) : period
}

/** تاریخ تقویم میلادیِ «به وقت تهران» (UTC+03:30 بدون ساعت تابستانی) */
function tehranYmd(d: Date): { y: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value)
  return { y: g('year'), m: g('month'), d: g('day') }
}

/** دوره‌ی شمسی 'YYYY-MM' یک لحظه به وقت تهران */
export function tehranPeriod(d: Date = new Date()): string {
  const t = tehranYmd(d)
  const j = toJalali(t.y, t.m, t.d)
  return `${j.jy}-${String(j.jm).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' امروز (میلادی) به وقت تهران */
export function tehranIsoDate(d: Date = new Date()): string {
  const t = tehranYmd(d)
  return `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`
}

/** پایان روزِ یک تاریخ 'YYYY-MM-DD' به وقت تهران */
export function endOfTehranDay(iso: string): Date {
  return new Date(`${iso}T23:59:59+03:30`)
}

const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const faDigits = (s: string | number) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

/** «مهر ۱۴۰۵» */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${JALALI_MONTHS[m - 1] ?? ''} ${faDigits(y)}`
}
