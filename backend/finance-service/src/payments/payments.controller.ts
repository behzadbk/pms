import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import type { Response } from 'express'
import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { EventsService } from '../events/events.service'
import { Roles } from '../auth/decorators/roles.decorator'
import { UNIT_ID_RE, assertUnitAccess } from '../common/unit-access'

interface InitiateBody {
  chargeId: string
  gateway?: string
}

/**
 * جریان پرداخت شارژ — docs/SPEC.md بخش ۴.۱. درگاه واقعی زرین‌پال (API نسخه‌ی ۴):
 *   initiate → POST /pg/v4/payment/request.json → authority → ریدایرکت کاربر به StartPay
 *   callback → GET برگشت از درگاه → POST /pg/v4/payment/verify.json → ثبت پرداخت و بستن شارژ
 * پیکربندی (env): ZARINPAL_MERCHANT_ID (الزامی)، ZARINPAL_SANDBOX=true (آزمایشی)،
 * PAYMENT_CALLBACK_BASE (مثلاً https://pms.example.ir/api/finance)، APP_PUBLIC_URL (مقصد بعد از پرداخت).
 * بدون ZARINPAL_MERCHANT_ID پرداخت آنلاین «پیکربندی نشده» (۵۰۳) می‌دهد؛ لینک ساختگی ساخته نمی‌شود.
 */
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  private zarinpal() {
    const merchant = process.env.ZARINPAL_MERCHANT_ID
    const callbackBase = process.env.PAYMENT_CALLBACK_BASE
    if (!merchant || !callbackBase) {
      throw new ServiceUnavailableException('درگاه پرداخت آنلاین برای این ساختمان پیکربندی نشده است؛ با مدیر تماس بگیرید')
    }
    const host = process.env.ZARINPAL_SANDBOX === 'true' ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com'
    return { merchant, host, callbackBase: callbackBase.replace(/\/$/, '') }
  }

  private async zpCall<T>(host: string, path: string, body: Record<string, unknown>): Promise<{ data?: T; errors?: unknown }> {
    try {
      const res = await fetch(`${host}/pg/v4/payment/${path}.json`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
      return (await res.json()) as { data?: T; errors?: unknown }
    } catch (err) {
      this.logger.error(`تماس با زرین‌پال ناموفق: ${(err as Error).message}`)
      throw new BadGatewayException('اتصال به درگاه پرداخت برقرار نشد؛ کمی بعد دوباره تلاش کنید')
    }
  }

  @Roles('resident', 'admin', 'accountant')
  @Post('initiate')
  async initiate(
    @Body() body: InitiateBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const tenantId = user.tenant_id!
    const key = idempotencyKey ?? randomUUID()
    if (!UNIT_ID_RE.test(body?.chargeId ?? '')) throw new NotFoundException('شارژ یافت نشد')
    const zp = this.zarinpal()

    return this.db.withTenant(tenantId, async (client) => {
      // idempotency: اگر این کلید قبلاً استفاده شده، همان رکورد قبلی برگردانده می‌شود
      // (جلوگیری از پرداخت دوباره در صورت retry شبکه‌ای از سمت کلاینت)
      const existing = await client.query(`SELECT * FROM finance.payments WHERE idempotency_key = $1`, [key])
      if (existing.rows[0]) {
        const e = existing.rows[0]
        return { ...e, redirectUrl: e.gateway_ref_id ? `${zp.host}/pg/StartPay/${e.gateway_ref_id}` : null }
      }

      const chargeRes = await client.query(`SELECT * FROM finance.monthly_charges WHERE id = $1`, [body.chargeId])
      const charge = chargeRes.rows[0]
      if (!charge) throw new NotFoundException('شارژ یافت نشد')
      await assertUnitAccess(client, user, charge.unit_id)
      if (charge.status === 'paid') throw new ConflictException('این شارژ قبلاً پرداخت شده است')

      const paymentId = randomUUID()
      const callbackUrl = `${zp.callbackBase}/payments/callback/zarinpal/${tenantId}/${paymentId}`
      const reply = await this.zpCall<{ code: number; authority: string }>(zp.host, 'request', {
        merchant_id: zp.merchant,
        amount: Number(charge.total_amount),
        currency: 'IRT',
        description: `شارژ ${String(charge.period)}`,
        callback_url: callbackUrl,
      })
      const authority = reply.data?.authority
      if (reply.data?.code !== 100 || !authority) {
        this.logger.warn(`زرین‌پال درخواست را نپذیرفت: ${JSON.stringify(reply.errors ?? reply.data)}`)
        throw new BadGatewayException('درگاه پرداخت درخواست را نپذیرفت؛ دوباره تلاش کنید')
      }

      const res = await client.query(
        `INSERT INTO finance.payments (id, tenant_id, monthly_charge_id, amount, gateway, gateway_ref_id, status, idempotency_key)
         VALUES ($1, $2, $3, $4, 'zarinpal', $5, 'initiated', $6) RETURNING *`,
        [paymentId, tenantId, body.chargeId, charge.total_amount, authority, key],
      )
      return { ...res.rows[0], redirectUrl: `${zp.host}/pg/StartPay/${authority}` }
    })
  }

  /**
   * برگشت کاربر از درگاه زرین‌پال (GET، بدون JWT چون مرورگر کاربر از درگاه برمی‌گردد).
   * اعتبار پرداخت فقط با «verify» خود زرین‌پال (authority + مبلغ ذخیره‌شده در دیتابیس) تأیید می‌شود،
   * نه با پارامترهای URL. سپس کاربر به صفحه‌ی شارژها هدایت می‌شود.
   */
  @Public()
  @Get('callback/zarinpal/:tenantId/:paymentId')
  async zarinpalCallback(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Query('Authority') authority: string | undefined,
    @Query('Status') status: string | undefined,
    @Res() res: Response,
  ) {
    const zp = this.zarinpal()
    const back = (result: 'success' | 'failed') => res.redirect(302, `${(process.env.APP_PUBLIC_URL ?? zp.callbackBase.replace(/\/api\/.*$/, '')).replace(/\/$/, '')}/resident/charges?payment=${result}`)

    const verdict = await this.db.withTenant(tenantId, async (client) => {
      const payment = (await client.query(`SELECT * FROM finance.payments WHERE id = $1 AND gateway = 'zarinpal' FOR UPDATE`, [paymentId])).rows[0]
      if (!payment) throw new NotFoundException('پرداخت یافت نشد')
      if (payment.status === 'success') return 'success' as const
      if (payment.status === 'failed') return 'failed' as const
      if (status !== 'OK' || !authority || authority !== payment.gateway_ref_id) {
        await client.query(`UPDATE finance.payments SET status = 'failed' WHERE id = $1`, [paymentId])
        return 'failed' as const
      }
      const v = await this.zpCall<{ code: number; ref_id?: number }>(zp.host, 'verify', { merchant_id: zp.merchant, amount: Number(payment.amount), authority })
      if (v.data?.code !== 100 && v.data?.code !== 101) {
        await client.query(`UPDATE finance.payments SET status = 'failed' WHERE id = $1`, [paymentId])
        return 'failed' as const
      }
      await client.query(`UPDATE finance.payments SET status = 'success', paid_at = now(), gateway_ref_id = COALESCE($2, gateway_ref_id) WHERE id = $1`, [paymentId, authority])
      await client.query(`UPDATE finance.monthly_charges SET status = 'paid', paid_at = now(), pay_method = 'درگاه آنلاین' WHERE id = $1`, [payment.monthly_charge_id])
      this.events.publish('payment.succeeded', { paymentId, chargeId: payment.monthly_charge_id, refId: v.data?.ref_id ?? null }, tenantId)
      return 'success' as const
    })
    return back(verdict)
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
   * این مسیر برای اطلاع‌رسانی امضاشده‌ی سرور به سرور (درگاه‌های دیگر) است؛ مسیر زرین‌پال همان callback بالاست.
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
      await client.query(`UPDATE finance.monthly_charges SET status = 'paid', paid_at = now(), pay_method = 'درگاه آنلاین' WHERE id = $1`, [
        payment.monthly_charge_id,
      ])

      this.events.publish('payment.succeeded', { paymentId: payment.id, chargeId: payment.monthly_charge_id }, tenantId)
      return { status: 'success' }
    })
  }
}
