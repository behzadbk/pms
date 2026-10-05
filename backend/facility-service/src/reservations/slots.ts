/**
 * ساعت‌های قابل رزرو یک روز (منطق خالص — تست واحد دارد).
 * همه‌ی زمان‌ها به وقت تهران (UTC+03:30، بدون ساعت تابستانی از ۱۴۰۱).
 */
export const TEHRAN_OFFSET = '+03:30'

export interface Busy {
  start: Date
  end: Date
  status: string
}

export interface Slot {
  hour: number
  label: string
  start: string
  end: string
  status: 'free' | 'taken' | 'past'
}

/** «2026-09-30» + ۱۷ → لحظه‌ی ۱۷:۰۰ تهران */
export function tehranInstant(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00${TEHRAN_OFFSET}`)
}

export function tehranToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(now)
}

export function buildSlots(date: string, hours: number[], busy: Busy[], now = new Date()): Slot[] {
  return [...hours].sort((a, b) => a - b).map((h) => {
    const start = tehranInstant(date, h)
    const end = tehranInstant(date, h + 1)
    const taken = busy.some((b) => ['pending', 'confirmed'].includes(b.status) && b.start < end && b.end > start)
    return {
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      start: start.toISOString(),
      end: end.toISOString(),
      status: taken ? 'taken' : start <= now ? 'past' : 'free',
    }
  })
}

/** ساعت و دقیقه‌ی یک لحظه به وقت تهران (UTC+03:30) */
export function tehranClock(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  return { hour: Number(parts.find((p) => p.type === 'hour')?.value ?? 0), minute: Number(parts.find((p) => p.type === 'minute')?.value ?? 0) }
}

/** آیا بازه‌ی [start, start+hours) دقیقاً از ساعت‌های قابل رزرو مشاع تشکیل شده و از نیمه‌شب نمی‌گذرد؟ */
export function fitsSlotHours(start: Date, hours: number, slotHours: number[]): boolean {
  const { hour, minute } = tehranClock(start)
  if (minute !== 0 || hour + hours > 24) return false
  for (let h = hour; h < hour + hours; h++) if (!slotHours.includes(h)) return false
  return true
}
