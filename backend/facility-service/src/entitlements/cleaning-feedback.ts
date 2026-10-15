import { BadRequestException } from '@nestjs/common'

/** دلیل‌های آماده‌ی نمره‌ی کم (کد ثابت در دیتابیس؛ برچسب برای نمایش). ترتیب = ترتیب نمایش. */
export const FEEDBACK_REASONS = [
  { code: 'not_clean', label: 'تمیز نشد' },
  { code: 'missed_spots', label: 'بعضی جاها نظافت نشد' },
  { code: 'short_time', label: 'زمان نظافت کم بود' },
  { code: 'late', label: 'دیر آمد یا زود رفت' },
  { code: 'mess', label: 'وسایل جابه‌جا شد و سر جایش نیامد' },
  { code: 'damage', label: 'آسیب یا شکستگی' },
  { code: 'behavior', label: 'رفتار مناسب نبود' },
] as const

export const REASON_CODES: string[] = FEEDBACK_REASONS.map((r) => r.code)
/** ساکن تا این‌قدر بعد از نظافت می‌تواند نظر بدهد */
export const RATING_WINDOW_DAYS = 14
/** نمره‌ی این مقدار یا کمتر «بد» است: دلیل لازم است و برای مدیر و مسئول نظافت اعلان می‌رود */
export const LOW_RATING_MAX = 3
export const COMMENT_MAX = 300

export interface CleanFeedback {
  rating: number
  reasons: string[]
  comment: string | null
}

/**
 * اعتبارسنجی و پاک‌سازی بازخورد: نمره‌ی صحیح ۱ تا ۵؛ دلیل‌ها فقط از فهرست آماده (بی‌تکرار)؛ متن آزاد حداکثر ۳۰۰.
 * نمره‌ی ۴ و ۵ دلیل نمی‌گیرد (نادیده گرفته می‌شود)؛ نمره‌ی ۱ تا ۳ باید دلیل آماده یا متن داشته باشد.
 */
export function cleanFeedback(input: { rating: unknown; reasons?: unknown; comment?: unknown }): CleanFeedback {
  const rating = Number(input.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new BadRequestException('نمره باید ۱ تا ۵ ستاره باشد')

  const comment = typeof input.comment === 'string' ? input.comment.trim().slice(0, COMMENT_MAX) || null : null
  if (rating > LOW_RATING_MAX) return { rating, reasons: [], comment }

  const raw = Array.isArray(input.reasons) ? input.reasons : []
  const unknown = raw.find((r) => typeof r !== 'string' || !REASON_CODES.includes(r))
  if (unknown !== undefined) throw new BadRequestException('دلیل نامعتبر است')
  const reasons = [...new Set(raw as string[])]
  if (reasons.length === 0 && !comment) throw new BadRequestException('لطفاً دلیل نمره را انتخاب کنید یا بنویسید')
  return { rating, reasons, comment }
}

export const reasonLabel = (code: string) => FEEDBACK_REASONS.find((r) => r.code === code)?.label ?? code
