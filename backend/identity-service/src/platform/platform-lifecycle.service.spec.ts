import { PlatformLifecycleService } from './platform-lifecycle.service'

/** #84: خطای یک مرحله‌ی پس از commit نباید مراحل دیگر یا ساختمان‌های دیگر را از بین ببرد */
describe('PlatformLifecycleService.tick post-commit resilience', () => {
  const debt = [
    { id: 't1', name: 'A', days: 40 },
    { id: 't2', name: 'B', days: 50 },
  ]

  function build(opts: { revoke?: (id: string) => Promise<unknown>; audit?: (...a: unknown[]) => Promise<unknown> }) {
    const withPlatformAccess = jest.fn(async () => ({ overdue: [], debt, trial: [] }))
    const withTenant = jest.fn((id: string) => (opts.revoke ?? (async () => undefined))(id))
    const db = { withPlatformAccess, withTenant } as any
    const events = { publish: jest.fn() } as any
    const audit = { log: jest.fn(opts.audit ?? (async () => undefined)) } as any
    const settings = { get: jest.fn(async () => ({ autoSuspend: true, autoSuspendTrial: false, graceDays: 30 })) } as any
    const svc = new PlatformLifecycleService(db, events, audit, settings)
    return { svc, withTenant, events, audit }
  }

  it('continues with remaining tenants when revokeSessions throws for one', async () => {
    const { svc, withTenant, events, audit } = build({
      revoke: async (id) => {
        if (id === 't1') throw new Error('boom')
      },
    })
    const r = await svc.tick()
    expect(r.suspendedForDebt).toBe(2)
    expect(withTenant).toHaveBeenCalledTimes(2)
    // audit برای هر دو ثبت شده (قبل از ابطال نشست) و رویداد هر دو منتشر شده
    expect(audit.log).toHaveBeenCalledTimes(2)
    expect(events.publish).toHaveBeenCalledTimes(2)
  })

  it('still revokes sessions and publishes when audit.log throws', async () => {
    const { svc, withTenant, events } = build({ audit: async () => { throw new Error('audit down') } })
    await expect(svc.tick()).resolves.toMatchObject({ ran: true, suspendedForDebt: 2 })
    expect(withTenant).toHaveBeenCalledTimes(2)
    expect(events.publish).toHaveBeenCalledTimes(2)
  })
})
