import { calcCharge, computeLateFee, lateDays, resolveFormula, LateFeeRule } from './charge-calc'
import { computeDueDate, jalaliMonthLength, periodOfIso, periodRange, shiftPeriod, tehranToday, parsePeriod, toGregorian, toJalali } from '../common/jalali'

describe('calcCharge (فرمول شارژ)', () => {
  const f = { base_amount: 1_500_000, amount_per_sqm: 25_000, per_resident_amount: 0, fixed_items: [], round_to: 1 }

  it('پایه + متراژ — با داده‌ی seed (۹۲٫۵ متر = ۳٬۸۱۲٬۵۰۰)', () => {
    expect(calcCharge(f, { area: 92.5, residents: 0 }).total).toBe(3_812_500)
  })
  it('ضریب نفرات و اقلام ثابت اضافه می‌شوند', () => {
    const r = calcCharge({ ...f, per_resident_amount: 80_000, fixed_items: [{ title: 'آسانسور', amount: 200_000 }, { title: 'نظافت', amount: 100_000 }] }, { area: 100, residents: 3 })
    expect(r.total).toBe(1_500_000 + 2_500_000 + 240_000 + 300_000)
    expect(r.fixed_items).toHaveLength(2)
  })
  it('گرد کردن به مضرب round_to', () => {
    expect(calcCharge({ ...f, round_to: 1000 }, { area: 92.5, residents: 0 }).total).toBe(3_813_000)
  })
  it('واحد بدون متراژ فقط مبلغ پایه می‌دهد و مقدار منفی/نامعتبر ۰ حساب می‌شود', () => {
    expect(calcCharge(f, { area: NaN, residents: -2 }).total).toBe(1_500_000)
  })
})

describe('resolveFormula', () => {
  const mk = (id: string, eff: string | null, active = true, created = '2026-01-01') => ({ id, is_active: active, effective_from: eff, created_at: created })
  it('جدیدترین effective_from ≤ دوره را برمی‌دارد', () => {
    const r = resolveFormula([mk('a', null), mk('b', '1405-01'), mk('c', '1405-09')], '1405-07')
    expect(r?.id).toBe('b')
  })
  it('فرمول غیرفعال یا آینده نادیده گرفته می‌شود؛ بدون فرمول ⇒ null', () => {
    expect(resolveFormula([mk('a', '1406-01'), mk('b', null, false)], '1405-07')).toBeNull()
  })
})

describe('computeDueDate (سررسید بر پایه‌ی ماه شمسی)', () => {
  it('مهر ۱۴۰۵ روز ۱۰ = ۲ اکتبر ۲۰۲۶ (بدون جابه‌جایی یک‌روزه)', () => {
    expect(computeDueDate('1405-07', 10)).toBe('2026-10-02')
  })
  it('اول ماه و آخر ماه', () => {
    expect(computeDueDate('1405-07', 1)).toBe('2026-09-23')
    expect(computeDueDate('1405-01', 1)).toBe('2026-03-21')
  })
  it('روز بیشتر از طول ماه به آخر ماه سقف می‌خورد (اسفند ۱۴۰۴ کبیسه‌نیست ⇒ ۲۹)', () => {
    expect(jalaliMonthLength(1404, 12)).toBe(29)
    expect(computeDueDate('1404-12', 31)).toBe('2026-03-20')
    expect(jalaliMonthLength(1403, 12)).toBe(30)
  })
  it('خروجی همیشه رشته‌ی YYYY-MM-DD است و به منطقه‌ی زمانی پردازه وابسته نیست', () => {
    const prev = process.env.TZ
    for (const tz of ['UTC', 'Asia/Tehran', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = tz
      expect(computeDueDate('1405-07', 10)).toBe('2026-10-02')
      expect(computeDueDate('1405-12', 5)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    process.env.TZ = prev
  })
  it('دوره‌ی نامعتبر خطا می‌دهد', () => {
    expect(() => computeDueDate('2026-10', 10)).toThrow()
  })
})

describe('کمکی‌های دوره', () => {
  it('periodOfIso / periodRange / shiftPeriod', () => {
    expect(periodOfIso('2026-10-05')).toBe('1405-07')
    expect(periodRange('1405-07')).toEqual({ start: '2026-09-23', end: '2026-10-22' })
    expect(shiftPeriod('1405-01', -1)).toBe('1404-12')
    expect(shiftPeriod('1405-12', 1)).toBe('1406-01')
    expect(parsePeriod('1405-13')).toBeNull()
  })
  it('تبدیل رفت‌وبرگشت', () => {
    const g = toGregorian(1405, 7, 13)
    expect(toJalali(g.gy, g.gm, g.gd)).toEqual({ jy: 1405, jm: 7, jd: 13 })
  })
  it('tehranToday فرمت YYYY-MM-DD دارد و حوالی نیمه‌شب تهران روز را درست می‌دهد', () => {
    expect(tehranToday(new Date('2026-10-05T21:00:00Z'))).toBe('2026-10-06') // ۰۰:۳۰ تهران
    expect(tehranToday(new Date('2026-10-05T20:00:00Z'))).toBe('2026-10-05')
  })
})

describe('جریمه‌ی دیرکرد', () => {
  const base = 3_000_000
  const rule = (o: Partial<LateFeeRule> = {}): LateFeeRule => ({ enabled: true, mode: 'per_month', ratePercent: 2, graceDays: 0, capPercent: null, ...o })

  it('پیش‌فرض غیرفعال: هیچ جریمه‌ای محاسبه نمی‌شود', () => {
    expect(computeLateFee(base, '2026-10-02', '2026-12-01', rule({ enabled: false }))).toBe(0)
    expect(computeLateFee(base, '2026-10-02', '2026-12-01', rule({ ratePercent: 0 }))).toBe(0)
  })
  it('قبل از سررسید و داخل مهلت ⇒ ۰', () => {
    expect(computeLateFee(base, '2026-10-02', '2026-10-02', rule())).toBe(0)
    expect(computeLateFee(base, '2026-10-02', '2026-10-06', rule({ graceDays: 5 }))).toBe(0)
    expect(lateDays('2026-10-02', '2026-10-08', 5)).toBe(1)
  })
  it('ماهانه: هر ماه شروع‌شده یک نرخ', () => {
    expect(computeLateFee(base, '2026-10-02', '2026-10-03', rule())).toBe(60_000) // ۱ روز ⇒ ۱ ماه
    expect(computeLateFee(base, '2026-10-02', '2026-11-01', rule())).toBe(60_000) // ۳۰ روز ⇒ ۱ ماه
    expect(computeLateFee(base, '2026-10-02', '2026-11-02', rule())).toBe(120_000) // ۳۱ روز ⇒ ۲ ماه
  })
  it('روزانه و سقف', () => {
    expect(computeLateFee(base, '2026-10-02', '2026-10-12', rule({ mode: 'per_day', ratePercent: 0.1 }))).toBe(30_000)
    expect(computeLateFee(base, '2026-10-02', '2027-10-02', rule({ mode: 'per_day', ratePercent: 1, capPercent: 10 }))).toBe(300_000)
  })
  it('idempotent: هر چندبار در یک روز، همان مقدار (تابع خالصِ امروز)', () => {
    const a = computeLateFee(base, '2026-10-02', '2026-11-15', rule())
    const b = computeLateFee(base, '2026-10-02', '2026-11-15', rule())
    expect(a).toBe(b)
    expect(a).toBe(120_000)
  })
})
