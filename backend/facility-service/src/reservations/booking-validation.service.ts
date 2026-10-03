import { Injectable } from '@nestjs/common'
import { PoolClient } from 'pg'

export interface BookingRule {
  id: string
  amenity_id: string
  max_bookings_per_unit_per_period: number
  period_type: 'day' | 'week' | 'month'
  min_advance_hours: number
  max_advance_days: number
  deposit_amount: number
}

export interface BookingCheckResult {
  ok: boolean
  violations: string[]
}

/**
 * پیاده‌سازی سمت سرور همان الگوریتم مستندشده در docs/FEATURES-DEEP-DIVE.md بخش ۷.۱
 * (frontend/src/lib/bookingValidation.ts نسخه UI/demo همین منطق است — این‌جا
 * نسخه‌ای است که واقعاً در برابر دیتابیس اجرا و rejection را تضمین می‌کند).
 */
@Injectable()
export class BookingValidationService {
  async check(
    client: PoolClient,
    rule: BookingRule,
    unitId: string,
    startAt: Date,
    endAt: Date,
    opts: { skipOverlap?: boolean } = {},
  ): Promise<BookingCheckResult> {
    const violations: string[] = []

    // ۱) سقف تعداد رزرو واحد در بازه‌ی جاری — بازه به وقت تهران و هفته از شنبه است و از هر دو طرف بسته؛
    //    (نسخه‌ی قبل فقط «شروع بازه» را می‌گرفت و رزروهای هفته‌های بعد را هم می‌شمرد)
    const countRes = await client.query(
      `WITH p AS (
         SELECT CASE $4::text
                  WHEN 'day'  THEN date_trunc('day', t)
                  WHEN 'week' THEN date_trunc('week', t + interval '2 days') - interval '2 days'
                  ELSE date_trunc('month', t) END AS s,
                CASE $4::text WHEN 'day' THEN interval '1 day' WHEN 'week' THEN interval '7 days' ELSE interval '1 month' END AS len
           FROM (SELECT ($3::timestamptz AT TIME ZONE 'Asia/Tehran') AS t) x)
       SELECT COUNT(*) FROM facility.reservations r, p
        WHERE r.amenity_id = $1 AND r.unit_id = $2 AND r.status IN ('confirmed', 'pending')
          AND (r.start_at AT TIME ZONE 'Asia/Tehran') >= p.s
          AND (r.start_at AT TIME ZONE 'Asia/Tehran') <  p.s + p.len`,
      [rule.amenity_id, unitId, startAt, rule.period_type],
    )
    if (Number(countRes.rows[0].count) >= rule.max_bookings_per_unit_per_period) {
      violations.push(
        `سقف رزرو این واحد برای این مشاع (${rule.max_bookings_per_unit_per_period} بار در هر ${this.periodFa(rule.period_type)}) تکمیل شده است.`,
      )
    }

    // ۲) و ۳) بازه پیش‌سفارش
    const hoursUntil = (startAt.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil < rule.min_advance_hours) {
      violations.push(`این بازه باید حداقل ${rule.min_advance_hours} ساعت زودتر رزرو شود.`)
    }
    if (hoursUntil > rule.max_advance_days * 24) {
      violations.push(`رزرو این مشاع حداکثر تا ${rule.max_advance_days} روز آینده امکان‌پذیر است.`)
    }

    if (opts.skipOverlap) return { ok: violations.length === 0, violations }

    // ۴) بررسی همپوشانی (پیش‌بررسی UX-پسند — تضمین نهایی همچنان EXCLUDE Constraint دیتابیس است)
    const overlapRes = await client.query(
      `SELECT 1 FROM facility.reservations
       WHERE amenity_id = $1 AND status IN ('confirmed', 'pending')
         AND tstzrange(start_at, end_at) && tstzrange($2, $3)`,
      [rule.amenity_id, startAt, endAt],
    )
    if ((overlapRes.rowCount ?? 0) > 0) {
      violations.push('این بازه قبلاً توسط واحد دیگری رزرو شده است.')
    }

    return { ok: violations.length === 0, violations }
  }

  private periodFa(p: string) {
    return p === 'day' ? 'روز' : p === 'week' ? 'هفته' : 'ماه'
  }
}
