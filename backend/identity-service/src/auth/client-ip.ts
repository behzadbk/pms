/**
 * IP کلاینت برای کلید محدودسازی ورود/کد خانواده.
 *
 * gateway (nginx) هدر X-Forwarded-For را با IP واقعیِ اتصال بازنویسی می‌کند (نه «اضافه»)، و Ingress کوبرنتیز IP کلاینت را
 * به انتهای هدر می‌افزاید. پس معتبر، «آخرین» مقدار است؛ مقدارهای قبلی را خود کلاینت می‌تواند جعل کند (قبلاً اولین مقدار
 * خوانده می‌شد و مهاجم با یک هدر ساختگی کلید IP را هر بار عوض می‌کرد و قفل per-IP را دور می‌زد).
 */
export function clientIp(req: any): string {
  const parts = String(req?.headers?.['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const last = parts[parts.length - 1]
  return last || req?.ip || req?.socket?.remoteAddress || ''
}
