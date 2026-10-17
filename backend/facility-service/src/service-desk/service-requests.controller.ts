import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException,
  Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common'
import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { unitOfResident } from '../reservations/debtor-lock'
import { tehranWhen } from '../reservations/jalali'
import { auditLog, faDigits, notifyInbox } from '../common/inbox'
import { canManageDept, hasServiceDesk, isAdmin, managedDepartments, needManageDept } from './access'

/** شناسه‌ی UUID‌شکل — داده‌ی نمونه UUIDهای غیر-v4 دارد و اعتبارسنج نسخه را هم چک می‌کند (همان قرارداد bookings.controller) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_MSG = { message: 'شناسه نامعتبر است' }
export class CreateServiceRequestDto {
  @Matches(UUID_RE, UUID_MSG) service_type_id: string
  /** زمانی که ساکن می‌خواهد (ISO) — مثلاً کارواش ساعت ۶ عصر */
  @IsISO8601() preferred_at: string
  @IsOptional() @IsString() @MaxLength(300) note?: string
}
export class ScheduleDto {
  /** زمان تأییدشده — اگر نباشد همان زمان درخواستی ساکن */
  @IsOptional() @IsISO8601() scheduled_at?: string
  /** همزمان به یکی از کارکنان زیردست بسپار (اختیاری) */
  @IsOptional() @Matches(UUID_RE, UUID_MSG) assigned_to?: string
}
export class AssignDto {
  @Matches(UUID_RE, UUID_MSG) assigned_to: string
}
export class RejectRequestDto {
  @IsString() @MinLength(2, { message: 'دلیل را بنویسید' }) @MaxLength(200) reason: string
}
class ListQuery {
  @IsOptional() @IsIn(['open', 'submitted', 'scheduled', 'assigned', 'in_progress', 'done', 'rejected', 'cancelled', 'all']) status?: string
  @IsOptional() @IsString() @MaxLength(40) department_code?: string
}

type Status = 'submitted' | 'scheduled' | 'assigned' | 'in_progress' | 'done' | 'rejected' | 'cancelled'
const OPEN: Status[] = ['submitted', 'scheduled', 'assigned', 'in_progress']

interface RequestRow {
  id: string
  service_type_id: string | null
  service_title: string
  department_code: string
  department_name: string | null
  unit_id: string | null
  unit_no: string | null
  requester_person: string
  requester_name: string | null
  preferred_at: string
  scheduled_at: string | null
  note: string | null
  status: Status
  reject_reason: string | null
  assigned_to: string | null
  assigned_name: string | null
  completed_at: string | null
  created_at: string
}

const SELECT_REQUESTS = `
  SELECT r.id, r.service_type_id, r.service_title, r.department_code, d.name AS department_name,
         r.unit_id, u.unit_number AS unit_no, r.requester_person, r.requester_name,
         r.preferred_at, r.scheduled_at, r.note, r.status, r.reject_reason,
         r.assigned_to, a.full_name AS assigned_name, r.completed_at, r.created_at
    FROM facility.service_requests r
    LEFT JOIN property.units u ON u.id = r.unit_id
    LEFT JOIN identity.users a ON a.id = r.assigned_to
    LEFT JOIN identity.departments d ON d.code = r.department_code`

const ORDER = `ORDER BY CASE r.status WHEN 'submitted' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'assigned' THEN 2 WHEN 'in_progress' THEN 3 ELSE 4 END,
                COALESCE(r.scheduled_at, r.preferred_at)`

/**
 * درخواست خدمات (کارواش، خانه‌داری، نظافت …):
 *   ساکن زمان دلخواه را می‌زند → به مدیر دپارتمانِ آن خدمت می‌رسد → مدیر زمان را تأیید می‌کند
 *   (یا رد می‌کند) و کار را به یکی از کارکنان زیردست می‌سپارد؛ می‌تواند بعداً به نفر دیگر منتقل کند.
 *   کارمندِ مجری فقط کارهای سپرده‌شده به خودش را می‌بیند و «شروع/انجام شد» می‌زند.
 *
 *   POST /service-requests                ساکن
 *   GET  /service-requests/mine           ساکن
 *   GET  /service-requests                مدیر ساختمان (همه) · مدیر دپارتمان (دپارتمان خودش) · مجری (کارهای خودش)
 *   GET  /service-requests/team           کارکنان فعال یک دپارتمان (برای انتخاب مجری)
 *   POST /service-requests/:id/schedule   تأیید/تغییر زمان (+ سپردن به مجری)
 *   POST /service-requests/:id/assign     سپردن / انتقال به کارمند دیگر
 *   POST /service-requests/:id/reject · /start · /done · /cancel
 */
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  /* ───────────── ساکن ───────────── */

  @Roles('resident')
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateServiceRequestDto) {
    const tenantId = user.tenant_id!
    const preferred = new Date(dto.preferred_at)
    const now = Date.now()
    if (preferred.getTime() < now - 5 * 60_000) throw new BadRequestException('زمان انتخاب‌شده گذشته است')
    if (preferred.getTime() > now + 60 * 86_400_000) throw new BadRequestException('زمان خدمت حداکثر ۶۰ روز بعد قابل ثبت است')
    return this.db.withTenant(tenantId, async (client) => {
      const type = (
        await client.query<{ id: string; title: string; department_code: string }>(
          `SELECT id, title, department_code FROM facility.service_types WHERE id = $1 AND is_active`,
          [dto.service_type_id],
        )
      ).rows[0]
      if (!type) throw new NotFoundException('این خدمت فعال نیست')
      const unitId = await unitOfResident(client, user)
      if (!unitId) throw new ForbiddenException('برای ثبت درخواست باید عضو فعال یک واحد باشید')
      const person = user.pid ?? null
      if (!person) throw new ForbiddenException('پروفایل ساکن پیدا نشد')
      const meta = (
        await client.query<{ name: string; unit_no: string }>(
          `SELECT (SELECT name FROM residency.users WHERE id = $1) AS name, (SELECT unit_number FROM property.units WHERE id = $2) AS unit_no`,
          [person, unitId],
        )
      ).rows[0]

      const ins = await client.query<{ id: string }>(
        `INSERT INTO facility.service_requests
           (tenant_id, service_type_id, service_title, department_code, unit_id, requester_person, requester_name, preferred_at, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [tenantId, type.id, type.title, type.department_code, unitId, person, meta?.name ?? null, preferred.toISOString(), dto.note?.trim() || null],
      )
      const id = ins.rows[0].id

      // به مدیر همان دپارتمان؛ اگر مدیری تعیین نشده به مدیر ساختمان تا درخواست گم نشود
      const mgr = (await client.query<{ manager_user_id: string | null }>(`SELECT manager_user_id FROM identity.departments WHERE code = $1`, [type.department_code])).rows[0]
      const title = `درخواست ${type.title} — واحد ${faDigits(meta?.unit_no ?? '')}`
      const body = `زمان دلخواه: ${tehranWhen(preferred)}`
      if (mgr?.manager_user_id) {
        await notifyInbox(client, tenantId, [{ login: mgr.manager_user_id }], { kind: 'service_request', title, body, link: '/staff/services', ref: id })
      } else {
        await notifyInbox(client, tenantId, [{ role: 'admin' }], {
          kind: 'service_request',
          title,
          body: `${body} — برای این دپارتمان مدیری تعیین نشده است`,
          link: '/admin/services',
          ref: id,
        })
      }
      await auditLog(client, tenantId, user, 'service_request.created', { summary: `${title}`, service_request_id: id, unit_id: unitId })
      this.events.publish('service_request.created', { tenantId, requestId: id, departmentCode: type.department_code })
      return { id, status: 'submitted' as Status }
    })
  }

  @Roles('resident')
  @Get('mine')
  mine(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      if (!user.pid) return []
      const r = await client.query<RequestRow>(
        `${SELECT_REQUESTS} WHERE r.requester_person = $1
            AND (r.status IN ('submitted','scheduled','assigned','in_progress') OR r.updated_at > now() - interval '30 days')
          ORDER BY r.created_at DESC LIMIT 60`,
        [user.pid],
      )
      // نام مجری برای ساکن لازم نیست؛ فقط وضعیت و زمان
      return r.rows.map(({ assigned_to: _a, assigned_name: _n, ...x }) => x)
    })
  }

  @Roles('resident')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const r = await this.load(client, id, true)
      if (r.requester_person !== user.pid) throw new ForbiddenException('این درخواست مال شما نیست')
      if (!['submitted', 'scheduled', 'assigned'].includes(r.status)) throw new ConflictException('این درخواست دیگر قابل لغو نیست')
      await client.query(`UPDATE facility.service_requests SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id])
      const targets = await this.staffTargets(client, r)
      await notifyInbox(client, tenantId, targets, {
        kind: 'service_cancelled', title: `${r.service_title} — واحد ${faDigits(r.unit_no ?? '')} لغو شد`, body: tehranWhen(new Date(r.scheduled_at ?? r.preferred_at)), link: '/staff/services', ref: id,
      })
      await auditLog(client, tenantId, user, 'service_request.cancelled', { summary: `${r.service_title} توسط ساکن لغو شد`, service_request_id: id })
      return { id, status: 'cancelled' as Status }
    })
  }

  /* ───────────── مدیر ساختمان / مدیر دپارتمان / مجری ───────────── */

  @Roles('admin', 'staff')
  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() q: ListQuery) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      if (!isAdmin(user) && !hasServiceDesk(user)) throw new ForbiddenException('دسترسی به درخواست‌های خدمات ندارید')
      const managed = isAdmin(user) ? [] : await managedDepartments(client, user.sub)
      const where: string[] = []
      const vals: unknown[] = []
      if (!isAdmin(user)) {
        vals.push(managed, user.sub)
        where.push(`(r.department_code = ANY($1::text[]) OR r.assigned_to = $2)`)
      }
      if (q.department_code) {
        vals.push(q.department_code)
        where.push(`r.department_code = $${vals.length}`)
      }
      const st = q.status ?? 'open'
      if (st === 'open') where.push(`r.status IN ('submitted','scheduled','assigned','in_progress')`)
      else if (st !== 'all') {
        vals.push(st)
        where.push(`r.status = $${vals.length}`)
      } else where.push(`(r.status IN ('submitted','scheduled','assigned','in_progress') OR r.updated_at > now() - interval '14 days')`)
      const r = await client.query<RequestRow>(`${SELECT_REQUESTS} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ${ORDER} LIMIT 300`, vals)
      const depts = isAdmin(user)
        ? (await client.query<{ code: string; name: string }>(`SELECT code, name FROM identity.departments WHERE is_active ORDER BY sort`)).rows
        : (await client.query<{ code: string; name: string }>(`SELECT code, name FROM identity.departments WHERE manager_user_id = $1 AND is_active`, [user.sub])).rows
      return {
        managed_departments: depts,
        items: r.rows.map((x) => ({ ...x, can_manage: isAdmin(user) || managed.includes(x.department_code), is_mine: x.assigned_to === user.sub })),
      }
    })
  }

  /** کارکنان فعال یک دپارتمان — برای انتخاب مجری (فقط مدیر ساختمان و مدیر همان دپارتمان) */
  @Roles('admin', 'staff')
  @Get('team')
  team(@CurrentUser() user: JwtPayload, @Query('department_code') dept: string) {
    if (!dept) throw new BadRequestException('دپارتمان را مشخص کنید')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      await needManageDept(client, user, dept)
      const r = await client.query<{ id: string; full_name: string; open_count: number }>(
        `SELECT u.id, u.full_name,
                (SELECT count(*) FROM facility.service_requests r WHERE r.assigned_to = u.id AND r.status IN ('assigned','in_progress'))::int AS open_count
           FROM identity.users u
          WHERE u.role = 'staff' AND u.is_active AND u.department = $1 ORDER BY u.full_name`,
        [dept],
      )
      return r.rows
    })
  }

  @Roles('admin', 'staff')
  @Post(':id/schedule')
  @HttpCode(200)
  schedule(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const r = await this.load(client, id, true)
      await needManageDept(client, user, r.department_code)
      if (!OPEN.includes(r.status) || r.status === 'in_progress') throw new ConflictException('این درخواست در این وضعیت قابل زمان‌بندی نیست')
      const when = new Date(dto.scheduled_at ?? r.scheduled_at ?? r.preferred_at)
      if (when.getTime() < Date.now() - 5 * 60_000) throw new BadRequestException('زمان انتخاب‌شده گذشته است')
      const assignee = dto.assigned_to ? await this.assertAssignee(client, r.department_code, dto.assigned_to) : (r.assigned_to ?? null)
      const status: Status = assignee ? 'assigned' : 'scheduled'
      await client.query(
        `UPDATE facility.service_requests SET status = $2, scheduled_at = $3, assigned_to = $4, decided_by = $5, updated_at = now() WHERE id = $1`,
        [id, status, when.toISOString(), assignee, user.sub],
      )
      await notifyInbox(client, tenantId, [{ person: r.requester_person }], {
        kind: 'service_scheduled', title: `${r.service_title} تأیید شد ✅`, body: `زمان: ${tehranWhen(when)}`, link: '/resident/services', ref: id,
      })
      if (assignee && assignee !== r.assigned_to) await this.notifyAssignee(client, tenantId, assignee, r, when)
      await auditLog(client, tenantId, user, 'service_request.scheduled', { summary: `${r.service_title} واحد ${r.unit_no} زمان‌بندی شد`, service_request_id: id, assigned_to: assignee })
      return { id, status, scheduled_at: when.toISOString(), assigned_to: assignee }
    })
  }

  @Roles('admin', 'staff')
  @Post(':id/assign')
  @HttpCode(200)
  assign(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const r = await this.load(client, id, true)
      await needManageDept(client, user, r.department_code)
      if (!OPEN.includes(r.status)) throw new ConflictException('این درخواست بسته شده است')
      const assignee = await this.assertAssignee(client, r.department_code, dto.assigned_to)
      // اگر مدیر هنوز زمان را تأیید نکرده، زمان درخواستیِ ساکن تأیید می‌شود
      const when = new Date(r.scheduled_at ?? r.preferred_at)
      const first = r.status === 'submitted'
      await client.query(
        `UPDATE facility.service_requests SET status = 'assigned', scheduled_at = $2, assigned_to = $3, decided_by = $4, updated_at = now() WHERE id = $1`,
        [id, when.toISOString(), assignee, user.sub],
      )
      if (first) {
        await notifyInbox(client, tenantId, [{ person: r.requester_person }], {
          kind: 'service_scheduled', title: `${r.service_title} تأیید شد ✅`, body: `زمان: ${tehranWhen(when)}`, link: '/resident/services', ref: id,
        })
      }
      if (assignee !== r.assigned_to) {
        await this.notifyAssignee(client, tenantId, assignee, r, when)
        if (r.assigned_to) {
          await notifyInbox(client, tenantId, [{ login: r.assigned_to }], {
            kind: 'service_unassigned', title: `${r.service_title} واحد ${faDigits(r.unit_no ?? '')} به نفر دیگری منتقل شد`, link: '/staff/services', ref: id,
          })
        }
      }
      await auditLog(client, tenantId, user, 'service_request.assigned', { summary: `${r.service_title} واحد ${r.unit_no} به مجری سپرده شد`, service_request_id: id, assigned_to: assignee, from: r.assigned_to })
      return { id, status: 'assigned' as Status, assigned_to: assignee }
    })
  }

  @Roles('admin', 'staff')
  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectRequestDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const r = await this.load(client, id, true)
      await needManageDept(client, user, r.department_code)
      if (!['submitted', 'scheduled', 'assigned'].includes(r.status)) throw new ConflictException('این درخواست در این وضعیت قابل رد نیست')
      await client.query(
        `UPDATE facility.service_requests SET status = 'rejected', reject_reason = $2, decided_by = $3, updated_at = now() WHERE id = $1`,
        [id, dto.reason.trim(), user.sub],
      )
      await notifyInbox(client, tenantId, [{ person: r.requester_person }], {
        kind: 'service_rejected', title: `${r.service_title} انجام نمی‌شود`, body: `دلیل: ${dto.reason.trim()}`, link: '/resident/services', ref: id,
      })
      if (r.assigned_to) {
        await notifyInbox(client, tenantId, [{ login: r.assigned_to }], { kind: 'service_unassigned', title: `${r.service_title} واحد ${faDigits(r.unit_no ?? '')} لغو شد`, link: '/staff/services', ref: id })
      }
      await auditLog(client, tenantId, user, 'service_request.rejected', { summary: `${r.service_title} رد شد`, service_request_id: id, reason: dto.reason })
      return { id, status: 'rejected' as Status }
    })
  }

  @Roles('admin', 'staff')
  @Post(':id/start')
  @HttpCode(200)
  start(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.progress(user, id, 'in_progress')
  }

  @Roles('admin', 'staff')
  @Post(':id/done')
  @HttpCode(200)
  done(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.progress(user, id, 'done')
  }

  /* ───────────── کمکی ───────────── */

  /** شروع/پایان کار: مجری خودش، یا مدیر دپارتمان/مدیر ساختمان */
  private progress(user: JwtPayload, id: string, to: 'in_progress' | 'done') {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const r = await this.load(client, id, true)
      const mine = r.assigned_to === user.sub
      if (!mine && !(await canManageDept(client, user, r.department_code))) throw new ForbiddenException('این کار به شما سپرده نشده است')
      const from: Status[] = to === 'in_progress' ? ['assigned'] : ['assigned', 'in_progress']
      if (!from.includes(r.status)) throw new ConflictException(to === 'in_progress' ? 'ابتدا کار باید به مجری سپرده شود' : 'این کار در این وضعیت قابل پایان نیست')
      await client.query(
        `UPDATE facility.service_requests SET status = $2, completed_at = CASE WHEN $2 = 'done' THEN now() ELSE completed_at END, updated_at = now() WHERE id = $1`,
        [id, to],
      )
      if (to === 'done') {
        await notifyInbox(client, tenantId, [{ person: r.requester_person }], {
          kind: 'service_done', title: `${r.service_title} انجام شد`, body: 'اگر مشکلی بود از بخش تیکت‌ها خبر بدهید.', link: '/resident/services', ref: id,
        })
      }
      await auditLog(client, tenantId, user, `service_request.${to}`, { summary: `${r.service_title} واحد ${r.unit_no} — ${to === 'done' ? 'انجام شد' : 'شروع شد'}`, service_request_id: id })
      return { id, status: to }
    })
  }

  private async load(client: PoolClient, id: string, lock = false): Promise<RequestRow> {
    const r = (await client.query<RequestRow>(`${SELECT_REQUESTS} WHERE r.id = $1 ${lock ? 'FOR UPDATE OF r' : ''}`, [id])).rows[0]
    if (!r) throw new NotFoundException('درخواست یافت نشد')
    return r
  }

  /** مجری باید کارمند فعالِ همان دپارتمان باشد */
  private async assertAssignee(client: PoolClient, dept: string, userId: string) {
    const u = (await client.query<{ id: string }>(`SELECT id FROM identity.users WHERE id = $1 AND role = 'staff' AND is_active AND department = $2`, [userId, dept])).rows[0]
    if (!u) throw new BadRequestException('این فرد کارمند فعالِ همین دپارتمان نیست')
    return u.id
  }

  private async notifyAssignee(client: PoolClient, tenantId: string, assignee: string, r: RequestRow, when: Date) {
    await notifyInbox(client, tenantId, [{ login: assignee }], {
      kind: 'service_assigned', title: `کار جدید: ${r.service_title} — واحد ${faDigits(r.unit_no ?? '')}`, body: `زمان: ${tehranWhen(when)}`, link: '/staff/services', ref: r.id,
    })
  }

  /** مدیر دپارتمان + مجری فعلی (برای لغو توسط ساکن) */
  private async staffTargets(client: PoolClient, r: RequestRow) {
    const m = (await client.query<{ manager_user_id: string | null }>(`SELECT manager_user_id FROM identity.departments WHERE code = $1`, [r.department_code])).rows[0]
    return [...new Set([m?.manager_user_id, r.assigned_to].filter(Boolean) as string[])].map((login) => ({ login }))
  }
}
