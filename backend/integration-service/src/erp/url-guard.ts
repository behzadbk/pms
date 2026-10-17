import { isIP } from 'net'

/**
 * محافظ SSRF برای URL مقصد connector: در production فقط https و فقط آدرس عمومی.
 * (کاربر پنل نباید بتواند سرور ما را وادار به ارسال درخواست به سرویس‌های داخلی مثل postgres/rabbitmq کند.)
 * در توسعه یا با ERP_ALLOW_INSECURE_URLS=true محدودیت برداشته می‌شود — مثلاً ERP داخل شبکه‌ی محلی مجتمع.
 */
export function allowInsecureUrls(): boolean {
  return process.env.ERP_ALLOW_INSECURE_URLS === 'true' || process.env.NODE_ENV !== 'production'
}

function privateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (!h.includes('.') && !isIP(h)) return true // نام‌های داخلی docker مثل postgres، finance-svc
  if (isIP(h) === 4) {
    const [a, b] = h.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (isIP(h) === 6) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h === '::'
  return false
}

/** null = مجاز؛ در غیر این صورت پیام خطا */
export function checkConnectorUrl(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return 'آدرس نامعتبر است'
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'فقط http/https مجاز است'
  if (u.username || u.password) return 'نام کاربری/رمز را در آدرس قرار ندهید؛ از secret امضا استفاده کنید'
  if (allowInsecureUrls()) return null
  if (u.protocol !== 'https:') return 'در محیط عملیاتی فقط آدرس https مجاز است'
  if (privateHost(u.hostname)) return 'آدرس شبکه‌ی داخلی مجاز نیست (برای ERP داخل شبکه‌ی مجتمع از حالت pull استفاده کنید)'
  return null
}
