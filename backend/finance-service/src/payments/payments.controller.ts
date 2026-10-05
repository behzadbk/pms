import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  BadGatewayException,
  Logger,
} from '@nestjs/common'
import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import type { Response } from 'express'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { FINANCE_ACCESS_SQL } from '../billing/notify'
import { PaymentsService } from './payments.service'
import { resolveGateway } from './gateway'
import { periodLabel } from '../common/jalali'

interface InitiateBody {
  chargeId: string
  gateway?: string
}

/**
 * جریان پرداخت آنلاین شارژ — docs/SPEC.md بخش ۴.۱.
 *  - درگاه واقعی/سندباکس (زرین‌پال) فقط با ZARINPAL_MERCHANT_ID فعال است؛ بدون آن هیچ «موفقیت ساختگی»ای
 *    وجود ندارد: initiate با ۵۰۳ و پیام روشن رد می‌شود و ساکن باید از «ثبت پرداخت دستی» حسابداری استفاده کند.
 *  - تأیید نهایی همیشه با verify خود درگاه انجام می‌شود (نه اعتماد به پارامترهای callback).
 */
@Controller('payments')
export class PaymentsController {
  private readonly log = new Logger(PaymentsController.name)

  constructor(private readonly db: DatabaseService, private readonly payments: PaymentsService) {}

  /** آیا پرداخت آنلاین پیکربندی شده؟ (برای نمایش/مخفی‌کردن دکمه‌ی پرداخت در UI) */
  @Get('gateway')
  gateway() {
    const g = resolveGateway('zarinpal')
    return { online: !!g, gateway: g?.name ?? null, sandbox: g?.sandbox ?? false }
  }

  @Roles('resident')
  @Post('initiate')
  async initiate(@Body() body: InitiateBody, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentUser() user: JwtPayload) {
    const tenantId = user.tenant_id!
    if (!body?.chargeId || !/^[0-9a-f-]{36}$/i.test(body.chargeId)) throw new BadRequestException('شناسه‌ی شارژ نامعتبر است')
    const gw = resolveGateway(body.gateway)
    if (!gw) {
      throw new ServiceUnavailableException('درگاه پرداخت آنلاین برای این ساختمان فعال نیست. لطفاً مبلغ را به‌صورت کارت‌به‌کارت/نقدی پرداخت کنید تا حسابداری «ثبت پرداخت» را انجام دهد.')
    }
    const key = idempotencyKey ?? randomUUID()

    return this.db.withTenant(tenantId, async (client) => {
      const existing = await client.query(`SELECT * FROM finance.payments WHERE idempotency_key = $1`, [key])
      if (existing.rows[0]) return existing.rows[0]

      const chargeRes = await client.query(
        `SELECT c.* FROM finance.monthly_charges c
          WHERE c.id = $1 AND EXISTS (SELECT 1 FROM residency.memberships m WHERE m.unit_id = c.unit_id AND m.user_id = $2 AND ${FINANCE_ACCESS_SQL})`,
        [body.chargeId, user.pid ?? null],
      )
      const charge = chargeRes.rows[0]
      if (!charge) throw new NotFoundException('شارژ یافت نشد')
      if (charge.status === 'paid') throw new ConflictException('این شارژ قبلاً پرداخت شده است')

      const ins = await client.query(
        `INSERT INTO finance.payments (tenant_id, monthly_charge_id, amount, gateway, status, idempotency_key, method)
         VALUES ($1, $2, $3, $4, 'initiated', $5, 'online') RETURNING *`,
        [tenantId, charge.id, charge.total_amount, gw.name, key],
      )
      const payment = ins.rows[0]
      const base = (process.env.PAYMENT_CALLBACK_BASE ?? '').replace(/\/$/, '')
      if (!base) throw new ServiceUnavailableException('آدرس بازگشت درگاه (PAYMENT_CALLBACK_BASE) تنظیم نشده است')
      try {
        const r = await gw.request({
          amount: charge.total_amount,
          description: `شارژ ${periodLabel(charge.period)}`,
          callbackUrl: `${base}/payments/callback/${gw.name}/${tenantId}/${payment.id}`,
          metadata: { charge_id: charge.id },
        })
        await client.query(`UPDATE finance.payments SET gateway_ref_id = $2 WHERE id = $1`, [payment.id, r.authority])
        return { ...payment, gateway_ref_id: r.authority, redirectUrl: r.redirectUrl }
      } catch (e) {
        this.log.warn(`gateway request failed: ${(e as Error).message}`)
        await client.query(`UPDATE finance.payments SET status = 'failed' WHERE id = $1`, [payment.id])
        throw new BadGatewayException('اتصال به درگاه پرداخت برقرار نشد؛ کمی بعد دوباره تلاش کنید')
      }
    })
  }

  /** بازگشت کاربر از درگاه (GET) — بدون JWT؛ تأیید با verify درگاه و سپس ریدایرکت به UI */
  @Public()
  @Get('callback/:gateway/:tenantId/:paymentId')
  async callback(
    @Param('gateway') gateway: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Query('Authority') authority: string | undefined,
    @Query('Status') status: string | undefined,
    @Res() res: Response,
  ) {
    const back = process.env.PAYMENT_RETURN_URL ?? '/resident/charges'
    const redirect = (ok: boolean) => res.redirect(302, `${back}${back.includes('?') ? '&' : '?'}pay=${ok ? 'success' : 'failed'}`)
    const gw = resolveGateway(gateway)
    if (!gw) return redirect(false)
    try {
      const ok = await this.db.withTenant(tenantId, async (client) => {
        const p = await client.query(`SELECT * FROM finance.payments WHERE id = $1 FOR UPDATE`, [paymentId])
        const payment = p.rows[0]
        if (!payment || payment.gateway !== gw.name || !authority || payment.gateway_ref_id !== authority) return false
        if (payment.status === 'success') return true
        if (status !== 'OK') {
          await client.query(`UPDATE finance.payments SET status = 'failed' WHERE id = $1 AND status = 'initiated'`, [paymentId])
          return false
        }
        const v = await gw.verify({ authority, amount: payment.amount })
        if (!v.ok) {
          await client.query(`UPDATE finance.payments SET status = 'failed' WHERE id = $1 AND status = 'initiated'`, [paymentId])
          return false
        }
        await this.payments.settle(client, tenantId, paymentId, { method: 'online', refId: v.refId })
        return true
      })
      return redirect(ok)
    } catch (e) {
      this.log.warn(`callback failed: ${(e as Error).message}`)
      return redirect(false)
    }
  }

  /**
   * Webhook امضادار برای درگاه‌هایی که server-to-server اعلام می‌کنند.
   * X-Webhook-Signature = HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<tenantId>:<paymentId>:<success>")؛
   * بدون تنظیم PAYMENT_WEBHOOK_SECRET کل endpoint غیرفعال است.
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
    const expected = createHmac('sha256', secret).update(`${tenantId}:${body?.paymentId}:${body?.success === true}`).digest('hex')
    const given = Buffer.from(signature ?? '', 'utf8')
    const want = Buffer.from(expected, 'utf8')
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new UnauthorizedException('امضای webhook نامعتبر است')

    return this.db.withTenant(tenantId, async (client) => {
      const paymentRes = await client.query(`SELECT * FROM finance.payments WHERE id = $1 FOR UPDATE`, [body.paymentId])
      const payment = paymentRes.rows[0]
      if (!payment || payment.gateway !== gateway) throw new NotFoundException('پرداخت یافت نشد')
      if (payment.status === 'success' || payment.status === 'failed') return { status: payment.status }
      if (body.success !== true) {
        await client.query(`UPDATE finance.payments SET status = 'failed' WHERE id = $1`, [body.paymentId])
        return { status: 'failed' }
      }
      await this.payments.settle(client, tenantId, body.paymentId, { method: 'online' })
      return { status: 'success' }
    })
  }
}
