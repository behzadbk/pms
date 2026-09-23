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
  ): Promise<BookingCheckResult> {
    const violations: string[] = []

    // ۱) سقف تعداد رزرو واحد در بازه جاری
    const periodStart = this.startOfPeriod(rule.period_type, startAt)
    const countRes = await client.query(
      `SELECT COUNT(*) FROM facility.reservations
       WHERE amenity_id = $1 AND unit_id = $2 AND status IN ('confirmed', 'pending_approval')
         AND start_at >= $3`,
      [rule.amenity_id, unitId, periodStart],
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

    // ۴) بررسی همپوشانی (پیش‌بررسی UX-پسند — تضمین نهایی همچنان EXCLUDE Constraint دیتابیس است)
    const overlapRes = await client.query(
      `SELECT 1 FROM facility.reservations
       WHERE amenity_id = $1 AND status IN ('confirmed', 'pending_approval')
         AND tstzrange(start_at, end_at) && tstzrange($2, $3)`,
      [rule.amenity_id, startAt, endAt],
    )
    if ((overlapRes.rowCount ?? 0) > 0) {
      violations.push('این بازه قبلاً توسط واحد دیگری رزرو شده است.')
    }

    return { ok: violations.length === 0, violations }
  }

  private startOfPeriod(type: 'day' | 'week' | 'month', ref: Date): Date {
    const d = new Date(ref)
    if (type === 'day') {
      d.setHours(0, 0, 0, 0)
    } else if (type === 'week') {
      const day = d.getDay()
      d.setDate(d.getDate() - day)
      d.setHours(0, 0, 0, 0)
    } else {
      d.setDate(1)
      d.setHours(0, 0, 0, 0)
    }
    return d
  }

  private periodFa(p: string) {
    return p === 'day' ? 'روز' : p === 'week' ? 'هفته' : 'ماه'
  }
}
