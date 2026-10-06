import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { randomInt } from 'crypto'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { EventsService } from '../events/events.service'
import { GuardGateway } from '../realtime/guard.gateway'
import { assertChildModule, assertDesk, faDigits, myMembership, notify, unitRecipients } from '../common/access'

interface IssuePassBody {
  guestName: string
  validUntil: string // ISO
  maxUses?: number
}

// وضعیت «expired» ذخیره نمی‌شود، هنگام خواندن محاسبه می‌شود: کدی که هنوز active است ولی valid_until گذشته منقضی
// نشان داده می‌شود. پس برای انقضا هیچ job پس‌زمینه‌ای لازم نیست.
const PASS_SELECT = `
  SELECT g.id, g.unit_id, u.unit_number, g.guest_name, g.code, g.valid_from, g.valid_until, g.max_uses, g.uses_count,
         CASE WHEN g.status = 'active' AND g.valid_until < now() THEN 'expired' ELSE g.status END AS status, g.created_at
    FROM guard.guest_passes g LEFT JOIN property.units u ON u.id = g.unit_id`

/**
 * «پنل فوق‌ساده نگهبانی» — docs/FEATURES-DEEP-DIVE.md بخش ۷.۳ (guardQuickCheckIn / guardConfirmCheckIn).
 */
@Controller()
export class GuestPassesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly gateway: GuardGateway,
  ) {}

  private async createPass(client: PoolClient, user: JwtPayload, unitId: string, body: IssuePassBody) {
    if (!body?.guestName?.trim()) throw new BadRequestException('نام مهمان الزامی است')
    if (body.guestName.trim().length > 80) throw new BadRequestException('نام مهمان بیش از حد طولانی است')
    const validUntil = new Date(body.validUntil)
    if (Number.isNaN(validUntil.getTime()) || validUntil <= new Date()) {
      throw new BadRequestException('زمان پایان اعتبار باید در آینده باشد')
    }
    if (validUntil.getTime() - Date.now() > 90 * 86400_000) throw new BadRequestException('اعتبار کد حداکثر ۹۰ روز است')
    const maxUses = body.maxUses ?? 1
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 50) {
      throw new BadRequestException('تعداد دفعات استفاده باید بین ۱ و ۵۰ باشد')
    }
    // کد ۶ رقمی یکتا در tenant (چند تلاش در صورت برخورد)
    for (let i = 0; i < 8; i++) {
      // randomInt از crypto است (غیرقابل‌پیش‌بینی)، نه Math.random. یکتایی را به‌جای «اول SELECT بعد INSERT» (که با دو
      // درخواست هم‌زمان می‌شکست) با ON CONFLICT DO NOTHING می‌گیریم: اگر کد تکراری بود ردیفی برنمی‌گردد و کد تازه امتحان می‌شود.
      const code = randomInt(100000, 999999).toString()
      const ins = await client.query(
        `INSERT INTO guard.guest_passes (tenant_id, unit_id, issued_by, guest_name, code, valid_until, max_uses)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (tenant_id, code) DO NOTHING RETURNING id`,
        [user.tenant_id, unitId, user.sub, body.guestName.trim(), code, validUntil, maxUses])
      if (ins.rows[0]) return (await client.query(`${PASS_SELECT} WHERE g.id = $1`, [ins.rows[0].id])).rows[0]
    }
    throw new BadRequestException('صدور کد ناموفق بود؛ دوباره تلاش کنید')
  }

  /** ساکن برای واحد خودش کد مهمان صادر می‌کند (واحد از عضویت خوانده می‌شود) */
  @Roles('resident', 'child')
  @Post('me/guest-passes')
  async issueMine(@Body() body: IssuePassBody, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await myMembership(client, user)
      if (['caregiver', 'owner_absent'].includes(m.role)) throw new ForbiddenException('صدور کد مهمان برای این نوع عضویت فعال نیست')
      await assertChildModule(client, m, 'guest')
      return this.createPass(client, user, m.unit_id, body)
    })
  }

  @Roles('resident', 'child')
  @Get('me/guest-passes')
  async listMine(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await myMembership(client, user)
      const r = await client.query(`${PASS_SELECT} WHERE g.unit_id = $1 ORDER BY g.created_at DESC LIMIT 30`, [m.unit_id])
      return r.rows
    })
  }

  /** ابطال کد توسط ساکنِ همان واحد */
  @Roles('resident', 'child')
  @Post('me/guest-passes/:id/revoke')
  @HttpCode(200)
  async revokeMine(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await myMembership(client, user)
      const r = await client.query(
        `UPDATE guard.guest_passes SET status = 'revoked' WHERE id = $1 AND unit_id = $2 AND status = 'active' RETURNING id`, [id, m.unit_id])
      if (!r.rows[0]) throw new NotFoundException('کد فعال یافت نشد')
      return (await client.query(`${PASS_SELECT} WHERE g.id = $1`, [id])).rows[0]
    })
  }

  @Roles('resident', 'admin')
  @Post('units/:unitId/guest-passes')
  async issue(
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() body: IssuePassBody,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      // ساکن فقط برای واحد خودش (عضویت فعال یا پیوند مالکیت) می‌تواند کد مهمان صادر کند
      if (user.role === 'resident') {
        // دو مدل عضویت: پیوند قدیمی user_unit_links، یا عضویت فعال در مدل جدید ساکنین (residency.memberships)
        const link = await client.query(
          `SELECT 1 FROM property.user_unit_links WHERE user_id = $1 AND unit_id = $2
           UNION ALL SELECT 1 FROM residency.memberships WHERE unit_id = $2 AND status = 'active' AND role IN ('head', 'adult', 'senior')
                        AND user_id = COALESCE($3::uuid, (SELECT person_id FROM identity.users WHERE id = $1))`,
          [user.sub, unitId, user.pid ?? null])
        if (!link.rowCount) throw new ForbiddenException('شما به این واحد دسترسی ندارید')
        // قوانین برج: کارت مهمان برای واحد بدهکار بسته است (اگر مدیر این بخش را محدود کرده باشد)
        const lock = await client.query<{ r: boolean }>(`SELECT residency.unit_restricted($1, 'module:guest') AS r`, [unitId])
        if (lock.rows[0]?.r) {
          throw new ForbiddenException({ statusCode: 403, code: 'debtor_restricted', message: 'صدور کارت مهمان برای واحد شما به‌علت معوقه‌ی شارژ بسته است؛ پس از تسویه باز می‌شود.' })
        }
      }
      return this.createPass(client, user, unitId, body)
    })
  }

  /** فهرست کدهای مهمان برای نگهبان: scope=active (فعال و معتبر) | today (ورودهای امروز) | all */
  @Roles('guard', 'admin', 'staff')
  @Get('guest-passes')
  async list(@CurrentUser() user: JwtPayload, @Query('scope') scope = 'active') {
    assertDesk(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const where =
        scope === 'all' ? 'TRUE' : `g.status = 'active' AND g.valid_until > now() AND g.uses_count < g.max_uses`
      const r = await client.query(`${PASS_SELECT} WHERE ${where} ORDER BY g.valid_until ASC LIMIT 100`)
      return r.rows
    })
  }

  /** ورودهای مهمان امروز (به وقت تهران) */
  @Roles('guard', 'admin', 'staff')
  @Get('guest-visits')
  async visits(@CurrentUser() user: JwtPayload) {
    assertDesk(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `SELECT l.id, l.guest_name, l.unit_id, u.unit_number, l.entry_at
           FROM guard.guest_visit_logs l LEFT JOIN property.units u ON u.id = l.unit_id
          WHERE (l.entry_at AT TIME ZONE 'Asia/Tehran')::date = (now() AT TIME ZONE 'Asia/Tehran')::date
          ORDER BY l.entry_at DESC LIMIT 100`)
      return r.rows
    })
  }

  /**
   * فقط بررسی — بدون ثبت (نگهبان پیش از تایید نهایی نتیجه را می‌بیند).
   * کد فقط در محدوده همان مجتمع معتبر است (UNIQUE (tenant_id, code) + RLS).
   */
  @Roles('guard', 'admin', 'staff')
  @Get('guest-passes/verify')
  async verify(@Query('code') rawCode: string, @CurrentUser() user: JwtPayload) {
    assertDesk(user)
    // محتوای QR با پیشوند «guest-pass:» می‌آید و کد دستی ممکن است با ارقام فارسی تایپ شود؛ هر دو به ۶ رقم لاتین نرمال می‌شوند.
    // verify فقط می‌خواند و چیزی مصرف نمی‌کند؛ مصرف واقعی در check-in (با قفل) انجام می‌شود.
    const code = String(rawCode ?? '').replace(/^guest-pass:/, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim()
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(`SELECT g.*, u.unit_number FROM guard.guest_passes g LEFT JOIN property.units u ON u.id = g.unit_id WHERE g.code = $1`, [code])
      const pass = res.rows[0]
      if (!pass) return { ok: false, reason: 'کد نامعتبر' }
      if (pass.status === 'revoked') return { ok: false, reason: 'این کد توسط ساکن باطل شده است' }
      if (pass.status !== 'active') return { ok: false, reason: 'کد منقضی یا قبلاً استفاده‌شده' }
      if (new Date() < new Date(pass.valid_from) || new Date() > new Date(pass.valid_until)) {
        return { ok: false, reason: 'خارج از بازه اعتبار' }
      }
      if (pass.uses_count >= pass.max_uses) return { ok: false, reason: 'سقف استفاده از این کد تکمیل شده' }
      return { ok: true, passId: pass.id, guestName: pass.guest_name, unitId: pass.unit_id, unitNumber: pass.unit_number, usesLeft: pass.max_uses - pass.uses_count }
    })
  }

  @Roles('guard', 'admin', 'staff')
  @Post('guest-passes/:id/check-in')
  async checkIn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    assertDesk(user)
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      // FOR UPDATE ردیف کد را تا پایان تراکنش قفل می‌کند. اگر دو نگهبان هم‌زمان یک کد «تک‌بارمصرف» را اسکن کنند،
      // دومی منتظر می‌ماند و بعد از commit اولی uses_count به‌روز را می‌بیند و رد می‌شود (بدون قفل هر دو وارد می‌شدند).
      const passRes = await client.query(`SELECT * FROM guard.guest_passes WHERE id = $1 FOR UPDATE`, [id])
      const pass = passRes.rows[0]
      if (!pass) throw new NotFoundException('کد مهمان یافت نشد')
      // اعتبارسنجی دوباره داخل همان تراکنش — بدون این، کد منقضی/مصرف‌شده هم ثبت ورود می‌شد
      const now = new Date()
      if (pass.status !== 'active' || now < new Date(pass.valid_from) || now > new Date(pass.valid_until) || pass.uses_count >= pass.max_uses) {
        throw new BadRequestException('این کد مهمان دیگر معتبر نیست')
      }

      const logRes = await client.query(
        `INSERT INTO guard.guest_visit_logs (tenant_id, guest_pass_id, unit_id, guest_name, checked_in_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [tenantId, pass.id, pass.unit_id, pass.guest_name, user.sub])

      // وقتی آخرین استفاده‌ی مجاز مصرف شد وضعیت خودکار 'used' می‌شود؛ کدِ چندبارمصرف تا آن موقع active می‌ماند.
      const newUses = pass.uses_count + 1
      await client.query(`UPDATE guard.guest_passes SET uses_count = $1, status = $2 WHERE id = $3`, [
        newUses, newUses >= pass.max_uses ? 'used' : 'active', pass.id])

      // اعلان به ساکنان واحد (پوش خودکار)
      await notify(client, tenantId, await unitRecipients(client, pass.unit_id), {
        kind: 'guest_checked_in', title: `مهمان شما وارد شد: ${pass.guest_name}`, body: 'ورود در نگهبانی ثبت شد', link: '/resident/guest', ref: pass.id,
      })

      this.gateway.broadcastGuardEvent(tenantId, 'guest.checked_in', { guestName: pass.guest_name, unitId: pass.unit_id, time: now.toISOString() })
      this.events.publish('guest.checked_in', { unitId: pass.unit_id, guestName: pass.guest_name }, tenantId)
      const unit = await client.query<{ unit_number: string }>('SELECT unit_number FROM property.units WHERE id = $1', [pass.unit_id])
      return { ...logRes.rows[0], unit_number: unit.rows[0]?.unit_number ?? null, label: `${pass.guest_name} — واحد ${faDigits(unit.rows[0]?.unit_number ?? '')}` }
    })
  }
}
