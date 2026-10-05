import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common'
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { Type } from 'class-transformer'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { ASSET_CATEGORIES, CATEGORY_INFO } from './detect'
import { PRIORITY_FA, UUID_RE, actorName, audit, canManage, isAdmin, isMaint, isUuid, notify, requireAdmin, requireManage } from './common'
import { MaintenanceScheduler } from './scheduler.service'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export class AssetDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string
  @IsIn(ASSET_CATEGORIES) category: string
  @IsOptional() @IsString() @MaxLength(200) location?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) service_interval_days?: number
  @IsOptional() @IsString() @MaxLength(1000) notes?: string
}
export class AssetPatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string
  @IsOptional() @IsIn(ASSET_CATEGORIES) category?: string
  @IsOptional() @IsString() @MaxLength(200) location?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) service_interval_days?: number
  @IsOptional() @IsString() @MaxLength(1000) notes?: string
  @IsOptional() @IsBoolean() is_active?: boolean
}
export class ServiceRecordDto {
  @IsIn(['repair', 'replace', 'service', 'inspection']) type: string
  @IsString() @MinLength(2) @MaxLength(500) description: string
  @IsOptional() @IsString() @MaxLength(120) performer?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number
  @IsOptional() @Matches(DATE_RE) performed_on?: string
}
export class ScheduleDto {
  @Matches(UUID_RE) asset_id: string
  @IsString() @MinLength(2) @MaxLength(160) title: string
  @Type(() => Number) @IsInt() @Min(1) @Max(3650) interval_days: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) lead_days?: number
  @IsOptional() @Matches(DATE_RE) next_due?: string
  @IsOptional() assignee_login?: string | null
  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string
}
export class SchedulePatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) title?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) interval_days?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) lead_days?: number
  @IsOptional() @Matches(DATE_RE) next_due?: string
  @IsOptional() assignee_login?: string | null
  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string
  @IsOptional() @IsBoolean() is_active?: boolean
}
export class WorkOrderDto {
  @IsString() @MinLength(3) @MaxLength(160) title: string
  @IsOptional() @IsString() @MaxLength(2000) description?: string
  @IsOptional() @Matches(UUID_RE) asset_id?: string
  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string
  @IsOptional() assignee_login?: string | null
  @IsOptional() @Matches(DATE_RE) due_date?: string
}
export class WorkOrderStatusDto {
  @IsIn(['open', 'in_progress', 'done', 'cancelled']) status: string
  @IsOptional() @IsString() @MaxLength(1000) note?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number
  @IsOptional() @IsString() @MaxLength(120) performer?: string
}
class WoQuery {
  @IsOptional() @IsIn(['active', 'done', 'all']) status?: string
}

/**
 * CMMS: تجهیزات + سابقه‌ی سرویس + دستور کار + برنامه‌ی سرویس دوره‌ای.
 * دسترسی: مدیر و کارمند دارای دسترسی «maintenance».
 */
@Controller()
export class CmmsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly scheduler: MaintenanceScheduler,
  ) {}

  private async staffName(client: PoolClient, id: string): Promise<string> {
    const s = (await client.query<{ full_name: string }>(
      `SELECT full_name FROM identity.users WHERE id = $1 AND role = 'staff' AND is_active AND ('maintenance' = ANY(permissions) OR department IN ('maintenance','cleaning'))`, [id])).rows[0]
    if (!s) throw new BadRequestException('این کارمند دسترسی «نگهداری» ندارد')
    return s.full_name
  }

  /* ------------------------------- تیم ------------------------------- */

  @Get('maintenance/team')
  async team(@CurrentUser() user: JwtPayload) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) =>
      (await client.query(
        `SELECT u.id, u.full_name AS name, u.username, u.department,
                (SELECT count(*)::int FROM facility.work_orders w WHERE w.assignee_login = u.id AND w.status IN ('open','in_progress')) AS open_orders
           FROM identity.users u WHERE u.role = 'staff' AND u.is_active AND ('maintenance' = ANY(u.permissions) OR u.department IN ('maintenance','cleaning')) ORDER BY u.full_name`)).rows)
  }

  /* ------------------------------ تجهیزات ------------------------------ */

  @Get('assets')
  async assets(@CurrentUser() user: JwtPayload, @Query('all') all?: string) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) => ({
      categories: ASSET_CATEGORIES.map((id) => ({ id, label: CATEGORY_INFO[id].label })),
      assets: (await client.query(
        `SELECT a.id, a.name, a.category, a.location, a.service_interval_days, a.notes, a.is_active, a.created_at,
                (SELECT row_to_json(s) FROM (SELECT type, performed_on, description FROM facility.service_records r WHERE r.asset_id = a.id ORDER BY performed_on DESC, created_at DESC LIMIT 1) s) AS last_service,
                (SELECT count(*)::int FROM facility.tickets t WHERE t.asset_id = a.id AND t.status IN ('open','assigned','in_progress')) AS open_tickets,
                (SELECT min(next_due)::text FROM facility.maintenance_schedules m WHERE m.asset_id = a.id AND m.is_active) AS next_due
           FROM facility.assets a ${all === '1' ? '' : 'WHERE a.is_active'} ORDER BY a.category, a.name`)).rows,
    }))
  }

  @Get('assets/:id')
  async asset(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const a = (await client.query(`SELECT * FROM facility.assets WHERE id = $1`, [id])).rows[0]
      if (!a) throw new NotFoundException('تجهیز یافت نشد')
      const history = (await client.query(
        `SELECT id, type, description, performer, cost::float AS cost, performed_on::text AS performed_on, ticket_id FROM facility.service_records WHERE asset_id = $1 ORDER BY performed_on DESC, created_at DESC`, [id])).rows
      const tickets = (await client.query(`SELECT id, subject, status, created_at FROM facility.tickets WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 20`, [id])).rows
      return { ...a, history, tickets }
    })
  }

  @Post('assets')
  async createAsset(@CurrentUser() user: JwtPayload, @Body() dto: AssetDto) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = (await client.query(
        `INSERT INTO facility.assets (tenant_id, name, category, location, service_interval_days, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [user.tenant_id, dto.name.trim(), dto.category, dto.location?.trim() || null, dto.service_interval_days ?? null, dto.notes?.trim() || null])).rows[0]
      await audit(client, user.tenant_id!, user, 'asset.create', { asset: r.id, name: dto.name })
      return r
    })
  }

  @Patch('assets/:id')
  async patchAsset(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssetPatchDto) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `UPDATE facility.assets SET name = COALESCE($2, name), category = COALESCE($3, category), location = COALESCE($4, location),
                service_interval_days = COALESCE($5, service_interval_days), notes = COALESCE($6, notes), is_active = COALESCE($7, is_active)
          WHERE id = $1`, [id, dto.name?.trim() ?? null, dto.category ?? null, dto.location?.trim() ?? null, dto.service_interval_days ?? null, dto.notes?.trim() ?? null, dto.is_active ?? null])
      if (!r.rowCount) throw new NotFoundException('تجهیز یافت نشد')
      return { ok: true }
    })
  }

  /** حذف نرم: سابقه‌ی سرویس حفظ می‌شود */
  @Roles('admin')
  @Delete('assets/:id')
  async deleteAsset(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(`UPDATE facility.assets SET is_active = false WHERE id = $1`, [id])
      if (!r.rowCount) throw new NotFoundException('تجهیز یافت نشد')
      await client.query(`UPDATE facility.maintenance_schedules SET is_active = false WHERE asset_id = $1`, [id])
      return { ok: true }
    })
  }

  @Post('assets/:id/service-records')
  async addRecord(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ServiceRecordDto) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      if (!(await client.query(`SELECT 1 FROM facility.assets WHERE id = $1`, [id])).rowCount) throw new NotFoundException('تجهیز یافت نشد')
      const who = await actorName(client, user)
      const r = (await client.query(
        `INSERT INTO facility.service_records (tenant_id, asset_id, type, description, performer, cost, performed_on, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date, CURRENT_DATE),$8) RETURNING id`,
        [user.tenant_id, id, dto.type, dto.description.trim(), (dto.performer ?? who).trim(), dto.cost ?? 0, dto.performed_on ?? null, user.sub])).rows[0]
      return r
    })
  }

  /* ---------------------------- برنامه‌ی دوره‌ای ---------------------------- */

  @Get('maintenance/schedules')
  async schedules(@CurrentUser() user: JwtPayload) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) =>
      (await client.query(
        `SELECT s.id, s.asset_id, a.name AS asset_name, a.category AS asset_category, a.location AS asset_location, s.title, s.interval_days, s.lead_days,
                s.last_done::text AS last_done, s.next_due::text AS next_due, s.assignee_login, au.full_name AS assignee_name, s.priority, s.is_active,
                (s.next_due - (now() AT TIME ZONE 'Asia/Tehran')::date) AS days_left,
                (SELECT row_to_json(w) FROM (SELECT id, status FROM facility.work_orders w WHERE w.schedule_id = s.id AND w.status IN ('open','in_progress') LIMIT 1) w) AS work_order
           FROM facility.maintenance_schedules s
           JOIN facility.assets a ON a.id = s.asset_id
           LEFT JOIN identity.users au ON au.id = s.assignee_login
          WHERE s.is_active AND a.is_active
          ORDER BY s.next_due, a.name`)).rows)
  }

  @Post('maintenance/schedules')
  async createSchedule(@CurrentUser() user: JwtPayload, @Body() dto: ScheduleDto) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      if (!(await client.query(`SELECT 1 FROM facility.assets WHERE id = $1 AND is_active`, [dto.asset_id])).rowCount) throw new NotFoundException('تجهیز یافت نشد')
      if (dto.assignee_login) { if (!isUuid(dto.assignee_login)) throw new BadRequestException('کارمند نامعتبر'); await this.staffName(client, dto.assignee_login) }
      const r = (await client.query(
        `INSERT INTO facility.maintenance_schedules (tenant_id, asset_id, title, interval_days, lead_days, next_due, assignee_login, priority)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, (now() AT TIME ZONE 'Asia/Tehran')::date + $4::int),$7,$8) RETURNING id, next_due`,
        [user.tenant_id, dto.asset_id, dto.title.trim(), dto.interval_days, dto.lead_days ?? 3, dto.next_due ?? null, dto.assignee_login ?? null, dto.priority ?? 'normal'])).rows[0]
      await audit(client, user.tenant_id!, user, 'schedule.create', { schedule: r.id })
      return r
    })
  }

  @Patch('maintenance/schedules/:id')
  async patchSchedule(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SchedulePatchDto) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      if (dto.assignee_login) { if (!isUuid(dto.assignee_login)) throw new BadRequestException('کارمند نامعتبر'); await this.staffName(client, dto.assignee_login) }
      const clearAssignee = dto.assignee_login === null
      const r = await client.query(
        `UPDATE facility.maintenance_schedules SET title = COALESCE($2, title), interval_days = COALESCE($3, interval_days), lead_days = COALESCE($4, lead_days),
                next_due = COALESCE($5::date, next_due), assignee_login = CASE WHEN $9 THEN NULL ELSE COALESCE($6::uuid, assignee_login) END,
                priority = COALESCE($7, priority), is_active = COALESCE($8, is_active) WHERE id = $1`,
        [id, dto.title?.trim() ?? null, dto.interval_days ?? null, dto.lead_days ?? null, dto.next_due ?? null, dto.assignee_login ?? null, dto.priority ?? null, dto.is_active ?? null, clearAssignee])
      if (!r.rowCount) throw new NotFoundException('برنامه یافت نشد')
      return { ok: true }
    })
  }

  @Delete('maintenance/schedules/:id')
  async deleteSchedule(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      await client.query(`UPDATE facility.work_orders SET status = 'cancelled', updated_at = now() WHERE schedule_id = $1 AND status IN ('open','in_progress')`, [id])
      const r = await client.query(`DELETE FROM facility.maintenance_schedules WHERE id = $1`, [id])
      if (!r.rowCount) throw new NotFoundException('برنامه یافت نشد')
      return { ok: true }
    })
  }

  /** اجرای دستی همان job روزانه (برای مدیر) */
  @Roles('admin')
  @Post('maintenance/schedules/run')
  async runNow(@CurrentUser() user: JwtPayload) {
    return { created: await this.scheduler.runTenant(user.tenant_id!) }
  }

  /* ------------------------------ دستور کار ------------------------------ */

  @Get('work-orders')
  async workOrders(@CurrentUser() user: JwtPayload, @Query() q: WoQuery) {
    requireManage(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const params: unknown[] = []
      const where: string[] = []
      if (!isAdmin(user)) { params.push(user.sub); where.push(`(w.assignee_login = $${params.length} OR w.assignee_login IS NULL)`) }
      if (q.status === 'done') where.push(`w.status IN ('done','cancelled')`)
      else if (q.status !== 'all') where.push(`w.status IN ('open','in_progress')`)
      return (await client.query(
        `SELECT w.id, w.title, w.description, w.priority, w.status, w.due_date::text AS due_date, w.completed_at, w.result_note, w.created_at,
                w.assignee_login, w.assignee_name, w.asset_id, a.name AS asset_name, a.location AS asset_location,
                w.ticket_id, t.subject AS ticket_subject, t.location AS ticket_location, t.reporter_name, u.unit_number AS ticket_unit,
                w.schedule_id, (w.status IN ('open','in_progress') AND w.due_date IS NOT NULL AND w.due_date < (now() AT TIME ZONE 'Asia/Tehran')::date) AS overdue
           FROM facility.work_orders w
           LEFT JOIN facility.assets a ON a.id = w.asset_id
           LEFT JOIN facility.tickets t ON t.id = w.ticket_id
           LEFT JOIN property.units u ON u.id = t.unit_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY (w.status IN ('done','cancelled')), CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, w.due_date NULLS LAST, w.created_at DESC
          LIMIT 300`, params)).rows
    })
  }

  @Roles('admin')
  @Post('work-orders')
  async createWorkOrder(@CurrentUser() user: JwtPayload, @Body() dto: WorkOrderDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      let name: string | null = null
      if (dto.assignee_login) { if (!isUuid(dto.assignee_login)) throw new BadRequestException('کارمند نامعتبر'); name = await this.staffName(client, dto.assignee_login) }
      const r = (await client.query(
        `INSERT INTO facility.work_orders (tenant_id, title, description, asset_id, priority, assignee_login, assignee_name, due_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9) RETURNING id`,
        [tenantId, dto.title.trim(), dto.description?.trim() || null, dto.asset_id ?? null, dto.priority ?? 'normal', dto.assignee_login ?? null, name, dto.due_date ?? null, user.sub])).rows[0]
      await notify(client, tenantId, dto.assignee_login ? [{ login: dto.assignee_login }] : [{ role: 'perm:maintenance' }], {
        kind: 'workorder', title: `کار جدید: ${dto.title.trim()}`, body: dto.due_date ? `مهلت ${dto.due_date}` : null, link: '/staff/work-orders', ref: r.id,
      })
      await audit(client, tenantId, user, 'workorder.create', { id: r.id })
      return r
    })
  }

  /** بروزرسانی وضعیت توسط کارمند ارجاع‌شده یا مدیر؛ پایان کار → سابقه‌ی سرویس + بستن تیکت/برنامه‌ی دوره‌ای */
  @Post('work-orders/:id/status')
  async woStatus(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkOrderStatusDto) {
    requireManage(user)
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const w = (await client.query(`SELECT * FROM facility.work_orders WHERE id = $1 FOR UPDATE`, [id])).rows[0]
      if (!w) throw new NotFoundException('کار یافت نشد')
      if (!isAdmin(user) && w.assignee_login && w.assignee_login !== user.sub) throw new ForbiddenException('این کار به شما واگذار نشده است')
      if (!isAdmin(user) && dto.status === 'cancelled') throw new ForbiddenException('لغو فقط توسط مدیر')
      const who = await actorName(client, user)
      const take = !w.assignee_login && isMaint(user)
      await client.query(
        `UPDATE facility.work_orders SET status = $2, updated_at = now(), result_note = COALESCE($3, result_note),
                completed_at = CASE WHEN $2 IN ('done','cancelled') THEN now() ELSE NULL END,
                assignee_login = CASE WHEN $4 THEN $5::uuid ELSE assignee_login END, assignee_name = CASE WHEN $4 THEN $6 ELSE assignee_name END
          WHERE id = $1`, [id, dto.status, dto.note?.trim() || null, take, user.sub, who])
      if (dto.status === 'done') {
        if (w.schedule_id) {
          const s = (await client.query(`SELECT interval_days FROM facility.maintenance_schedules WHERE id = $1`, [w.schedule_id])).rows[0]
          if (s) await client.query(
            `UPDATE facility.maintenance_schedules SET last_done = (now() AT TIME ZONE 'Asia/Tehran')::date, next_due = (now() AT TIME ZONE 'Asia/Tehran')::date + $2::int WHERE id = $1`, [w.schedule_id, s.interval_days])
        }
        if (w.asset_id && (w.schedule_id || dto.cost !== undefined || dto.performer)) {
          await client.query(
            `INSERT INTO facility.service_records (tenant_id, asset_id, ticket_id, work_order_id, type, description, performer, cost, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [tenantId, w.asset_id, w.ticket_id, id, w.schedule_id ? 'service' : 'repair', dto.note?.trim() || w.title, (dto.performer ?? who).trim(), dto.cost ?? 0, user.sub])
        }
      }
      if (w.ticket_id) {
        const t = (await client.query(`SELECT * FROM facility.tickets WHERE id = $1 FOR UPDATE`, [w.ticket_id])).rows[0]
        const map: Record<string, string> = { in_progress: 'in_progress', done: 'resolved' }
        const ns = map[dto.status]
        if (t && ns && t.status !== ns && !(t.status === 'resolved' || t.status === 'closed')) {
          await client.query(
            `UPDATE facility.tickets SET status = $2, updated_at = now(), first_response_at = COALESCE(first_response_at, now()),
                    resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE resolved_at END WHERE id = $1`, [t.id, ns])
          const label = ns === 'resolved' ? 'حل‌شده' : 'در حال انجام'
          const text = `وضعیت به «${label}» تغییر کرد${dto.note?.trim() ? ` — ${dto.note.trim()}` : ''}`
          await client.query(`INSERT INTO facility.ticket_events (tenant_id, ticket_id, type, text, actor_name, actor_role) VALUES ($1,$2,'status',$3,$4,$5)`, [tenantId, t.id, text, who, user.role])
          await notify(client, tenantId, t.reporter_person ? [{ person: t.reporter_person }] : t.reporter_login ? [{ login: t.reporter_login }] : [], {
            kind: 'ticket', title: `وضعیت تیکت «${t.subject}» تغییر کرد`, body: text, link: t.reporter_person ? '/resident/tickets' : '/', ref: t.id,
          })
        }
      }
      if (!isAdmin(user)) {
        const label = { open: 'باز', in_progress: 'در حال انجام', done: 'انجام‌شد', cancelled: 'لغو' }[dto.status]
        await notify(client, tenantId, [{ role: 'admin' }], { kind: 'workorder', title: `کار «${w.title}»: ${label}`, body: who, link: w.ticket_id ? '/admin/tickets' : '/admin/reports', ref: id })
      }
      await audit(client, tenantId, user, 'workorder.status', { id, status: dto.status })
      return { ok: true }
    })
  }
}
