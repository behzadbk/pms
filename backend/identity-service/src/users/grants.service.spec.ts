import { BadRequestException, NotFoundException } from '@nestjs/common'
import { GrantsService } from './grants.service'
import { effectivePermissions, MAX_GRANT_DAYS } from './staff.constants'

const TENANT = '11111111-1111-1111-1111-111111111111'
const STAFF = '22222222-2222-2222-2222-222222222222'
const ADMIN = '33333333-3333-3333-3333-333333333333'

function make(queryImpl: (sql: string, params: unknown[]) => { rows: unknown[] }) {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const client = { query: jest.fn(async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return queryImpl(sql, params) }) }
  const db = { withTenant: jest.fn(async (_t: string, fn: (c: unknown) => unknown) => fn(client)) }
  const events = { publish: jest.fn() }
  return { svc: new GrantsService(db as never, events as never), calls, events, db }
}
const day = 86_400_000
const row = (over: Record<string, unknown> = {}) => ({
  id: 'g1', user_id: STAFF, permission: 'lobby', granted_by: ADMIN,
  starts_at: new Date(Date.now() - 1000), expires_at: new Date(Date.now() + day), revoked_at: null, created_at: new Date(), ...over,
})

describe('effectivePermissions با دسترسی موقت', () => {
  it('موقت با پیش‌فرض دپارتمان و دستی ادغام و یکتا می‌شود', () => {
    expect(effectivePermissions('lobby', ['kitchen'], ['kitchen', 'cafe']).sort()).toEqual(['cafe', 'kitchen', 'lobby'])
  })
  it('مقدار نامعتبر موقت نادیده گرفته می‌شود و بدون موقت رفتار قبلی حفظ است', () => {
    expect(effectivePermissions('lobby', null, ['hacker'])).toEqual(['lobby'])
    expect(effectivePermissions('lobby', null)).toEqual(['lobby'])
  })
})

describe('GrantsService', () => {
  it('create: tenant و granted_by از ورودی سرور می‌آید و رویداد منتشر می‌شود', async () => {
    const { svc, calls, events } = make((sql) => (sql.includes('FROM identity.users') ? { rows: [{}] } : { rows: [row()] }))
    const out = await svc.create(TENANT, STAFF, { permission: 'lobby', expiresAt: new Date(Date.now() + day).toISOString() }, ADMIN)
    const ins = calls.find((c) => c.sql.includes('INSERT'))!
    expect(ins.params.slice(0, 4)).toEqual([TENANT, STAFF, 'lobby', ADMIN])
    expect(out.status).toBe('active')
    expect(events.publish).toHaveBeenCalledWith('staff.grant.created', expect.objectContaining({ by: ADMIN, userId: STAFF }))
  })
  it('create: تاریخ پایان گذشته / قبل از شروع / بیش از سقف رد می‌شود (بدون هیچ query)', async () => {
    const { svc, db } = make(() => ({ rows: [] }))
    await expect(svc.create(TENANT, STAFF, { permission: 'lobby', expiresAt: new Date(Date.now() - 1000).toISOString() }, ADMIN)).rejects.toBeInstanceOf(BadRequestException)
    await expect(svc.create(TENANT, STAFF, { permission: 'lobby', startsAt: new Date(Date.now() + 2 * day).toISOString(), expiresAt: new Date(Date.now() + day).toISOString() }, ADMIN)).rejects.toBeInstanceOf(BadRequestException)
    await expect(svc.create(TENANT, STAFF, { permission: 'lobby', expiresAt: new Date(Date.now() + (MAX_GRANT_DAYS + 1) * day).toISOString() }, ADMIN)).rejects.toBeInstanceOf(BadRequestException)
    expect(db.withTenant).not.toHaveBeenCalled()
  })
  it('create/list: کاربر غیر staff (مثلاً ساکن/ادمین) → 404', async () => {
    const { svc } = make(() => ({ rows: [] }))
    await expect(svc.create(TENANT, STAFF, { permission: 'lobby', expiresAt: new Date(Date.now() + day).toISOString() }, ADMIN)).rejects.toBeInstanceOf(NotFoundException)
    await expect(svc.list(TENANT, STAFF)).rejects.toBeInstanceOf(NotFoundException)
  })
  it('revoke: فقط UPDATE revoked_at (نه DELETE)؛ ردیف نبود/قبلاً لغو شده → 404', async () => {
    const ok = make(() => ({ rows: [row({ revoked_at: new Date() })] }))
    const out = await ok.svc.revoke(TENANT, STAFF, 'g1', ADMIN)
    expect(out.status).toBe('revoked')
    expect(ok.calls[0].sql).toMatch(/UPDATE identity\.user_permission_grants SET revoked_at/)
    expect(ok.calls[0].sql).not.toMatch(/DELETE/)
    expect(ok.calls[0].params).toEqual(['g1', STAFF])
    const none = make(() => ({ rows: [] }))
    await expect(none.svc.revoke(TENANT, STAFF, 'g1', ADMIN)).rejects.toBeInstanceOf(NotFoundException)
  })
})
