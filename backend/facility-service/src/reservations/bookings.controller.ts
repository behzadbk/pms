import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, HttpException, NotFoundException,
  Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common'
import { IsIn, IsInt, IsISO8601, Matches, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { Type } from 'class-transformer'
import { randomUUID } from 'crypto'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { buildSlots, tehranToday, tehranInstant } from './slots'
import { dayPlan } from './schedule'
import { tehranWhen } from './jalali'
import { isDesk } from './amenities.controller'
import { amenityLock, unitOfResident } from './debtor-lock'
import { BookingValidationService } from './booking-validation.service'

/** شناسه‌ی UUID‌شکل (داده‌ی نمونه UUIDهای غیر-v4 دارد؛ IsUUID نسخه را هم چک می‌کند) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class CreateBookingDto {
  @Matches(UUID_RE, { message: 'شناسه نامعتبر است' }) amenity_id: string
  @IsISO8601() start: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) hours?: number
  /** فقط ثبت دستی مسئول مشاعات/مدیر (هماهنگی تلفنی) */
  @IsOptional() @Matches(UUID_RE, { message: 'شناسه نامعتبر است' }) unit_id?: string
}

export class RejectBookingDto {
  @IsString() @MinLength(2, { message: 'دلیل عدم تایید را بنویسید' }) @MaxLength(200) reason: string
}

class ListQuery {
  @IsOptional() @IsIn(['pending', 'confirmed', 'rejected', 'cancelled', 'all']) status?: string
  @IsOptional() @Matches(UUID_RE) amenity_id?: string
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string
}

export class CancelBookingDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string
}

/**
 * رزرو مشاعات (نسخه‌ی ۲ — RESIDENTS.md و طراحی «رزرو مشاعات»):
 *   GET  /amenities/:id/slots?date=   ساعت‌های یک روز؛ ساعت پُر «taken» است و قابل انتخاب نیست
 *   POST /reservations                 تداخل ممنوع؛ needs_approval → pending + اعلان به مسئول مشاعات و مدیر
 *   POST /reservations/:id/approve|reject
 * واحد رزروکننده از عضویت فعال خود ساکن خوانده می‌شود، نه از بدنه‌ی درخواست.
 */
@Controller()
export class BookingsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly validator: BookingValidationService,
  ) {}

  @Get('amenities/:id/slots')
  async slots(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Query('date') date?: string) {
    const day = date ?? tehranToday()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestException('تاریخ باید به قالب YYYY-MM-DD باشد')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const a = await this.amenity(client, id)
      const plan = await dayPlan(client, a, day)
      const busy = await client.query<{ start_at: Date; end_at: Date; status: string }>(
        `SELECT start_at, end_at, status FROM facility.reservations
          WHERE amenity_id = $1 AND status IN ('pending','confirmed')
            AND start_at < ($2::date + 2)::timestamptz AND end_at > ($2::date - 1)::timestamptz`,
        [id, day],
      )
      const unit = await unitOfResident(client, user)
      const lock = unit ? await amenityLock(client, unit, a.id, a.name) : null
      return {
        amenity: a,
        date: day,
        closed: plan.closed,
        lock: lock?.locked ? { code: 'debtor_restricted', overdue_days: lock.overdue_days, message: lock.message } : null,
        slots: buildSlots(day, plan.hours, busy.rows.map((b) => ({ start: new Date(b.start_at), end: new Date(b.end_at), status: b.status }))),
      }
    })
  }

  @Roles('resident', 'child', 'admin', 'staff')
  @Post('reservations')
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookingDto) {
    const tenantId = user.tenant_id!
    const out = await this.db.withTenant(tenantId, async (client) => {
      const a = await this.amenity(client, dto.amenity_id)
      if (!a.is_active) throw new ConflictException('این مشاع فعلاً قابل رزرو نیست')
      const hours = dto.hours ?? 1
      if (hours > a.max_hours) throw new BadRequestException(`حداکثر ${a.max_hours} ساعت`)
      const start = new Date(dto.start)
      const end = new Date(start.getTime() + hours * 3_600_000)
      if (start.getTime() <= Date.now()) throw new BadRequestException('این ساعت گذشته است')
      if (start.getTime() > Date.now() + a.max_advance_days * 86_400_000) throw new BadRequestException(`رزرو این مشاع حداکثر ${a.max_advance_days} روز زودتر ممکن است`)
      // هر ساعت از بازه باید داخل تایم‌تیبل مشاع و خارج از تعطیلی باشد
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(start)
      const startHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', hourCycle: 'h23' }).format(start))
      const plan = await dayPlan(client, a, day)
      if (plan.closed) throw new ConflictException(`مشاع در این روز بسته است (${plan.closed})`)
      for (let h = 0; h < hours; h++) {
        if (!plan.hours.includes(startHour + h) || start.getTime() !== tehranInstant(day, startHour).getTime()) throw new BadRequestException('این ساعت در برنامه‌ی مشاع نیست')
      }

      const manual = user.role === 'admin' || user.role === 'staff'
      if (manual && !isDesk(user)) throw new ForbiddenException('ثبت دستی رزرو فقط برای مسئول مشاعات و مدیر است')
      let unitId: string
      let personId: string | null = null
      if (manual) {
        if (!dto.unit_id) throw new BadRequestException('برای ثبت دستی، واحد را انتخاب کنید')
        unitId = dto.unit_id
      } else {
        const m = await this.myMembership(client, user)
        unitId = m.unit_id
        personId = m.user_id
        if (m.role === 'caregiver' || m.role === 'owner_absent') throw new ForbiddenException('رزرو مشاعات برای این نوع عضویت فعال نیست')
        // قوانین برج: مشاعِ بسته برای واحد بدهکار (مدیر و مسئول مشاعات با ثبت دستی از این قفل مستثنی‌اند)
        const lock = await amenityLock(client, unitId, a.id, a.name)
        if (lock.locked) throw new ForbiddenException({ statusCode: 403, code: 'debtor_restricted', message: lock.message, overdue_days: lock.overdue_days })
        // قانون رزرو مشاع (سقف در بازه، حداقل/حداکثر پیش‌رزرو): پیش‌تر فقط مسیر قدیمی آن را اعمال می‌کرد
        // و این مسیر (که اپ استفاده می‌کند) نادیده‌اش می‌گرفت. ثبت دستی مدیر/مسئول مشاعات مستثنی است.
        const rule = (await client.query(`SELECT * FROM facility.booking_rules WHERE amenity_id = $1 AND is_active = true LIMIT 1`, [a.id])).rows[0]
        if (rule) {
          const chk = await this.validator.check(client, rule, unitId, start, end, { skipOverlap: true })
          if (!chk.ok) throw new BadRequestException({ statusCode: 400, code: 'booking_rule_violation', message: chk.violations.join(' '), violations: chk.violations })
        }
        if (m.role === 'child') {
          // حالت والدین: پنهان → ممنوع · ساعت سکوت → ۴۲۳ · با تأیید → درخواست برای والد
          const lv = (await client.query<{ lv: number }>(`SELECT residency.child_module_level($1, 'amenity') AS lv`, [m.id])).rows[0].lv
          if (!lv) throw new ForbiddenException('این بخش برای تو فعال نیست')
          const quiet = (await client.query<{ q: boolean }>(`SELECT residency.in_quiet_hours($1) AS q`, [m.id])).rows[0].q
          if (quiet) throw new HttpException({ statusCode: 423, code: 'quiet_hours', message: 'سفارش و رزرو در ساعت سکوت بسته است' }, 423)
          if (lv === 1) return this.childRequest(client, tenantId, m, a, start, end)
        }
      }

      // پیش‌بررسی برای پیام بهتر؛ تضمین نهایی EXCLUDE دیتابیس است (رقابت هم‌زمان → 23P01 → 409)
      const clash = await client.query(
        `SELECT 1 FROM facility.reservations WHERE amenity_id = $1 AND status IN ('pending','confirmed')
            AND tstzrange(start_at, end_at) && tstzrange($2, $3)`,
        [a.id, start, end],
      )
      if (clash.rowCount) throw new ConflictException('این ساعت رزرو شده است')
      const status = manual || !a.requires_approval ? 'confirmed' : 'pending'
      const res = await client.query<{ id: string; status: string; start_at: string; end_at: string }>(
        `INSERT INTO facility.reservations (tenant_id, amenity_id, unit_id, requested_by, user_id, start_at, end_at, status, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, status, start_at, end_at`,
        [tenantId, a.id, unitId, user.sub, personId, start, end, status, manual ? 'manual' : 'app'],
      )
      const r = res.rows[0]
      const unitNo = (await client.query<{ unit_number: string }>(`SELECT unit_number FROM property.units WHERE id = $1`, [unitId])).rows[0]?.unit_number
      if (status === 'pending') {
        const n = { kind: 'reservation_pending', title: `درخواست رزرو جدید — ${a.name}، واحد ${fa(unitNo ?? '')}`, body: tehranWhen(start), ref: r.id }
        await this.notify(client, tenantId, [{ role: 'perm:amenity_desk' }], { ...n, link: '/staff/amenity-desk' })
        await this.notify(client, tenantId, [{ role: 'admin' }], { ...n, link: '/admin/reservations' })
      } else if (manual && personId === null) {
        const residents = await client.query<{ user_id: string }>(
          `SELECT user_id FROM residency.memberships WHERE unit_id = $1 AND status = 'active' AND role IN ('head','adult','senior')`, [unitId])
        await this.notify(client, tenantId, residents.rows.map((x) => ({ person: x.user_id })), {
          kind: 'reservation_confirmed', title: `رزرو ${a.name} برای واحد شما ثبت شد`, body: tehranWhen(start), link: '/resident/reservations', ref: r.id,
        })
      }
      await this.audit(client, tenantId, user, 'reservation.created', {
        summary: `رزرو ${a.name} برای واحد ${unitNo} (${status === 'pending' ? 'در انتظار تأیید' : 'قطعی'})`,
        reservation_id: r.id, amenity_id: a.id, unit_id: unitId, subject_user_id: personId, after: { status },
      })
      return { id: r.id, status, amenity: a.name, start_at: r.start_at, end_at: r.end_at, unit_id: unitId, needs_approval: a.requires_approval }
    })
    this.events.publish(out.status === 'pending' ? 'reservation.pending_approval' : out.status === 'confirmed' ? 'reservation.created' : 'child_request.created', { reservationId: out.id, ...out }, tenantId)
    return out
  }

  @Roles('resident', 'child')
  @Get('me/reservations')
  async mine(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await this.myMembership(client, user)
      return this.list(client, 'all', m.unit_id)
    })
  }

  @Roles('admin', 'staff')
  @Get('reservations')
  async queue(@CurrentUser() user: JwtPayload, @Query() q: ListQuery) {
    if (!isDesk(user)) throw new ForbiddenException('فقط مسئول مشاعات و مدیر')
    return this.db.withTenant(user.tenant_id!, (client) => this.list(client, q.status ?? 'pending', undefined, q))
  }

  /** برنامه‌ی یک روز برای میز مشاعات: همه‌ی مشاعات + رزروهای آن روز (شبکه‌ی ساعتی) */
  @Roles('admin', 'staff')
  @Get('reservations/board')
  async board(@CurrentUser() user: JwtPayload, @Query('date') date?: string) {
    if (!isDesk(user)) throw new ForbiddenException('فقط مسئول مشاعات و مدیر')
    const day = date ?? tehranToday()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestException('تاریخ باید به قالب YYYY-MM-DD باشد')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const amenities = (await client.query<{ id: string; name: string; icon: string | null; slot_hours: number[]; requires_approval: boolean; max_hours: number }>(
        `SELECT id, name, icon, slot_hours, requires_approval, max_hours FROM facility.amenities WHERE is_active ORDER BY name`)).rows
      const res = await client.query(
        `SELECT r.id, r.amenity_id, r.status, r.start_at, r.end_at, r.source, u.unit_number AS unit_no, p.name AS requester
           FROM facility.reservations r
           LEFT JOIN property.units u ON u.id = r.unit_id
           LEFT JOIN residency.users p ON p.id = r.user_id
          WHERE r.status IN ('pending','confirmed') AND r.start_at < $2 AND r.end_at > $1`,
        [tehranInstant(day, 0), new Date(tehranInstant(day, 0).getTime() + 86_400_000)])
      const out = []
      for (const a of amenities) {
        const plan = await dayPlan(client, a, day)
        out.push({ id: a.id, name: a.name, icon: a.icon, requires_approval: a.requires_approval, max_hours: a.max_hours, closed: plan.closed, hours: plan.hours, reservations: res.rows.filter((r) => r.amenity_id === a.id) })
      }
      return { date: day, amenities: out }
    })
  }

  /** جست‌وجوی واحد برای ثبت دستی رزرو */
  @Roles('admin', 'staff')
  @Get('reservations/units')
  async units(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    if (!isDesk(user)) throw new ForbiddenException('فقط مسئول مشاعات و مدیر')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `SELECT id, unit_number AS no FROM property.units WHERE ($1::text IS NULL OR unit_number ILIKE '%' || $1 || '%') ORDER BY unit_number LIMIT 40`,
        [q?.trim() || null])
      return res.rows
    })
  }

  /** لغو رزرو توسط ساکن (فقط رزرو واحد خودش، قبل از شروع) */
  @Roles('resident', 'child')
  @Post('me/reservations/:id/cancel')
  @HttpCode(200)
  async cancelMine(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const m = await this.myMembership(client, user)
      const r = (await client.query<{ id: string; status: string; start_at: string; name: string }>(
        `SELECT r.id, r.status, r.start_at, a.name FROM facility.reservations r JOIN facility.amenities a ON a.id = r.amenity_id
          WHERE r.id = $1 AND r.unit_id = $2 FOR UPDATE OF r`, [id, m.unit_id])).rows[0]
      if (!r) throw new NotFoundException('رزرو یافت نشد')
      if (!['pending', 'confirmed'].includes(r.status)) throw new ConflictException('این رزرو قابل لغو نیست')
      if (new Date(r.start_at).getTime() <= Date.now()) throw new ConflictException('زمان این رزرو گذشته است')
      await client.query(`UPDATE facility.reservations SET status = 'cancelled', decided_by = $2, decided_at = now() WHERE id = $1`, [id, user.sub])
      await this.audit(client, tenantId, user, 'reservation.cancelled', { summary: `رزرو ${r.name} توسط ساکن لغو شد`, reservation_id: id })
      return { id, status: 'cancelled' }
    })
  }

  /** لغو رزرو توسط مسئول مشاعات (مثلاً تعمیرات) — اعلان به رزروکننده */
  @Roles('admin', 'staff')
  @Post('reservations/:id/cancel')
  @HttpCode(200)
  async cancelByDesk(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto) {
    if (!isDesk(user)) throw new ForbiddenException('فقط مسئول مشاعات و مدیر')
    const tenantId = user.tenant_id!
    const out = await this.db.withTenant(tenantId, async (client) => {
      const r = (await client.query<{ id: string; status: string; unit_id: string; user_id: string | null; requested_by: string; start_at: string; name: string }>(
        `SELECT r.id, r.status, r.unit_id, r.user_id, r.requested_by, r.start_at, a.name
           FROM facility.reservations r JOIN facility.amenities a ON a.id = r.amenity_id WHERE r.id = $1 FOR UPDATE OF r`, [id])).rows[0]
      if (!r) throw new NotFoundException('رزرو یافت نشد')
      if (!['pending', 'confirmed'].includes(r.status)) throw new ConflictException('این رزرو قابل لغو نیست')
      await client.query(`UPDATE facility.reservations SET status = 'cancelled', reject_reason = $2, decided_by = $3, decided_at = now() WHERE id = $1`, [id, dto.reason ?? null, user.sub])
      await this.notify(client, tenantId, this.requesterTargets(r), {
        kind: 'reservation_cancelled',
        title: `رزرو ${r.name} لغو شد`,
        body: [tehranWhen(new Date(r.start_at)), dto.reason].filter(Boolean).join(' — '),
        link: '/resident/reservations',
        ref: id,
      })
      await this.audit(client, tenantId, user, 'reservation.cancelled', { summary: `رزرو ${r.name} توسط مسئول لغو شد`, reservation_id: id, reason: dto.reason ?? null })
      return { id, status: 'cancelled', unit_id: r.unit_id }
    })
    this.events.publish('reservation.cancelled', { reservationId: id, unitId: out.unit_id }, tenantId)
    return out
  }

  @Roles('admin', 'staff')
  @Post('reservations/:id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.decide(user, id, true)
  }

  @Roles('admin', 'staff')
  @Post('reservations/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectBookingDto) {
    return this.decide(user, id, false, dto.reason)
  }

  /* ───────────── داخلی ───────────── */

  private async decide(user: JwtPayload, id: string, approve: boolean, reason?: string) {
    if (!isDesk(user)) throw new ForbiddenException('فقط مسئول مشاعات و مدیر')
    const tenantId = user.tenant_id!
    const out = await this.db.withTenant(tenantId, async (client) => {
      const r = (await client.query<{ id: string; status: string; unit_id: string; user_id: string | null; requested_by: string; amenity_id: string; name: string; start_at: string }>(
        `SELECT r.id, r.status, r.unit_id, r.user_id, r.requested_by, r.amenity_id, a.name, r.start_at
           FROM facility.reservations r JOIN facility.amenities a ON a.id = r.amenity_id WHERE r.id = $1 FOR UPDATE OF r`, [id])).rows[0]
      if (!r) throw new NotFoundException('رزرو یافت نشد')
      if (r.status !== 'pending') throw new ConflictException('این رزرو در انتظار تأیید نیست')
      await client.query(
        `UPDATE facility.reservations SET status = $2, reject_reason = $3, decided_by = $4, decided_at = now() WHERE id = $1`,
        [id, approve ? 'confirmed' : 'rejected', approve ? null : reason, user.sub],
      )
      await this.notify(client, tenantId, this.requesterTargets(r), {
        kind: approve ? 'reservation_approved' : 'reservation_rejected',
        title: approve ? `رزرو ${r.name} تأیید شد ✅` : `رزرو ${r.name} تأیید نشد`,
        body: approve ? tehranWhen(new Date(r.start_at)) : `${tehranWhen(new Date(r.start_at))} — دلیل: ${reason}`,
        link: '/resident/reservations',
        ref: id,
      })
      await this.audit(client, tenantId, user, approve ? 'reservation.approved' : 'reservation.rejected', {
        summary: `رزرو ${r.name} ${approve ? 'تأیید شد' : 'رد شد: ' + reason}`,
        reservation_id: id, subject_user_id: r.user_id, before: { status: 'pending' }, after: { status: approve ? 'confirmed' : 'rejected', reason },
      })
      return { id, status: approve ? 'confirmed' : 'rejected', reject_reason: approve ? null : reason, unit_id: r.unit_id, amenity: r.name }
    })
    this.events.publish(approve ? 'reservation.approved' : 'reservation.rejected', { reservationId: id, unitId: out.unit_id, amenityName: out.amenity, reason }, tenantId)
    return out
  }

  private async list(client: PoolClient, status: string, unitId?: string, f: { amenity_id?: string; from?: string; to?: string } = {}) {
    const res = await client.query(
      `SELECT r.id, r.status, r.start_at, r.end_at, r.reject_reason, r.source, r.created_at, r.decided_at,
              a.id AS amenity_id, a.name AS amenity, a.icon, u.unit_number AS unit_no, p.name AS requester
         FROM facility.reservations r
         JOIN facility.amenities a ON a.id = r.amenity_id
         LEFT JOIN property.units u ON u.id = r.unit_id
         LEFT JOIN residency.users p ON p.id = r.user_id
        WHERE ($1 = 'all' OR r.status = $1) AND ($2::uuid IS NULL OR r.unit_id = $2)
          AND ($3::uuid IS NULL OR r.amenity_id = $3)
          AND ($4::date IS NULL OR r.start_at >= ($4::date)::timestamp AT TIME ZONE 'Asia/Tehran')
          AND ($5::date IS NULL OR r.start_at < (($5::date) + 1)::timestamp AT TIME ZONE 'Asia/Tehran')
        ORDER BY r.start_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
      [status, unitId ?? null, f.amenity_id ?? null, f.from ?? null, f.to ?? null],
    )
    return res.rows
  }

  /** رزروکننده فقط یک‌بار اعلان بگیرد: اگر شخص (ساکن) شناخته‌شده است همان، وگرنه حساب ورود */
  private requesterTargets(r: { user_id: string | null; requested_by: string }) {
    return r.user_id ? [{ person: r.user_id }] : [{ login: r.requested_by }]
  }

  private async amenity(client: PoolClient, id: string) {
    const a = (await client.query<{ id: string; name: string; icon: string | null; requires_approval: boolean; max_hours: number; max_advance_days: number; capacity: number | null; slot_hours: number[]; rule_text: string | null; description: string | null; is_active: boolean }>(
      `SELECT id, name, icon, requires_approval, max_hours, max_advance_days, capacity, slot_hours, rule_text, description, is_active FROM facility.amenities WHERE id = $1`, [id])).rows[0]
    if (!a) throw new NotFoundException('مشاع یافت نشد')
    return { ...a, needs_approval: a.requires_approval }
  }

  /** عضویت فعال رزروکننده (کودکِ نشست خانواده: همان mid توکن) */
  private async myMembership(client: PoolClient, user: JwtPayload) {
    const q = user.kind === 'family' && user.mid
      ? await client.query<{ id: string; unit_id: string; user_id: string; role: string }>(
        `SELECT id, unit_id, user_id, role FROM residency.memberships WHERE id = $1 AND status = 'active'`, [user.mid])
      : await client.query<{ id: string; unit_id: string; user_id: string; role: string }>(
        `SELECT m.id, m.unit_id, m.user_id, m.role FROM residency.memberships m
          WHERE m.status = 'active' AND m.user_id = COALESCE($1::uuid, (SELECT person_id FROM identity.users WHERE id = $2))
          ORDER BY (m.role = 'head') DESC, m.created_at LIMIT 1`, [user.pid ?? null, user.sub])
    if (!q.rows[0]) throw new ForbiddenException('عضویت فعالی در این ساختمان ندارید')
    return q.rows[0]
  }

  /** حالت والدین «با تأیید»: به‌جای رزرو، درخواست ۳۰ دقیقه‌ای برای والدین */
  private async childRequest(client: PoolClient, tenantId: string, m: { id: string; unit_id: string; user_id: string }, a: { id: string; name: string }, start: Date, end: Date) {
    const req = (await client.query<{ id: string; expires_at: string }>(
      `INSERT INTO residency.child_requests (tenant_id, child_membership_id, type, payload, reason)
       VALUES ($1, $2, 'amenity', $3, 'approval') RETURNING id, expires_at`,
      [tenantId, m.id, JSON.stringify({ amenity_id: a.id, amenity: a.name, start: start.toISOString(), end: end.toISOString() })],
    )).rows[0]
    const child = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
    const guardians = await client.query<{ user_id: string }>(
      `SELECT user_id FROM residency.memberships WHERE unit_id = $1 AND status = 'active' AND role IN ('head','adult','senior')`, [m.unit_id])
    await this.notify(client, tenantId, guardians.rows.map((g) => ({ person: g.user_id })), {
      kind: 'child_request', title: `${child.name} می‌خواهد رزرو کند`, body: a.name, link: `/resident/family/requests/${req.id}`, ref: req.id,
    })
    return { id: req.id, status: 'pending_parent' as const, amenity: a.name, start_at: start.toISOString(), end_at: end.toISOString(), unit_id: m.unit_id, needs_approval: true, expires_at: req.expires_at }
  }

  private async notify(client: PoolClient, tenantId: string, to: { person?: string | null; login?: string | null; role?: string | null }[], n: { kind: string; title: string; body?: string | null; link?: string | null; ref?: string | null }) {
    for (const r of to) {
      if (!r.person && !r.login && !r.role) continue
      await client.query(
        `INSERT INTO notification.inbox (tenant_id, recipient_person, recipient_login, recipient_role, kind, title, body, link, ref_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [tenantId, r.person ?? null, r.login ?? null, r.role ?? null, n.kind, n.title, n.body ?? null, n.link ?? null, n.ref ?? null],
      )
    }
  }

  private async audit(client: PoolClient, tenantId: string, user: JwtPayload, action: string, body: Record<string, unknown>) {
    await client.query(
      `INSERT INTO audit.event_logs (tenant_id, session_id, user_id, actor_role, source, level, action, request_body)
       VALUES ($1, $2, $3, $4, 'facility-svc', 'info', $5, $6)`,
      [tenantId, randomUUID(), /^[0-9a-f-]{36}$/i.test(user.sub) ? user.sub : null, user.role, action, JSON.stringify(body)],
    )
  }
}

function fa(s: string) {
  return String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
}
