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
}

@Catch()
export class PgExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PgExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const code = (exception as { code?: unknown })?.code
    const mapped = typeof code === 'string' ? PG_CODE_TO_HTTP[code] : undefined
    if (mapped && host.getType() === 'http') {
      this.logger.warn(`PG ${code}: ${(exception as Error).message}`)
      const res = host.switchToHttp().getResponse()
      return res.status(mapped.status).json({ statusCode: mapped.status, message: mapped.message })
    }
    return super.catch(exception, host)
  }
}
