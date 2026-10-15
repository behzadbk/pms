import { effectivePermissions, STAFF_DEPARTMENTS } from './staff.constants'

describe('دپارتمان نظافت و مسئول', () => {
  it('فقط یک دپارتمان نظافت داریم', () => {
    expect(STAFF_DEPARTMENTS.filter((d) => d.startsWith('cleaning'))).toEqual(['cleaning'])
  })
  it('کادر نظافت: کارهای نظافت + نگهداری، بدون پنل مسئول', () => {
    const p = effectivePermissions('cleaning', [])
    expect(p).toEqual(expect.arrayContaining(['housekeeping', 'maintenance']))
    expect(p).not.toContain('cleaning_supervisor')
  })
  it('مسئول نظافت، دسترسی تابلو را هم می‌گیرد', () => {
    expect(effectivePermissions('cleaning', [], true)).toContain('cleaning_supervisor')
  })
  it('مسئول بودن در بخش‌های دیگر دسترسی نمی‌دهد', () => {
    expect(effectivePermissions('lobby', [], true)).toEqual(['lobby'])
  })
  it('دسترسی cleaning_supervisor را نمی‌شود دستی داد', () => {
    expect(effectivePermissions('lobby', ['cleaning_supervisor'])).toEqual(['lobby'])
  })
})
