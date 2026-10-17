import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'

/**
 * تبدیل خطاهای «ورودی نامعتبر» PostgreSQL به پاسخ 4xx به‌جای 500.
 *
 * بدون این فیلتر، یک شناسه‌ی غیر-UUID در URL (مثلاً /units/abc) یا تاریخ نامعتبر در query string
 * مستقیم به دیتابیس می‌رسید و «Internal server error» برمی‌گشت — هم تجربه‌ی کاربری بد، هم
 * آلارم‌های کاذب در مانیتورینگ. خطاهای ناشناخته دست‌نخورده به فیلتر پیش‌فرض Nest سپرده می‌شوند.
 */
const PG_CODE_TO_HTTP: Record<string, { status: number; message: string }> = {
  '22P02': { status: HttpStatus.BAD_REQUEST, message: 'قالب یکی از مقادیر ورودی نامعتبر است' },
  '22007': { status: HttpStatus.BAD_REQUEST, message: 'قالب تاریخ نامعتبر است' },
  '22008': { status: HttpStatus.BAD_REQUEST, message: 'تاریخ خارج از محدوده است' },
  '22003': { status: HttpStatus.BAD_REQUEST, message: 'عدد خارج از محدوده است' },
  '23502': { status: HttpStatus.BAD_REQUEST, message: 'یک فیلد الزامی ارسال نشده است' },
  '23503': { status: HttpStatus.BAD_REQUEST, message: 'رکورد مرتبط یافت نشد' },
  '23505': { status: HttpStatus.CONFLICT, message: 'این رکورد قبلاً ثبت شده است' },
  '23514': { status: HttpStatus.BAD_REQUEST, message: 'مقدار ورودی مجاز نیست' },
  '42501': { status: HttpStatus.FORBIDDEN, message: 'دسترسی به این داده مجاز نیست' },
  '23P01': { status: HttpStatus.CONFLICT, message: 'این بازه‌ی زمانی قبلاً رزرو شده است' },
}

/** خطاهایی که trigger/constraint دیتابیس با پیام فارسی خودش می‌سازد (RAISE … HINT) → 409 با همان پیام */
const PG_HINT_TO_HTTP: Record<string, number> = {
  unit_head_required: HttpStatus.CONFLICT,
}

/** کدهای PG/شبکه که یعنی «موقتاً در دسترس نیست»: قطع/ری‌استارت دیتابیس، پر بودن max_connections، لغو کوئری با statement_timeout */
const UNAVAILABLE_CODES = new Set(['57P01', '57P02', '57P03', '53300', '57014', '08000', '08001', '08003', '08006', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'])

@Catch()
export class PgExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PgExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const code = (exception as { code?: unknown })?.code
    const hint = (exception as { hint?: unknown })?.hint
    if (typeof hint === 'string' && PG_HINT_TO_HTTP[hint] && host.getType() === 'http') {
      const status = PG_HINT_TO_HTTP[hint]
      const res = host.switchToHttp().getResponse()
      return res.status(status).json({ statusCode: status, message: (exception as Error).message, code: hint })
    }
    const mapped = typeof code === 'string' ? PG_CODE_TO_HTTP[code] : undefined
    if (mapped && host.getType() === 'http') {
      this.logger.warn(`PG ${code}: ${(exception as Error).message}`)
      const res = host.switchToHttp().getResponse()
      return res.status(mapped.status).json({ statusCode: mapped.status, message: mapped.message })
    }
    // دیتابیس در دسترس نیست / pool پر است / کوئری از statement_timeout گذشت → 503 قابل‌تلاش‌مجدد، نه 500 مبهم
    const msg = String((exception as { message?: unknown })?.message ?? '')
    if (
      host.getType() === 'http' &&
      ((typeof code === 'string' && UNAVAILABLE_CODES.has(code)) || /timeout exceeded when trying to connect|Connection terminated|the database system is (starting up|shutting down)/i.test(msg))
    ) {
      this.logger.error(`DB unavailable (${String(code ?? 'no-code')}): ${msg}`)
      const res = host.switchToHttp().getResponse()
      res.setHeader('Retry-After', '5')
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ statusCode: HttpStatus.SERVICE_UNAVAILABLE, message: 'سرویس موقتاً در دسترس نیست؛ چند لحظه دیگر دوباره تلاش کنید' })
    }
    return super.catch(exception, host)
  }
}
