import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { EventsService } from '../events/events.service'
import { GuardGateway } from '../realtime/guard.gateway'

interface IssuePassBody {
  guestName: string
  validUntil: string // ISO
  maxUses?: number
}

/**
 * پیاده‌سازی دقیق pseudocode «پنل فوق‌ساده نگهبانی» — docs/FEATURES-DEEP-DIVE.md بخش ۷.۳
 * (guardQuickCheckIn / guardConfirmCheckIn).
 */
@Controller()
export class GuestPassesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly gateway: GuardGateway,
  ) {}

  @Roles('resident', 'admin')
  @Post('units/:unitId/guest-passes')
  async issue(
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() body: IssuePassBody,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!body?.guestName?.trim()) throw new BadRequestException('نام مهمان الزامی است')
    const validUntil = new Date(body.validUntil)
    if (Number.isNaN(validUntil.getTime()) || validUntil <= new Date()) {
      throw new BadRequestException('زمان پایان اعتبار باید در آینده باشد')
    }
    const maxUses = body.maxUses ?? 1
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 50) {
      throw new BadRequestException('تعداد دفعات استفاده باید بین ۱ و ۵۰ باشد')
    }
    const code = randomInt(100000, 999999).toString()
    return this.db.withTenant(user.tenant_id!, async (client) => {
      // ساکن فقط برای واحدی که به آن متصل است (مالک/مستأجر) می‌تواند کد مهمان صادر کند
      if (user.role === 'resident') {
        const link = await client.query(
          'SELECT 1 FROM property.user_unit_links WHERE user_id = $1 AND unit_id = $2',
          [user.sub, unitId],
        )
        if (!link.rowCount) throw new ForbiddenException('شما به این واحد دسترسی ندارید')
      }
      const res = await client.query(
        `INSERT INTO guard.guest_passes (tenant_id, unit_id, issued_by, guest_name, code, valid_until, max_uses)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [user.tenant_id, unitId, user.sub, body.guestName.trim(), code, validUntil, maxUses],
      )
      return res.rows[0]
    })
  }

  /**
   * فقط بررسی — بدون ثبت (نگهبان پیش از تایید نهایی نتیجه را می‌بیند).
   * توجه: چون نگهبان کد را از یک مهمان می‌گیرد که ممکن است tenant واقعی را در لحظه ورودی
   * ندارد، این Endpoint tenant_id کاربر لاگین‌شده (نگهبان) را استفاده می‌کند — کد فقط در
   * محدوده همان مجتمع معتبر است (UNIQUE (tenant_id, code) در سطح دیتابیس).
   */
  @Roles('guard', 'admin')
  @Get('guest-passes/verify')
  async verify(@Query('code') code: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(`SELECT * FROM guard.guest_passes WHERE code = $1`, [code])
      const pass = res.rows[0]
      if (!pass) return { ok: false, reason: 'کد نامعتبر' }
      if (pass.status !== 'active') return { ok: false, reason: 'کد منقضی یا قبلاً استفاده‌شده' }
      if (new Date() < new Date(pass.valid_from) || new Date() > new Date(pass.valid_until)) {
        return { ok: false, reason: 'خارج از بازه اعتبار' }
      }
      if (pass.uses_count >= pass.max_uses) return { ok: false, reason: 'سقف استفاده از این کد تکمیل شده' }
      return { ok: true, passId: pass.id, guestName: pass.guest_name, unitId: pass.unit_id }
    })
  }

  @Roles('guard', 'admin')
  @Post('guest-passes/:id/check-in')
  async checkIn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const passRes = await client.query(`SELECT * FROM guard.guest_passes WHERE id = $1 FOR UPDATE`, [id])
      const pass = passRes.rows[0]
      if (!pass) throw new NotFoundException('کد مهمان یافت نشد')
      // اعتبارسنجی دوباره داخل همان تراکنش — بدون این، کد منقضی/مصرف‌شده هم ثبت ورود می‌شد
      const now = new Date()
      if (
        pass.status !== 'active' ||
        now < new Date(pass.valid_from) ||
        now > new Date(pass.valid_until) ||
        pass.uses_count >= pass.max_uses
      ) {
        throw new BadRequestException('این کد مهمان دیگر معتبر نیست')
      }

      const logRes = await client.query(
        `INSERT INTO guard.guest_visit_logs (tenant_id, guest_pass_id, unit_id, guest_name, checked_in_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [tenantId, pass.id, pass.unit_id, pass.guest_name, user.sub],
      )

      const newUses = pass.uses_count + 1
      const newStatus = newUses >= pass.max_uses ? 'used' : 'active'
      await client.query(`UPDATE guard.guest_passes SET uses_count = $1, status = $2 WHERE id = $3`, [
        newUses,
        newStatus,
        pass.id,
      ])

      // اعلان فوری به داشبورد زنده نگهبانی (WebSocket) + انتشار رویداد برای notification-svc (RabbitMQ)
      this.gateway.broadcastGuardEvent(tenantId, 'guest.checked_in', {
        guestName: pass.guest_name,
        unitId: pass.unit_id,
        time: new Date().toISOString(),
      })
      this.events.publish('guest.checked_in', { unitId: pass.unit_id, guestName: pass.guest_name }, tenantId)

      return logRes.rows[0]
    })
  }
}
