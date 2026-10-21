import { genderAt, normalizeSplit } from './gender'

describe('gender split', () => {
  it('parity: روز زوج/فرد شمسی', () => {
    const s = normalizeSplit({ mode: 'parity', even: 'women', odd: 'men' })
    // ۱۴۰۵/۰۷/۱۵ = 2026-10-07 → فرد
    expect(genderAt(s, '2026-10-07', 10)).toBe('men')
    expect(genderAt(s, '2026-10-08', 10)).toBe('women')
  })
  it('hours: بازه‌ی ساعتی', () => {
    const s = normalizeSplit({ mode: 'hours', ranges: [{ from: 16, to: 22, gender: 'men' }, { from: 6, to: 16, gender: 'women' }] })
    expect(genderAt(s, '2026-10-07', 9)).toBe('women')
    expect(genderAt(s, '2026-10-07', 16)).toBe('men')
    expect(genderAt(s, '2026-10-07', 23)).toBeNull()
  })
  it('weekday و نامعتبر', () => {
    const s = normalizeSplit({ mode: 'weekday', days: { '0': 'women' } })
    expect(genderAt(s, '2026-10-10', 9)).toBe('women') // شنبه
    expect(() => normalizeSplit({ mode: 'hours', ranges: [{ from: 6, to: 12, gender: 'men' }, { from: 10, to: 14, gender: 'women' }] })).toThrow()
    expect(normalizeSplit(null)).toBeNull()
  })
})
