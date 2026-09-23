import type { Amenity, BookingRule, CalendarSlot } from './types'

export interface BookingCheckResult {
  ok: boolean
  requiresApproval: boolean
  depositRequired: number
  violations: string[]
}

/**
 * پیاده‌سازی الگوریتم بررسی قوانین رزرو پیش از نهایی‌شدن (سند FEATURES §7.1)
 * ترتیب چک‌ها دقیقاً مطابق شبه‌کد بخش «منطق تجاری» است:
 *   1) سقف تعداد رزرو واحد در بازه
 *   2) حداقل فاصله زمانی مجاز تا لحظه رزرو (پیش‌سفارش)
 *   3) حداکثر فاصله زمانی مجاز (سقف رزرو زودهنگام)
 *   4) تعیین نیاز به تایید مدیر و مبلغ بیعانه (این دو، رد نمی‌کنند؛ فقط مسیر بعدی را مشخص می‌کنند)
 */
export function checkBookingRules(params: {
  rule: BookingRule
  amenity: Amenity
  slot: CalendarSlot
  existingBookingsThisPeriod: number
  dayOffsetFromToday: number // 0 = امروز، 1 = فردا و ...
  nowHour?: number
}): BookingCheckResult {
  const { rule, amenity, slot, existingBookingsThisPeriod, dayOffsetFromToday } = params
  const nowHour = params.nowHour ?? new Date().getHours()
  const violations: string[] = []

  // ۱) سقف تعداد رزرو واحد در بازه (ماه/هفته/روز)
  if (existingBookingsThisPeriod >= rule.maxBookingsPerUnitPerPeriod) {
    violations.push(
      `سقف رزرو این واحد برای «${amenity.name}» (${rule.maxBookingsPerUnitPerPeriod} بار در هر ${periodLabel(rule.periodType)}) تکمیل شده است.`,
    )
  }

  // ۲) و ۳) بازه پیش‌سفارش — فاصله ساعتی تا لحظه شروع رزرو
  const hoursUntilSlot = dayOffsetFromToday * 24 + (slot.startHour - nowHour)
  if (hoursUntilSlot < rule.minAdvanceHours) {
    violations.push(`این بازه باید حداقل ${rule.minAdvanceHours} ساعت زودتر رزرو شود (فاصله فعلی: ${Math.max(hoursUntilSlot, 0)} ساعت).`)
  }
  const maxAdvanceHours = rule.maxAdvanceDays * 24
  if (hoursUntilSlot > maxAdvanceHours) {
    violations.push(`رزرو «${amenity.name}» حداکثر تا ${rule.maxAdvanceDays} روز آینده امکان‌پذیر است.`)
  }

  return {
    ok: violations.length === 0,
    requiresApproval: amenity.requiresApproval,
    depositRequired: rule.depositAmount,
    violations,
  }
}

function periodLabel(p: BookingRule['periodType']) {
  return p === 'day' ? 'روز' : p === 'week' ? 'هفته' : 'ماه'
}
