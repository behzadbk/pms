import { BadRequestException, UnauthorizedException } from '@nestjs/common'
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
import * as bcrypt from 'bcrypt'
import { AuthService } from './auth.service'

/**
 * تست مشخصه‌سازی (characterization) رفتار فعلی ورود و تغییر رمز اجباری — بدون تغییر در کد تولید.
 * دیتابیس با یک client ساختگی شبیه‌سازی می‌شود؛ هدف قفل‌کردن قرارداد رفتاری است:
 *  - کاربر با رمز موقت وارد می‌شود و پرچم mustChangePassword می‌گیرد؛
 *  - رمز فعلیِ غلط به شمارنده‌ی قفل می‌رود؛ رمز ضعیف/تکراری رد می‌شود؛
 *  - تغییر موفق پرچم را پاک و نشست‌های قبلی را باطل می‌کند.
 */
const TENANT = { id: 't-1', status: 'active' }
const OLD_PW = 'Temp#Pass1234'

function makeUser(hash: string, over: Record<string, unknown> = {}) {
  return {
    id: 'u-1', full_name: 'کاربر', email: 'a@b.ir', username: null, role: 'staff', department: 'lobby', permissions: null,
    is_active: true, person_id: null, must_change_password: true, person_status: null, tenant_name: 'برج',
    tenant_tier: 'simple', department_name: null, sessions_valid_after: null, password_hash: hash, phone: null, ...over,
  }
}

function setup(user: ReturnType<typeof makeUser> | undefined) {
  const updates: Array<{ sql: string; params: unknown[] }> = []
  const client = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (/FROM identity\.tenants WHERE subdomain/.test(sql)) return { rows: [TENANT] }
      if (/^\s*UPDATE/i.test(sql)) { updates.push({ sql, params }); return { rows: [] } }
      if (/FROM identity\.users/.test(sql)) return { rows: user ? [{ ...user, must_change_password: updates.length ? false : user.must_change_password }] : [] }
      return { rows: [] }
    }),
  }
  const db = {
    withPlatformAccess: jest.fn((fn: (c: typeof client) => unknown) => fn(client)),
    withTenant: jest.fn((_t: string, fn: (c: typeof client) => unknown) => fn(client)),
  }
  const events = { publish: jest.fn() }
  const throttle = { assertAllowed: jest.fn(), recordFailure: jest.fn(), recordSuccess: jest.fn() }
  // JwtService ساختگی: payload را در رشته‌ی توکن نگه می‌دارد (بسته‌ی @nestjs/jwt در jest ESM است)
  const jwt = { sign: (payload: object) => JSON.stringify(payload), verify: (t: string) => JSON.parse(t) }
  const svc = new AuthService(jwt as never, db as never, events as never, throttle as never)
  return { svc, jwt, events, throttle, updates }
}

const current = { sub: 'u-1', tenant_id: 't-1', role: 'staff', email: 'a@b.ir' }

describe('AuthService.login — رمز موقت', () => {
  it('ورود موفق با رمز موقت: mustChangePassword=true و موفقیت در throttle ثبت می‌شود', async () => {
    const { svc, throttle } = setup(makeUser(await bcrypt.hash(OLD_PW, 4)))
    const res = await svc.login({ tenantSubdomain: 'tower', email: 'A@B.ir', password: OLD_PW } as never, '1.2.3.4')
    expect(res.user.mustChangePassword).toBe(true)
    expect(res.accessToken).toBeTruthy()
    expect(throttle.recordSuccess).toHaveBeenCalledWith('t:t-1', 'a@b.ir', '1.2.3.4')
    expect(throttle.recordFailure).not.toHaveBeenCalled()
  })

  it('رمز غلط: ۴۰۱ و ثبت خطا برای قفل', async () => {
    const { svc, throttle } = setup(makeUser(await bcrypt.hash(OLD_PW, 4)))
    await expect(svc.login({ tenantSubdomain: 'tower', email: 'a@b.ir', password: 'wrong-pass-1' } as never, '1.2.3.4'))
      .rejects.toBeInstanceOf(UnauthorizedException)
    expect(throttle.recordFailure).toHaveBeenCalledTimes(1)
  })

  it('کاربر ناموجود: همان ۴۰۱ و ثبت خطا (بدون لو دادن وجود حساب)', async () => {
    const { svc, throttle } = setup(undefined)
    await expect(svc.login({ tenantSubdomain: 'tower', email: 'x@y.ir', password: OLD_PW } as never))
      .rejects.toBeInstanceOf(UnauthorizedException)
    expect(throttle.recordFailure).toHaveBeenCalledTimes(1)
  })

  it('کاربر غیرفعال با رمز درست هم رد می‌شود', async () => {
    const { svc } = setup(makeUser(await bcrypt.hash(OLD_PW, 4), { is_active: false }))
    await expect(svc.login({ tenantSubdomain: 'tower', email: 'a@b.ir', password: OLD_PW } as never))
      .rejects.toBeInstanceOf(UnauthorizedException)
  })
})

describe('AuthService.changePassword — تعویض اجباری', () => {
  it('رمز جدید برابر رمز فعلی: ۴۰۰ بدون دسترسی به دیتابیس', async () => {
    const { svc, updates } = setup(makeUser(await bcrypt.hash(OLD_PW, 4)))
    await expect(svc.changePassword(current, OLD_PW, OLD_PW)).rejects.toBeInstanceOf(BadRequestException)
    expect(updates).toHaveLength(0)
  })

  it('رمز فعلیِ غلط: ۴۰۱ و ثبت خطا در scope تغییر رمز', async () => {
    const { svc, throttle, updates } = setup(makeUser(await bcrypt.hash(OLD_PW, 4)))
    await expect(svc.changePassword(current, 'not-the-password', 'Brand#New9876', '9.9.9.9'))
      .rejects.toBeInstanceOf(UnauthorizedException)
    expect(throttle.recordFailure).toHaveBeenCalledWith('chg:t-1', 'u-1', '9.9.9.9')
    expect(updates).toHaveLength(0)
  })

  it('رمز جدید ضعیف: ۴۰۰ و رمز تغییر نمی‌کند', async () => {
    const { svc, updates } = setup(makeUser(await bcrypt.hash(OLD_PW, 4)))
    await expect(svc.changePassword(current, OLD_PW, '12345678')).rejects.toBeInstanceOf(BadRequestException)
    expect(updates).toHaveLength(0)
  })

  it('تغییر موفق: پرچم پاک، نشست‌های قبلی باطل، رویداد منتشر و توکن تازه بدون mustChangePassword', async () => {
    const { svc, jwt, events, throttle, updates } = setup(makeUser(await bcrypt.hash(OLD_PW, 4)))
    const res = await svc.changePassword(current, OLD_PW, 'Brand#New9876', '9.9.9.9')

    expect(updates).toHaveLength(1)
    expect(updates[0].sql).toMatch(/must_change_password = false/)
    expect(updates[0].sql).toMatch(/sessions_valid_after = now\(\)/)
    expect(await bcrypt.compare('Brand#New9876', updates[0].params[1] as string)).toBe(true)
    expect(throttle.recordSuccess).toHaveBeenCalledWith('chg:t-1', 'u-1', '9.9.9.9')
    expect(events.publish).toHaveBeenCalledWith('user.password_changed', { userId: 'u-1', tenantId: 't-1' })
    expect(res.user.mustChangePassword).toBeUndefined()
    expect(jwt.verify(res.accessToken)).toMatchObject({ sub: 'u-1', tenant_id: 't-1', typ: 'access' })
    expect(jwt.verify(res.refreshToken)).toMatchObject({ typ: 'refresh' })
  })

  it('نشست کودک (family) رمز ندارد: ۴۰۰', async () => {
    const { svc } = setup(undefined)
    await expect(svc.changePassword({ ...current, kind: 'family' }, 'a', 'b')).rejects.toBeInstanceOf(BadRequestException)
  })
})
