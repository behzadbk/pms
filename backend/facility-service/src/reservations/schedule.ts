import type { PoolClient } from 'pg'
import { TEHRAN_OFFSET } from './slots'

/** روز هفته‌ی ایرانی (۰=شنبه … ۶=جمعه) برای تاریخ «YYYY-MM-DD» به وقت تهران */
export function weekdayOf(date: string): number {
  const js = new Date(`${date}T12:00:00${TEHRAN_OFFSET}`).getUTCDay() // 0=یکشنبه
  return (js + 1) % 7
}

export interface DayPlan {
  hours: number[]
  closed: string | null // دلیل تعطیلی، یا null
}

/**
 * ساعت‌های قابل رزرو یک مشاع در یک روز:
 *  ۱) تعطیلی ثبت‌شده (برای همین مشاع یا همه‌ی مشاعات) → بسته
 *  ۲) اگر مشاع تایم‌تیبل هفتگی دارد → ساعت‌های همان روز هفته (بدون ردیف = بسته)
 *  ۳) وگرنه slot_hours قدیمی برای همه‌ی روزها
 */
export async function dayPlan(client: PoolClient, amenity: { id: string; slot_hours: number[] }, date: string): Promise<DayPlan> {
  const closure = (await client.query<{ reason: string | null }>(
    `SELECT reason FROM facility.amenity_closures
      WHERE (amenity_id = $1 OR amenity_id IS NULL) AND $2::date BETWEEN date_from AND date_to
      ORDER BY (amenity_id IS NULL) LIMIT 1`, [amenity.id, date])).rows[0]
  if (closure) return { hours: [], closed: closure.reason || 'تعطیل' }

  const rows = (await client.query<{ weekday: number; hours: number[] }>(
    `SELECT weekday, hours FROM facility.amenity_schedule WHERE amenity_id = $1`, [amenity.id])).rows
  if (!rows.length) return { hours: amenity.slot_hours ?? [], closed: null }
  const today = rows.find((r) => r.weekday === weekdayOf(date))
  const hours = today?.hours ?? []
  return { hours, closed: hours.length ? null : 'این روز هفته تعطیل است' }
}
