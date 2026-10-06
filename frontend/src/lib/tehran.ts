import { formatJalali } from './jalali'

/** ابزار تاریخ/ساعت به وقت تهران (UTC+03:30) — رزرو مشاعات همه‌چیز را به همین منطقه می‌بیند */
const TZ = 'Asia/Tehran'
const DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'] // ترتیب getUTCDay()
/** روز هفته‌ی ایرانی: ۰=شنبه … ۶=جمعه */
export const WEEKDAYS_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']

const fa = (n: number | string) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

export function tehranToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}
// تاریخ‌ها را روی ظهر UTC می‌سازیم (T12:00:00Z) تا جمع/تفریق روز و گرفتن روز هفته با اختلاف منطقه‌ی زمانی
// (مثلاً +۰۳:۳۰ تهران) از مرز نیمه‌شب رد نشود و یک روز جابه‌جا نگردد.
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function weekdayName(iso: string): string {
  return DAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]
}
/** روز هفته‌ی ایرانی (۰=شنبه) برای یک تاریخ میلادی */
export function weekdayIndex(iso: string): number {
  // getUTCDay: یکشنبه=۰ … شنبه=۶. هفته‌ی ایرانی از شنبه شروع می‌شود، پس +۱ و باقی‌مانده‌ی ۷ (شنبه ⇒ ۰، جمعه ⇒ ۶).
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 1) % 7
}
export function tehranParts(iso: string | Date): { date: string; hour: number; minute: number } {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${g('year')}-${pad(g('month'))}-${pad(g('day'))}`, hour: g('hour'), minute: g('minute') }
}
export const hourLabel = (h: number) => fa(`${String(h).padStart(2, '0')}:00`)
/** «پنجشنبه ۱۲ مهر» */
export function dayLabel(iso: string, withYear = false) {
  return `${weekdayName(iso)} ${formatJalali(iso, withYear)}`
}
/** «پنجشنبه ۱۲ مهر · ۱۸:۰۰ تا ۱۹:۰۰» */
export function whenLabel(startIso: string, endIso?: string) {
  const s = tehranParts(startIso)
  const e = endIso ? tehranParts(endIso) : null
  // پایانِ دقیقاً نیمه‌شب (ساعت ۰) به‌صورت «۲۴:۰۰» نشان داده می‌شود نه «۰۰:۰۰» تا بازه‌ی ۲۳ تا ۲۴ درست خوانده شود.
  const t = e ? `${hourLabel(s.hour)} تا ${hourLabel(e.hour === 0 ? 24 : e.hour)}` : hourLabel(s.hour)
  return `${dayLabel(s.date)} · ${t}`
}
/** تاریخ نسبی: امروز / فردا / نام روز */
export function relDay(iso: string) {
  const t = tehranToday()
  if (iso === t) return 'امروز'
  if (iso === addDays(t, 1)) return 'فردا'
  return weekdayName(iso)
}
