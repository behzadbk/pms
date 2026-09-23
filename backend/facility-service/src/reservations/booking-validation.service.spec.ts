import { BookingValidationService, BookingRule } from './booking-validation.service'

/** یک PoolClient جعلی که پاسخ هر query را به‌ترتیب برمی‌گرداند */
function fakeClient(responses: any[]) {
  let i = 0
  return {
    query: jest.fn().mockImplementation(() => Promise.resolve(responses[i++])),
  } as any
}

const baseRule: BookingRule = {
  id: 'rule-1',
  amenity_id: 'amenity-1',
  max_bookings_per_unit_per_period: 2,
  period_type: 'week',
  min_advance_hours: 2,
  max_advance_days: 30,
  deposit_amount: 0,
}

describe('BookingValidationService', () => {
  const service = new BookingValidationService()

  it('وقتی همه‌ی قوانین رعایت شده باشند، ok=true و بدون تخلف است', async () => {
    const client = fakeClient([
      { rows: [{ count: '0' }] }, // شمارش رزرو در بازه
      { rowCount: 0 }, // بدون همپوشانی
    ])
    const start = new Date(Date.now() + 1000 * 60 * 60 * 5) // ۵ ساعت دیگر
    const end = new Date(start.getTime() + 1000 * 60 * 60)
    const res = await service.check(client, baseRule, 'unit-1', start, end)
    expect(res.ok).toBe(true)
    expect(res.violations).toHaveLength(0)
  })

  it('وقتی سقف تعداد رزرو واحد در بازه پر شده باشد، رد می‌شود', async () => {
    const client = fakeClient([{ rows: [{ count: '2' }] }, { rowCount: 0 }])
    const start = new Date(Date.now() + 1000 * 60 * 60 * 5)
    const end = new Date(start.getTime() + 1000 * 60 * 60)
    const res = await service.check(client, baseRule, 'unit-1', start, end)
    expect(res.ok).toBe(false)
    expect(res.violations.some((v) => v.includes('سقف رزرو'))).toBe(true)
  })

  it('رزروی که زودتر از min_advance_hours باشد رد می‌شود', async () => {
    const client = fakeClient([{ rows: [{ count: '0' }] }, { rowCount: 0 }])
    const start = new Date(Date.now() + 1000 * 60 * 30) // فقط نیم ساعت دیگر
    const end = new Date(start.getTime() + 1000 * 60 * 60)
    const res = await service.check(client, baseRule, 'unit-1', start, end)
    expect(res.ok).toBe(false)
    expect(res.violations.some((v) => v.includes('حداقل'))).toBe(true)
  })

  it('رزروی که بیش از max_advance_days جلوتر باشد رد می‌شود', async () => {
    const client = fakeClient([{ rows: [{ count: '0' }] }, { rowCount: 0 }])
    const start = new Date(Date.now() + 1000 * 60 * 60 * 24 * 40) // ۴۰ روز دیگر
    const end = new Date(start.getTime() + 1000 * 60 * 60)
    const res = await service.check(client, baseRule, 'unit-1', start, end)
    expect(res.ok).toBe(false)
    expect(res.violations.some((v) => v.includes('حداکثر'))).toBe(true)
  })

  it('بازه‌ی هم‌پوشان با یک رزرو تأییدشده‌ی دیگر رد می‌شود', async () => {
    const client = fakeClient([{ rows: [{ count: '0' }] }, { rowCount: 1 }])
    const start = new Date(Date.now() + 1000 * 60 * 60 * 5)
    const end = new Date(start.getTime() + 1000 * 60 * 60)
    const res = await service.check(client, baseRule, 'unit-1', start, end)
    expect(res.ok).toBe(false)
    expect(res.violations.some((v) => v.includes('قبلاً توسط واحد دیگری'))).toBe(true)
  })

  it('چند تخلف هم‌زمان همه در violations جمع می‌شوند', async () => {
    const client = fakeClient([{ rows: [{ count: '2' }] }, { rowCount: 1 }])
    const start = new Date(Date.now() + 1000 * 60 * 30)
    const end = new Date(start.getTime() + 1000 * 60 * 60)
    const res = await service.check(client, baseRule, 'unit-1', start, end)
    expect(res.ok).toBe(false)
    expect(res.violations.length).toBeGreaterThanOrEqual(3)
  })
})
