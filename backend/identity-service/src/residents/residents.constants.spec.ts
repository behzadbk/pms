import {
  PRESETS, ageFromBirthYear, childPermissionMap, currentJalaliYear, decideChildPurchase, inQuietWindow, matchPreset, presetForAge, roleMatrix,
} from './residents.constants'
import { normalizePhone, displayPhone } from './phone'
import { parseDateInput, formatJalali, toGregorian, toJalali } from './jalali'
import { unitBadges } from './manager.service'

describe('پیش‌تنظیم‌های سنی (جدول Presets در RESIDENTS.md)', () => {
  it('مقادیر جدول', () => {
    expect(PRESETS.u7.modules).toEqual({ food: 0, amenity: 0, guest: 0, ticket: 0, parcel: 0, notice: 0 })
    expect(PRESETS.c12.modules).toEqual({ food: 1, amenity: 1, guest: 0, ticket: 1, parcel: 2, notice: 2 })
    expect(PRESETS.t17.modules).toEqual({ food: 2, amenity: 1, guest: 1, ticket: 2, parcel: 2, notice: 2 })
    expect([PRESETS.u7.monthly_cap, PRESETS.c12.monthly_cap, PRESETS.t17.monthly_cap]).toEqual([0, 500_000, 1_500_000])
    expect([PRESETS.t17.quiet, PRESETS.t17.weekly_report, PRESETS.t17.exit_lock]).toEqual([false, true, false])
  })
  it('ویرایش هر ردیف پیش‌تنظیم را «سفارشی» می‌کند', () => {
    const base = { ...PRESETS.c12, quiet: true }
    expect(matchPreset(base)).toBe('c12')
    expect(matchPreset({ ...base, modules: { ...base.modules, food: 2 } })).toBe('custom')
    expect(matchPreset({ ...base, monthly_cap: 600_000 })).toBe('custom')
  })
  it('پیش‌تنظیم از روی سن', () => {
    expect(presetForAge(5)).toBe('u7')
    expect(presetForAge(7)).toBe('c12')
    expect(presetForAge(12)).toBe('c12')
    expect(presetForAge(13)).toBe('t17')
  })
  it('سن از سال تولد شمسی', () => {
    const now = new Date('2026-09-30T12:00:00Z')
    expect(currentJalaliYear(now)).toBe(1405)
    expect(currentJalaliYear(new Date('2026-03-01T00:00:00Z'))).toBe(1404)
    expect(ageFromBirthYear(1394, now)).toBe(11)
    expect(ageFromBirthYear(null, now)).toBeNull()
  })
})

describe('نقشه‌ی دسترسی', () => {
  it('کودک: مالی و مجمع همیشه پنهان، اضطراری همیشه باز، «پنهان» حذف می‌شود', () => {
    const m = childPermissionMap({ food: 0, amenity: 1, guest: 0, ticket: 2, parcel: 2, notice: 2 })
    expect(m.finance).toBe('hidden')
    expect(m.assembly).toBe('hidden')
    expect(m.emergency).toBe('free')
    expect(m.food).toBe('hidden')
    expect(m.amenity).toBe('approval')
    expect(m.ticket).toBe('free')
  })
  it('مالک غیرساکن فقط مالی، اطلاعیه و مجمع', () => {
    const m = roleMatrix('owner_absent')
    expect(m.finance).toBe('free')
    expect(m.notice).toBe('free')
    expect(m.assembly).toBe('free')
    expect(m.food).toBe('hidden')
    expect(m.household).toBe('hidden')
  })
  it('پرستار: فقط مرسوله/تیکت (مشاهده) و اضطراری', () => {
    const m = roleMatrix('caregiver')
    expect(m.emergency).toBe('free')
    expect(m.parcel).toBe('view')
    expect(m.finance).toBe('hidden')
    expect(m.food).toBe('hidden')
  })
  it('بزرگسال بدون دسترسی مالی', () => {
    expect(roleMatrix('adult', { financeAccess: false }).finance).toBe('hidden')
    expect(roleMatrix('adult').household).toBe('hidden')
    expect(roleMatrix('head').household).toBe('free')
  })
})

describe('خرید کودک (قاعده ۸)', () => {
  it('پنهان → ممنوع؛ با تأیید → درخواست؛ بالای سقف → درخواست؛ وگرنه مستقیم', () => {
    expect(decideChildPurchase(0, 1000, 5000)).toEqual({ kind: 'forbidden' })
    expect(decideChildPurchase(1, 1000, 5000)).toEqual({ kind: 'request', reason: 'approval' })
    expect(decideChildPurchase(2, 320_000, 220_000)).toEqual({ kind: 'request', reason: 'over_cap' })
    expect(decideChildPurchase(2, 220_000, 220_000)).toEqual({ kind: 'direct' })
  })
  it('ساعت سکوت شبانه ۲۲ تا ۷', () => {
    const q = { from: '22:00', to: '07:00' }
    expect(inQuietWindow(q, '23:30')).toBe(true)
    expect(inQuietWindow(q, '06:59')).toBe(true)
    expect(inQuietWindow(q, '07:00')).toBe(false)
    expect(inQuietWindow(q, '12:00')).toBe(false)
    expect(inQuietWindow(null, '23:00')).toBe(false)
    expect(inQuietWindow({ from: '13:00', to: '15:00' }, '14:00')).toBe(true)
  })
})

describe('موبایل و تاریخ', () => {
  it('یکسان‌سازی موبایل به E.164', () => {
    expect(normalizePhone('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBe('+989123456789')
    expect(normalizePhone('09123456789')).toBe('+989123456789')
    expect(normalizePhone('+989123456789')).toBe('+989123456789')
    expect(normalizePhone('989123456789')).toBe('+989123456789')
    expect(normalizePhone('12345')).toBeNull()
    expect(displayPhone('+989123456789')).toBe('0912 345 6789')
  })
  it('شمسی ↔ میلادی', () => {
    expect(toGregorian(1405, 7, 1)).toEqual({ gy: 2026, gm: 9, gd: 23 })
    expect(toJalali(2025, 3, 20)).toEqual({ jy: 1403, jm: 12, jd: 30 })
    expect(parseDateInput('۱ مهر ۱۴۰۵')).toBe('2026-09-23')
    expect(parseDateInput('1405/08/15')).toBe('2026-11-06')
    expect(parseDateInput('۳۲ مهر ۱۴۰۵')).toBeNull()
    expect(formatJalali('2026-11-06')).toBe('۱۵ آبان ۱۴۰۵')
  })
})

describe('برچسب‌های فهرست ساکنین', () => {
  const row = {
    id: 'x', unit_number: '1202', floor: 12, occupancy: 'tenant', owner_name: null, head_name: 'رضا', head_status: 'invited',
    head_residency: 'tenant', head_end_date: null, live_count: 1, child_count: 0, senior_easy: 0, invited_members: 0,
    new_members: 0, pending_count: 0, pending_name: null, move_out_date: null,
  }
  it('ساکن تازه‌ثبت‌شده در واحد خالی → «دعوت ارسال شد»', () => {
    expect(unitBadges(row)).toEqual([{ t: 'دعوت ارسال شد', tone: 'warn' }])
  })
  it('واحد خالی با درخواست QR → «در انتظار تأیید»', () => {
    expect(unitBadges({ ...row, occupancy: 'vacant', pending_count: 1 })).toEqual([{ t: 'در انتظار تأیید', tone: 'warn' }])
  })
  it('کودک و پایان قرارداد نزدیک', () => {
    const end = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)
    const b = unitBadges({ ...row, head_status: 'active', child_count: 2, head_end_date: end })
    expect(b.map((x) => x.t)).toEqual(['کودک ۲', 'پایان قرارداد تا ۲۰ روز'])
  })
})
