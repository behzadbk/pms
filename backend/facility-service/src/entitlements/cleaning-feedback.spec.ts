import { BadRequestException } from '@nestjs/common'
import { cleanFeedback, FEEDBACK_REASONS, reasonLabel } from './cleaning-feedback'

describe('بازخورد نظافت — اعتبارسنجی', () => {
  it('۴ و ۵ ستاره فقط نمره است؛ دلیل نادیده گرفته می‌شود', () => {
    expect(cleanFeedback({ rating: 5 })).toEqual({ rating: 5, reasons: [], comment: null })
    expect(cleanFeedback({ rating: 4, reasons: ['late'], comment: ' عالی ' })).toEqual({ rating: 4, reasons: [], comment: 'عالی' })
  })
  it('۱ تا ۳ ستاره بدون دلیل و بدون متن رد می‌شود', () => {
    for (const rating of [1, 2, 3]) expect(() => cleanFeedback({ rating })).toThrow(BadRequestException)
    expect(() => cleanFeedback({ rating: 2, reasons: [], comment: '   ' })).toThrow(BadRequestException)
  })
  it('دلیل آماده یا متن آزاد (یا هر دو) کافی است؛ تکراری‌ها حذف می‌شوند', () => {
    expect(cleanFeedback({ rating: 3, reasons: ['late', 'late', 'not_clean'] }).reasons).toEqual(['late', 'not_clean'])
    expect(cleanFeedback({ rating: 1, comment: 'پنجره‌ها شسته نشد' })).toEqual({ rating: 1, reasons: [], comment: 'پنجره‌ها شسته نشد' })
    expect(cleanFeedback({ rating: 2, reasons: ['damage'], comment: 'گلدان شکست' })).toMatchObject({ reasons: ['damage'], comment: 'گلدان شکست' })
  })
  it('نمره‌ی نامعتبر و دلیل ناشناخته رد می‌شود', () => {
    for (const rating of [0, 6, 2.5, '3x', null, undefined]) expect(() => cleanFeedback({ rating, comment: 'x' })).toThrow(BadRequestException)
    expect(() => cleanFeedback({ rating: 2, reasons: ['hack'] })).toThrow(BadRequestException)
    expect(() => cleanFeedback({ rating: 2, reasons: [1 as unknown as string] })).toThrow(BadRequestException)
  })
  it('متن آزاد به ۳۰۰ نویسه بریده می‌شود و برچسب‌ها کامل‌اند', () => {
    expect(cleanFeedback({ rating: 1, comment: 'الف'.repeat(500) }).comment).toHaveLength(300)
    expect(FEEDBACK_REASONS.every((r) => reasonLabel(r.code) === r.label)).toBe(true)
    expect(reasonLabel('zzz')).toBe('zzz')
  })
})
