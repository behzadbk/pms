import { bulkNumbers, normalizeUnitNumber } from './tower.service'
import { applyDebtorLocks, isRestrictionKey, restrictedAmenities, restrictedModules, roleMatrix } from './residents.constants'

describe('ساخت واحد', () => {
  it('ارقام فارسی و فاصله را یکسان می‌کند', () => {
    expect(normalizeUnitNumber(' ۱۲ ۰۳ ')).toBe('1203')
    expect(normalizeUnitNumber('٣٠٢')).toBe('302')
  })
  it('شماره‌گذاری گروهی: طبقه×۱۰۰ + شماره', () => {
    const r = bulkNumbers(2, 3, 1)
    expect(r.map((x) => x.unit_number)).toEqual(['101', '102', '103', '201', '202', '203'])
    expect(r.map((x) => x.floor)).toEqual([1, 1, 1, 2, 2, 2])
  })
  it('شروع از طبقه‌ی دلخواه', () => {
    expect(bulkNumbers(1, 2, 5).map((x) => x.unit_number)).toEqual(['501', '502'])
  })
})

describe('قوانین برج', () => {
  const uuid = '0b6e1f55-3c52-4e8f-9d0a-7a3c1b2d4e5f'
  it('فقط کلیدهای مجاز', () => {
    expect(isRestrictionKey('module:food')).toBe(true)
    expect(isRestrictionKey('module:guest')).toBe(true)
    expect(isRestrictionKey('module:amenity')).toBe(true)
    expect(isRestrictionKey(`amenity:${uuid}`)).toBe(true)
    // مالی، تیکت، اعلانات و اضطراری هرگز قابل محدودسازی نیستند
    for (const m of ['finance', 'ticket', 'notice', 'parcel', 'emergency', 'household']) expect(isRestrictionKey(`module:${m}`)).toBe(false)
    expect(isRestrictionKey('amenity:not-a-uuid')).toBe(false)
  })
  it('استخراج بخش‌ها و مشاع‌های محدود', () => {
    const r = { 'module:food': true, 'module:guest': false, [`amenity:${uuid}`]: true }
    expect(restrictedModules(r)).toEqual(['food'])
    expect(restrictedAmenities(r)).toEqual([uuid])
  })
  it('قفل بخش را «locked» می‌کند ولی پنهان را پنهان نگه می‌دارد و مالی را هرگز قفل نمی‌کند', () => {
    const m = applyDebtorLocks(roleMatrix('caregiver'), ['food', 'guest', 'amenity'])
    expect(m.food).toBe('hidden')
    const head = applyDebtorLocks(roleMatrix('head'), ['food', 'amenity'])
    expect(head.food).toBe('locked')
    expect(head.amenity).toBe('locked')
    expect(head.guest).toBe('free')
    expect(head.finance).toBe('free')
    expect(head.emergency).toBe('free')
  })
})
