import { pickStaffSource } from './ledger.module'
import { DemoStaffSource, NoStaffSource } from './staff.sources'

describe('منبع حقوق', () => {
  it('پیش‌فرض: اتصال برقرار نیست و هیچ داده‌ای نمی‌سازد', async () => {
    const s = pickStaffSource({} as NodeJS.ProcessEnv)
    expect(s).toBeInstanceOf(NoStaffSource)
    const p = await s.staffProfile({ id: 'x', full_name: 'الف', department: 'lobby', is_active: true })
    expect(p.available).toBe(false)
    expect(p.payslips).toHaveLength(0)
  })
  it('demo در production هرگز فعال نمی‌شود', () => {
    expect(pickStaffSource({ ACCOUNTING_STAFF_SOURCE: 'demo', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBeInstanceOf(NoStaffSource)
    expect(pickStaffSource({ ACCOUNTING_STAFF_SOURCE: 'demo', NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBeInstanceOf(DemoStaffSource)
  })
  it('demo قطعی است و مانده = خالص − پرداخت‌شده', async () => {
    const d = new DemoStaffSource()
    const st = { id: 'abc-1', full_name: 'ب', department: 'cafe', is_active: true }
    const a = await d.staffProfile(st), b = await d.staffProfile(st)
    expect(a).toEqual(b)
    expect(a.summary.balance).toBe(a.summary.total_net - a.summary.total_paid)
  })
})
