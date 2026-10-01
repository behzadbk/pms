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
import { buildSlots, tehranToday } from './slots'

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
}

const DESK_ROLES = ['admin']

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
  ) {}

  @Get('amenities/:id/slots')
  async slots(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Query('date') date?: string) {
    const day = date ?? tehranToday()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestException('تاریخ باید به قالب YYYY-MM-DD باشد')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const a = await this.amenity(client, id)
      const busy = await client.query<{ start_at: Date; end_at: Date; status: string }>(
        `SELECT start_at, end_at, status FROM facility.reservations
          WHERE amenity_id = $1 AND status IN ('pending','confirmed')
            AND start_at < ($2::date + 2)::timestamptz AND end_at > ($2::date - 1)::timestamptz`,
        [id, day],
      )
      return {
        amenity: a,
        date: day,
        slots: buildSlots(day, a.slot_hours, busy.rows.map((b) => ({ start: new Date(b.start_at), end: new Date(b.end_at), status: b.status }))),
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

      const manual = user.role === 'admin' || user.role === 'staff'
      if (manual && !this.isDesk(user)) throw new ForbiddenException('ثبت دستی رزرو فقط برای مسئول مشاعات و مدیر است')
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
        await this.notify(client, tenantId, [{ role: 'perm:amenity_desk' }, { role: 'admin' }], {
          kind: 'reservation_pending',
          title: `درخواست رزرو جدید — ${a.name}، واحد ${fa(unitNo ?? '')}`,
          link: '/staff/amenity-desk',
          ref: r.id,
        })
      } else if (manual && personId === null) {
        const residents = await client.query<{ user_id: string }>(
          `SELECT user_id FROM residency.memberships WHERE unit_id = $1 AND status = 'active' AND role IN ('head','adult','senior')`, [unitId])
        await this.notify(client, tenantId, residents.rows.map((x) => ({ person: x.user_id })), {
          kind: 'reservation_confirmed', title: `رزرو ${a.name} برای واحد شما ثبت شد`, ref: r.id,
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
    if (!this.isDesk(user)) throw new ForbiddenException('فقط مسئول مشاعات و مدیر')
    return this.db.withTenant(user.tenant_id!, (client) => this.list(client, q.status ?? 'pending'))
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
    if (!this.isDesk(user)) throw new ForbiddenException('فقط مسئول مشاعات و مدیر')
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
      const to = [{ login: r.requested_by }, ...(r.user_id ? [{ person: r.user_id }] : [])]
      await this.notify(client, tenantId, to, {
        kind: approve ? 'reservation_approved' : 'reservation_rejected',
        title: approve ? `رزرو ${r.name} تأیید شد` : `رزرو ${r.name} تأیید نشد`,
        body: approve ? null : reason ?? null,
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

  private async list(client: PoolClient, status: string, unitId?: string) {
    const res = await client.query(
      `SELECT r.id, r.status, r.start_at, r.end_at, r.reject_reason, r.source, r.created_at,
              a.id AS amenity_id, a.name AS amenity, a.icon, u.unit_number AS unit_no, p.name AS requester
         FROM facility.reservations r
         JOIN facility.amenities a ON a.id = r.amenity_id
         LEFT JOIN property.units u ON u.id = r.unit_id
         LEFT JOIN residency.users p ON p.id = r.user_id
        WHERE ($1 = 'all' OR r.status = $1) AND ($2::uuid IS NULL OR r.unit_id = $2)
        ORDER BY r.start_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 100`,
      [status, unitId ?? null],
    )
    return res.rows
  }

  private async amenity(client: PoolClient, id: string) {
    const a = (await client.query<{ id: string; name: string; icon: string | null; requires_approval: boolean; max_hours: number; capacity: number | null; slot_hours: number[]; rule_text: string | null; is_active: boolean }>(
      `SELECT id, name, icon, requires_approval, max_hours, capacity, slot_hours, rule_text, is_active FROM facility.amenities WHERE id = $1`, [id])).rows[0]
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

  private isDesk(user: JwtPayload) {
    return DESK_ROLES.includes(user.role) || (user.role === 'staff' && (user.perms ?? []).includes('amenity_desk'))
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
