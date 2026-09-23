import {
  Body,
  Controller,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { EventsService } from '../events/events.service'

interface InitiateBody {
  chargeId: string
  gateway?: string
}

/**
 * پیاده‌سازی سناریوی «جریان پرداخت شارژ» — docs/SPEC.md بخش ۴.۱.
 * درگاه واقعی (زرین‌پال/آیدی‌پی) اینجا mock شده؛ نقاط اتصال واقعی با کامنت مشخص شده‌اند.
 */
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  @Post('initiate')
  async initiate(
    @Body() body: InitiateBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const tenantId = user.tenant_id!
    const key = idempotencyKey ?? randomUUID()

    return this.db.withTenant(tenantId, async (client) => {
      // idempotency: اگر این کلید قبلاً استفاده شده، همان رکورد قبلی برگردانده می‌شود
      // (جلوگیری از پرداخت دوباره در صورت retry شبکه‌ای از سمت کلاینت)
      const existing = await client.query(`SELECT * FROM finance.payments WHERE idempotency_key = $1`, [key])
      if (existing.rows[0]) return existing.rows[0]

      const chargeRes = await client.query(`SELECT * FROM finance.monthly_charges WHERE id = $1`, [body.chargeId])
      const charge = chargeRes.rows[0]
      if (!charge) throw new NotFoundException('شارژ یافت نشد')
      if (charge.status === 'paid') throw new ConflictException('این شارژ قبلاً پرداخت شده است')

      const res = await client.query(
        `INSERT INTO finance.payments (tenant_id, monthly_charge_id, amount, gateway, status, idempotency_key)
         VALUES ($1, $2, $3, $4, 'initiated', $5) RETURNING *`,
        [tenantId, body.chargeId, charge.total_amount, body.gateway ?? 'zarinpal', key],
      )

      // TODO Production: اینجا تماس واقعی با API درگاه (POST /request) برای گرفتن authority/redirect_url
      return { ...res.rows[0], redirectUrl: `https://sandbox.zarinpal.com/pg/StartPay/mock-${res.rows[0].id}` }
    })
  }

  /**
   * Webhook/callback درگاه — بدون JWT کاربر (خود درگاه صدا می‌زند).
   *
   * دو باگ نسخه‌ی قبل برطرف شده:
   *  ۱) امنیتی: هیچ امضایی بررسی نمی‌شد؛ هر کسی با داشتن paymentId می‌توانست شارژ را «پرداخت‌شده» کند.
   *     اکنون هدر X-Webhook-Signature = HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<tenantId>:<paymentId>:<success>")
   *     الزامی است و بدون تنظیم PAYMENT_WEBHOOK_SECRET این Endpoint کلاً غیرفعال است.
   *  ۲) عملکردی: جستجو با withPlatformAccess روی نقش app_user انجام می‌شد که RLS برایش FORCE است؛
   *     پس پرداخت هیچ‌وقت پیدا نمی‌شد (همیشه 404). اکنون tenantId در مسیر callback می‌آید و
   *     جستجو داخل withTenant انجام می‌شود.
   *
   * TODO Production: پیش از تأیید، API «verify» خود درگاه (زرین‌پال/آیدی‌پی) با authority و مبلغ فراخوانی شود.
   */
  @Public()
  @Post('webhook/:gateway/:tenantId')
  async webhook(
    @Param('gateway') gateway: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: { paymentId: string; success: boolean },
    @Headers('x-webhook-signature') signature: string | undefined,
  ) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET
    if (!secret) throw new ServiceUnavailableException('webhook پرداخت پیکربندی نشده است')
    const expected = createHmac('sha256', secret)
      .update(`${tenantId}:${body?.paymentId}:${body?.success === true}`)
      .digest('hex')
    const given = Buffer.from(signature ?? '', 'utf8')
    const want = Buffer.from(expected, 'utf8')
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      throw new UnauthorizedException('امضای webhook نامعتبر است')
    }

    return this.db.withTenant(tenantId, async (client) => {
      const paymentRes = await client.query(`SELECT * FROM finance.payments WHERE id = $1 FOR UPDATE`, [
        body.paymentId,
      ])
      const payment = paymentRes.rows[0]
      if (!payment || payment.gateway !== gateway) throw new NotFoundException('پرداخت یافت نشد')

      // idempotent: فراخوانی تکراری درگاه وضعیت نهایی را عوض نمی‌کند
      if (payment.status === 'success' || payment.status === 'failed') {
        return { status: payment.status }
      }

      if (body.success !== true) {
        await client.query(`UPDATE finance.payments SET status = 'failed' WHERE id = $1`, [body.paymentId])
        return { status: 'failed' }
      }

      await client.query(`UPDATE finance.payments SET status = 'success', paid_at = now() WHERE id = $1`, [
        body.paymentId,
      ])
      await client.query(`UPDATE finance.monthly_charges SET status = 'paid' WHERE id = $1`, [
        payment.monthly_charge_id,
      ])

      this.events.publish('payment.succeeded', { paymentId: payment.id, chargeId: payment.monthly_charge_id }, tenantId)
      return { status: 'success' }
    })
  }
}
