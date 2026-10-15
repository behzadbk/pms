/** قواعد خالصِ کارهای نظافت (بدون دیتابیس) — قابل تست */

export const TASK_KINDS = ['unit', 'common', 'custom'] as const
export type TaskKind = (typeof TASK_KINDS)[number]
export const SLOTS = ['any', 'morning', 'afternoon', 'evening'] as const
export type Slot = (typeof SLOTS)[number]
export const SLOT_LABEL: Record<Slot, string> = { any: 'هر ساعتی', morning: 'صبح', afternoon: 'بعدازظهر', evening: 'عصر' }
export const KIND_LABEL: Record<TaskKind, string> = { unit: 'نظافت منزل', common: 'نظافت مشاعات', custom: 'کار موردی' }

/** هر واحد حداکثر این‌قدر درخواست باز (جدید/واگذارشده/در حال انجام) از ساکن دارد */
export const MAX_OPEN_REQUESTS = 3
/** درخواست ساکن حداکثر تا این‌قدر روز آینده */
export const MAX_WANT_DAYS = 30

export interface TaskInput {
  kind: TaskKind
  unitNumber?: string | null
  title?: string | null
  details?: string | null
}

/** عنوان نهایی کار؛ برای منزل خودکار، برای مشاعات/موردی الزامی */
export function taskTitle(i: TaskInput): string {
  const t = (i.title ?? '').trim()
  if (i.kind === 'unit') return t || `نظافت منزل — واحد ${i.unitNumber ?? ''}`.trim()
  if (t.length < 2) throw new Error(i.kind === 'common' ? 'محل نظافت را بنویسید (مثلاً لابی یا پارکینگ)' : 'عنوان کار را بنویسید')
  if (t.length > 120) throw new Error('عنوان حداکثر ۱۲۰ حرف باشد')
  return i.kind === 'common' && !/^نظافت/.test(t) ? `نظافت ${t}` : t
}

/** تاریخ ISO (yyyy-mm-dd) نسبت به «امروز» تهران: بین امروز و MAX_WANT_DAYS روز بعد */
export function checkWantDate(date: string | null | undefined, todayIso: string): string | null {
  if (!date) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('تاریخ نامعتبر است')
  const d = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / 86_400_000)
  if (!Number.isFinite(d) || d < 0) throw new Error('تاریخ نمی‌تواند گذشته باشد')
  if (d > MAX_WANT_DAYS) throw new Error(`تاریخ حداکثر ${MAX_WANT_DAYS} روز آینده می‌تواند باشد`)
  return date
}

export const TRANSITIONS: Record<string, string[]> = {
  new: ['assigned', 'cancelled'],
  assigned: ['assigned', 'in_progress', 'cancelled'],
  in_progress: ['done', 'assigned'],
  done: ['assigned'], // فقط با ابطال نظافتِ ثبت‌شده
  cancelled: [],
}
export const canMove = (from: string, to: string) => (TRANSITIONS[from] ?? []).includes(to)
