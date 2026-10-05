import { assertDesk, normPlate } from './access'

describe('normPlate', () => {
  it('normalises persian digits, spaces and the word ایران', () => {
    expect(normPlate('۱۲ ایران ۴۴۵ ب ۷۷')).toBe(normPlate('12ایران445ب77'))
    expect(normPlate('12-ایران-445-ب-77')).toBe('12445ب77')
  })
})

describe('assertDesk', () => {
  const base = { sub: 'u', tenant_id: 't', email: 'e' }
  it('lets guard, admin and lobby/security staff in', () => {
    expect(() => assertDesk({ ...base, role: 'guard' })).not.toThrow()
    expect(() => assertDesk({ ...base, role: 'staff', perms: ['lobby'] })).not.toThrow()
  })
  it('rejects others and honours a narrower permission list', () => {
    expect(() => assertDesk({ ...base, role: 'staff', perms: ['kitchen'] })).toThrow()
    expect(() => assertDesk({ ...base, role: 'staff', perms: ['lobby'] }, ['security'])).toThrow()
    expect(() => assertDesk({ ...base, role: 'resident' })).toThrow()
  })
})
