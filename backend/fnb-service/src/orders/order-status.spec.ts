import { canTransition } from './order-status'
import { manageKinds } from '../common/access'

describe('order state machine', () => {
  it('allows the happy path', () => {
    expect(canTransition('placed', 'accepted')).toBe(true)
    expect(canTransition('accepted', 'preparing')).toBe(true)
    expect(canTransition('preparing', 'ready')).toBe(true)
    expect(canTransition('ready', 'delivered')).toBe(true)
  })
  it('blocks skipping and reopening', () => {
    expect(canTransition('placed', 'ready')).toBe(false)
    expect(canTransition('delivered', 'placed')).toBe(false)
    expect(canTransition('rejected', 'accepted')).toBe(false)
  })
})

describe('manageKinds', () => {
  const base = { sub: 'u', tenant_id: 't', email: 'e' }
  it('admin manages everything', () => {
    expect(manageKinds({ ...base, role: 'admin' })).toEqual(['restaurant', 'cafe'])
  })
  it('staff only for held permissions', () => {
    expect(manageKinds({ ...base, role: 'staff', perms: ['cafe'] })).toEqual(['cafe'])
    expect(manageKinds({ ...base, role: 'staff', perms: ['lobby'] })).toEqual([])
    expect(manageKinds({ ...base, role: 'resident' })).toEqual([])
  })
})
