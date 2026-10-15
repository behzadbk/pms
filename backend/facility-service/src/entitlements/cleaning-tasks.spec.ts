import { canMove, checkWantDate, taskTitle } from './cleaning-tasks'

describe('cleaning-tasks', () => {
  it('عنوان کار منزل خودکار است', () => {
    expect(taskTitle({ kind: 'unit', unitNumber: '۱۰۱' })).toBe('نظافت منزل — واحد ۱۰۱')
  })
  it('مشاعات و موردی عنوان لازم دارند', () => {
    expect(() => taskTitle({ kind: 'common', title: ' ' })).toThrow()
    expect(taskTitle({ kind: 'common', title: 'لابی' })).toBe('نظافت لابی')
    expect(taskTitle({ kind: 'custom', title: 'شست‌وشوی شیشه‌ها' })).toBe('شست‌وشوی شیشه‌ها')
  })
  it('تاریخ دلخواه: گذشته و خیلی دور رد می‌شود', () => {
    expect(checkWantDate(null, '2026-10-15')).toBeNull()
    expect(checkWantDate('2026-10-15', '2026-10-15')).toBe('2026-10-15')
    expect(() => checkWantDate('2026-10-14', '2026-10-15')).toThrow()
    expect(() => checkWantDate('2026-12-30', '2026-10-15')).toThrow()
    expect(() => checkWantDate('x', '2026-10-15')).toThrow()
  })
  it('گذارهای وضعیت', () => {
    expect(canMove('new', 'assigned')).toBe(true)
    expect(canMove('assigned', 'in_progress')).toBe(true)
    expect(canMove('in_progress', 'cancelled')).toBe(false)
    expect(canMove('cancelled', 'assigned')).toBe(false)
  })
})
