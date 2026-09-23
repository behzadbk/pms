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
  if (depth > 6 || value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.includes(k.toLowerCase().replace(/[-\s]/g, ''))
      ? '[REDACTED]'
      : redact(v, depth + 1)
  }
  return out
}
