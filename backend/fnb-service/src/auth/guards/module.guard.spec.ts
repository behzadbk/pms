import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ModuleGuard } from './module.guard'
import { RequireModule } from '../decorators/require-module.decorator'

@RequireModule('fnb_ordering')
class Gated { handler() {} }
class Open { handler() {} }

const ctx = (cls: any, user: any): ExecutionContext =>
  ({ getHandler: () => cls.prototype.handler, getClass: () => cls, switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any

describe('ModuleGuard', () => {
  const guard = new ModuleGuard(new Reflector())
  afterEach(() => { delete process.env.ENFORCE_TIER_MODULES })

  it('بدون ENFORCE_TIER_MODULES همه چیز عبور می‌کند', () => {
    expect(guard.canActivate(ctx(Gated, { role: 'resident', tier: 'simple' }))).toBe(true)
  })

  describe('با enforcement', () => {
    beforeEach(() => { process.env.ENFORCE_TIER_MODULES = 'true' })
    it('tier حرفه‌ای عبور می‌کند', () => {
      expect(guard.canActivate(ctx(Gated, { role: 'resident', tier: 'professional' }))).toBe(true)
    })
    it.each(['simple', 'economic'])('tier %s رد می‌شود', (tier) => {
      expect(() => guard.canActivate(ctx(Gated, { role: 'resident', tier }))).toThrow(ForbiddenException)
    })
    it('tier نامعتبر رد می‌شود', () => {
      expect(() => guard.canActivate(ctx(Gated, { role: 'admin', tier: 'gold' }))).toThrow(ForbiddenException)
    })
    it('توکن بدون tier و super_admin عبور می‌کنند', () => {
      expect(guard.canActivate(ctx(Gated, { role: 'resident' }))).toBe(true)
      expect(guard.canActivate(ctx(Gated, { role: 'super_admin', tier: 'simple' }))).toBe(true)
    })
    it('Route بدون @RequireModule آزاد است', () => {
      expect(guard.canActivate(ctx(Open, { role: 'resident', tier: 'simple' }))).toBe(true)
    })
  })
})
