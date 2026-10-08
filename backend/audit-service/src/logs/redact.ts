const SENSITIVE_KEYS = [
  'password', 'passwordhash', 'password_hash', 'token', 'accesstoken', 'access_token',
  'refreshtoken', 'refresh_token', 'authorization', 'apikey', 'api_key', 'secret',
  'cardnumber', 'card_number', 'cvv', 'pin', 'nationalid', 'national_id', 'ssn',
]

/**
 * پاک‌سازی فیلدهای حساس پیش از درج در دیتابیس — بخش ۲.۲ سند
 * docs/UPDATE-V2-AUDIT-FNB-DESIGN.md. عمداً در audit-svc انجام می‌شود (نه در کلاینت
 * یا سرویس مبدأ) تا حتی اگر یک سرویس اشتباهاً داده حساس بفرستد، در لاگ ذخیره نشود.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  // محافظ حلقه و ساختارهای خیلی عمیق: از عمق ۶ به بعد، آبجکت/آرایه به‌جای «برگرداندن بدون پاک‌سازی» کوتاه می‌شود.
  // (قبلاً فیلد حساسی که عمیق‌تر از ۶ سطح تودرتو بود، مثلاً password در ۷ لایه، عیناً در لاگ ذخیره می‌شد.)
  if (depth > 6) return typeof value === 'object' ? '[TRUNCATED]' : value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // کلید قبل از مقایسه کوچک‌حرف و بدون خط‌تیره/فاصله می‌شود تا 'Access-Token' و 'accessToken' هر دو با 'accesstoken' بخوانند؛
    // زیرخط حذف نمی‌شود، برای همین هر دو شکل (access_token و accesstoken) در فهرست آمده‌اند.
    out[k] = SENSITIVE_KEYS.includes(k.toLowerCase().replace(/[-\s]/g, ''))
      ? '[REDACTED]'
      : redact(v, depth + 1)
  }
  return out
}
