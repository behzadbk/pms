import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common'
import { IsBoolean, IsIn, IsISO8601, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, IsObject } from 'class-validator'
import { Type } from 'class-transformer'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { ASSET_CATEGORIES, CATEGORY_INFO, matchAsset, type AssetCategory, type AssetLite } from './detect'
import { PRIORITY_FA, TICKET_STATUS_FA, UUID_RE, actorName, audit, canManage, fa, isAdmin, isMaint, isUuid, notify, requireAdmin, requireManage, type Target } from './common'

const KIND_INFO: Record<string, { label: string; category: string }> = {
  fault: { label: 'گزارش خرابی', category: 'گزارش خرابی' },
  criticism: { label: 'انتقاد', category: 'انتقاد' },
  suggestion: { label: 'پیشنهاد', category: 'پیشنهاد' },
  direct: { label: 'پیام به مدیر', category: 'پیام به مدیر' },
}
const SLA_HOURS: Record<string, number> = { urgent: 4, high: 24, normal: 72, low: 168 }
const STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed']

export class CreateTicketDto {
  @IsIn(['fault', 'criticism', 'suggestion', 'direct']) kind: string
  @IsString() @MinLength(3, { message: 'موضوع را بنویسید' }) @MaxLength(160) subject: string
  @IsOptional() @IsString() @MaxLength(4000) body?: string
  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string
  @IsOptional() @IsString() @MaxLength(200) location?: string
  /** فقط مدیر: ثبت از طرف یک واحد / اتصال دستی به تجهیز */
  @IsOptional() @Matches(UUID_RE) unit_id?: string
  @IsOptional() @Matches(UUID_RE) asset_id?: string
  @IsOptional() @IsObject() attachments?: Record<string, unknown>
}

export class UpdateTicketDto {
  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string
  /** null = حذف اتصال تجهیز */
  @IsOptional() asset_id?: string | null
}

export class StatusDto {
  @IsIn(STATUSES) status: string
  @IsOptional() @IsString() @MaxLength(500) note?: string
}

export class CommentDto {
  @IsString() @MinLength(1) @MaxLength(2000) text: string
  /** یادداشت داخلی — فقط مدیر/نگهداری می‌بینند */
  @IsOptional() @IsBoolean() internal?: boolean
}

export class AssignDto {
  @IsOptional() assignee_login?: string | null
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) due_date?: string
  @IsOptional() @IsString() @MaxLength(500) note?: string
}

export class TicketServiceDto {
  @IsIn(['repair', 'replace', 'service', 'inspection']) type: string
  @IsString() @MinLength(2) @MaxLength(500) description: string
  @IsOptional() @IsString() @MaxLength(120) performer?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000_000) cost?: number
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) performed_on?: string
  /** اگر تیکت تجهیز ندارد: نام تجهیز جدید (با دسته‌ی تشخیص‌داده‌شده ساخته می‌شود) */
  @IsOptional() @IsString() @MaxLength(120) asset_name?: string
  @IsOptional() @IsString() @MaxLength(120) asset_location?: string
  @IsOptional() @Matches(UUID_RE) asset_id?: string
  /** true → حل‌شده، false → در حال انجام */
  @IsOptional() @IsBoolean() resolve?: boolean
}

class ListQuery {
  @IsOptional() @IsIn([...STATUSES, 'active', 'all']) status?: string
  @IsOptional() @IsIn(['fault', 'criticism', 'suggestion', 'direct', 'all']) kind?: string
  @IsOptional() @Matches(UUID_RE) asset_id?: string
}

interface Membership { id: string; unit_id: string; user_id: string; role: string; residency: string }

const TICKET_SELECT = `
  SELECT t.id, t.no, t.kind, t.category, t.asset_category, t.subject, t.body, t.priority, t.status, t.location,
         t.unit_id, u.unit_number AS unit, t.reporter_name, t.reporter_person, t.reporter_login, t.asset_id, a.name AS asset_name,
         t.assignee_login, t.assignee_name, t.sla_due_at, t.first_response_at, t.resolved_at, t.closed_at, t.created_at, t.updated_at,
         (t.sla_due_at IS NOT NULL AND t.status IN ('open','assigned','in_progress') AND t.sla_due_at < now()) AS sla_breached,
         (SELECT e.text FROM facility.ticket_events e WHERE e.ticket_id = t.id AND e.internal = false ORDER BY e.created_at DESC LIMIT 1) AS last_event,
         (SELECT count(*)::int FROM facility.ticket_events e WHERE e.ticket_id = t.id AND e.internal = false) AS event_count,
         (SELECT json_build_object('type', s.type, 'performed_on', s.performed_on) FROM facility.service_records s
           WHERE s.asset_id = t.asset_id ORDER BY s.performed_on DESC, s.created_at DESC LIMIT 1) AS last_service
    FROM facility.tickets t
    LEFT JOIN property.units u ON u.id = t.unit_id
    LEFT JOIN facility.assets a ON a.id = t.asset_id`

/**
 * سیستم تیکت: گزارش خرابی، انتقاد، پیشنهاد و پیام مستقیم به مدیر.
 *   ساکن: فقط تیکت‌های واحد خودش (پیام مستقیم فقط برای خودِ فرستنده) · مدیر: همه · کارمند نگهداری: ارجاع‌شده‌ها
 * هر تغییر وضعیت/ارجاع/نظر یک ردیف notification.inbox برای ذی‌نفع می‌نویسد تا Web Push برود.
 */
@Controller('tickets')
export class TicketsController {
  constructor(private readonly db: DatabaseService) {}

  /* ------------------------------ کمکی‌ها ------------------------------ */

  private async membership(client: PoolClient, user: JwtPayload): Promise<Membership | null> {
    if (user.role !== 'resident' && user.role !== 'child') return null
    const q = user.kind === 'family' && user.mid
      ? await client.query<Membership>(`SELECT id, unit_id, user_id, role, residency FROM residency.memberships WHERE id = $1 AND status = 'active'`, [user.mid])
      : await client.query<Membership>(
        `SELECT m.id, m.unit_id, m.user_id, m.role, m.residency FROM residency.memberships m
          WHERE m.status = 'active' AND m.user_id = COALESCE($1::uuid, (SELECT person_id FROM identity.users WHERE id = $2))
          ORDER BY (m.role = 'head') DESC, m.created_at LIMIT 1`, [user.pid ?? null, isUuid(user.sub) ? user.sub : null])
    return q.rows[0] ?? null
  }

  /** شرط دید کاربر روی ردیف‌های tickets (alias: t) */
  private scope(user: JwtPayload, m: Membership | null, params: unknown[]): string {
    if (isAdmin(user)) return 'TRUE'
    if (isMaint(user)) {
      params.push(user.sub)
      return `(t.assignee_login = $${params.length} OR t.reporter_login = $${params.length})`
    }
    if (user.role === 'resident' && m) {
      params.push(m.unit_id, m.user_id)
      return `(t.unit_id = $${params.length - 1} AND (t.kind <> 'direct' OR t.reporter_person = $${params.length}))`
    }
    const conds: string[] = []
    if (isUuid(user.sub)) { params.push(user.sub); conds.push(`t.reporter_login = $${params.length}`) }
    const pid = user.pid ?? m?.user_id
    if (pid) { params.push(pid); conds.push(`t.reporter_person = $${params.length}`) }
    return conds.length ? `(${conds.join(' OR ')})` : 'FALSE'
  }

  private shape(r: Record<string, any>, user: JwtPayload) {
    const out = { ...r }
    if (!canManage(user)) { delete out.reporter_login; delete out.assignee_login }
    delete out.reporter_person
    return out
  }

  private async load(client: PoolClient, user: JwtPayload, id: string, forUpdate = false) {
    const m = await this.membership(client, user)
    const params: unknown[] = [id]
    const sc = this.scope(user, m, params)
    const row = (await client.query(`${TICKET_SELECT} WHERE t.id = $1 AND ${sc}${forUpdate ? ' FOR UPDATE OF t' : ''}`, params)).rows[0]
    if (!row) throw new NotFoundException('تیکت یافت نشد')
    return { row, m }
  }

  private async event(client: PoolClient, tenantId: string, ticketId: string, type: string, text: string, actor: string | null, role: string | null, internal = false) {
    await client.query(
      `INSERT INTO facility.ticket_events (tenant_id, ticket_id, type, text, actor_name, actor_role, internal) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, ticketId, type, text, actor, role, internal])
  }

  /** گیرنده‌های «ذی‌نفع تیکت» به‌جز خود اقدام‌کننده */
  private reporterTarget(t: Record<string, any>): Target[] {
    return t.reporter_person ? [{ person: t.reporter_person }] : t.reporter_login ? [{ login: t.reporter_login }] : []
  }

  private reporterLink(t: Record<string, any>): string {
    return t.reporter_person ? '/resident/tickets' : '/'
  }

  private async activeAssets(client: PoolClient): Promise<AssetLite[]> {
    return (await client.query<AssetLite>(`SELECT id, name, category, location FROM facility.assets WHERE is_active ORDER BY name`)).rows
  }

  /* ------------------------------- خواندن ------------------------------- */

  /** اطلاعات واحد ساکن برای فرم ثبت (طبقه، بلوک) */
  @Get('context')
  async context(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await this.membership(client, user)
      let unit: Record<string, unknown> | null = null
      if (m) {
        unit = (await client.query(
          `SELECT u.id, u.unit_number AS number, u.floor, b.name AS building FROM property.units u
             LEFT JOIN property.buildings b ON b.id = u.building_id WHERE u.id = $1`, [m.unit_id])).rows[0] ?? null
      }
      return {
        unit,
        role: user.role,
        kinds: Object.entries(KIND_INFO).map(([id, v]) => ({ id, label: v.label })),
        asset_categories: ASSET_CATEGORIES.map((id) => ({ id, label: CATEGORY_INFO[id].label })),
      }
    })
  }

  /** پیشنهاد دسته و تجهیز از روی متن (قبل از ثبت یا برای مدیر) */
  @Get('suggest')
  async suggest(@CurrentUser() user: JwtPayload, @Query('text') text = '', @Query('location') location = '') {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = matchAsset({ subject: text.slice(0, 400), location: location.slice(0, 200) }, await this.activeAssets(client))
      return { category: r.category, category_label: r.category ? CATEGORY_INFO[r.category].label : null, asset: r.asset, candidates: r.candidates }
    })
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query() q: ListQuery) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await this.membership(client, user)
      const params: unknown[] = []
      const where: string[] = []
      where.push(this.scope(user, m, params))
      if (q.status === 'active') where.push(`t.status IN ('open','assigned','in_progress')`)
      else if (q.status && q.status !== 'all') { params.push(q.status); where.push(`t.status = $${params.length}`) }
      if (q.kind && q.kind !== 'all') { params.push(q.kind); where.push(`t.kind = $${params.length}`) }
      if (q.asset_id) { params.push(q.asset_id); where.push(`t.asset_id = $${params.length}`) }
      const rows = (await client.query(`${TICKET_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC LIMIT 500`, params)).rows
      return rows.map((r) => this.shape(r, user))
    })
  }

  @Get(':id')
  async detail(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const { row } = await this.load(client, user, id)
      const manage = canManage(user)
      const events = (await client.query(
        `SELECT id, type, text, actor_name, actor_role, internal, created_at FROM facility.ticket_events
          WHERE ticket_id = $1 ${manage ? '' : 'AND internal = false'} ORDER BY created_at, id`, [id])).rows
      const out: Record<string, unknown> = { ...this.shape(row, user), events }
      if (manage) {
        const assets = await this.activeAssets(client)
        const m = matchAsset({ subject: row.subject, body: row.body, location: row.location, assetId: row.asset_id }, assets)
        const asset = m.asset
        let history: unknown[] = []
        let related: unknown[] = []
        let overdue = false
        let interval: number | null = null
        if (asset) {
          history = (await client.query(
            `SELECT id, type, description, performer, cost::float AS cost, performed_on::text AS performed_on, ticket_id FROM facility.service_records
              WHERE asset_id = $1 ORDER BY performed_on DESC, created_at DESC LIMIT 30`, [asset.id])).rows
          related = (await client.query(
            `SELECT id, subject, status, created_at FROM facility.tickets WHERE asset_id = $1 AND id <> $2 ORDER BY created_at DESC LIMIT 10`, [asset.id, id])).rows
          const a = (await client.query<{ service_interval_days: number | null }>(`SELECT service_interval_days FROM facility.assets WHERE id = $1`, [asset.id])).rows[0]
          interval = a?.service_interval_days ?? null
          const last = (history[0] as { performed_on: string } | undefined)?.performed_on
          if (interval && last) overdue = Date.now() - new Date(last).getTime() > interval * 86_400_000
        }
        out.match = {
          category: m.category,
          category_label: m.category ? CATEGORY_INFO[m.category].label : null,
          asset, candidates: m.candidates, history, related, overdue, service_interval_days: interval,
        }
        out.work_order = (await client.query(
          `SELECT id, status, due_date::text AS due_date, assignee_name FROM facility.work_orders WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1`, [id])).rows[0] ?? null
      }
      return out
    })
  }

  /* ------------------------------- ثبت ------------------------------- */

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTicketDto) {
    if (user.role === 'super_admin') throw new ForbiddenException()
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const m = await this.membership(client, user)
      if ((user.role === 'resident' || user.role === 'child') && !m) throw new ForbiddenException('عضویت فعالی در این ساختمان ندارید')
      if (m && m.role === 'child') {
        const lv = (await client.query<{ lv: number }>(`SELECT residency.child_module_level($1, 'ticket') AS lv`, [m.id])).rows[0].lv
        if (!lv) throw new ForbiddenException('این بخش برای تو فعال نیست')
      }
      let unitId: string | null = null
      let reporterPerson: string | null = null
      let reporterLogin: string | null = null
      let reporterName: string
      if (m) {
        unitId = m.unit_id
        reporterPerson = m.user_id
        const nm = (await client.query<{ name: string; unit_number: string }>(
          `SELECT ru.name, u.unit_number FROM residency.users ru, property.units u WHERE ru.id = $1 AND u.id = $2`, [m.user_id, m.unit_id])).rows[0]
        reporterName = `${nm?.name ?? 'ساکن'} (واحد ${nm?.unit_number ?? ''})`
      } else {
        reporterLogin = isUuid(user.sub) ? user.sub : null
        reporterName = await actorName(client, user)
        if (isAdmin(user) && dto.unit_id) unitId = dto.unit_id
        if (user.role === 'guard') reporterName = `${reporterName} (نگهبانی)`
      }
      const unitNo = unitId ? (await client.query<{ unit_number: string }>(`SELECT unit_number FROM property.units WHERE id = $1`, [unitId])).rows[0]?.unit_number : null
      if (unitId && !unitNo) throw new BadRequestException('واحد یافت نشد')

      const manage = isAdmin(user)
      let priority = dto.kind === 'fault' ? (dto.priority ?? 'normal') : 'low'
      if (!manage && priority === 'high') priority = 'normal'
      if (manage && dto.priority) priority = dto.priority

      // تشخیص خودکار دسته و تجهیز (فقط خرابی)
      let assetCategory: AssetCategory | null = null
      let assetId: string | null = null
      if (dto.kind === 'fault') {
        const mt = matchAsset({ subject: dto.subject, body: dto.body, location: dto.location, assetId: manage ? dto.asset_id : null }, await this.activeAssets(client))
        assetCategory = mt.category
        assetId = mt.asset?.id ?? null
      }
      const sla = new Date(Date.now() + (dto.kind === 'fault' ? SLA_HOURS[priority] : SLA_HOURS.low) * 3_600_000)
      const info = KIND_INFO[dto.kind]
      const t = (await client.query<{ id: string; no: number }>(
        `INSERT INTO facility.tickets (tenant_id, kind, category, asset_category, subject, body, priority, location, unit_id,
                                       reporter_person, reporter_login, reporter_name, asset_id, sla_due_at, attachments)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id, no`,
        [tenantId, dto.kind, info.category, assetCategory, dto.subject.trim(), (dto.body ?? '').trim(), priority, dto.location?.trim() || null,
          unitId, reporterPerson, reporterLogin, reporterName, assetId, sla, JSON.stringify(dto.attachments ?? [])])).rows[0]
      await this.event(client, tenantId, t.id, 'created', 'تیکت ثبت شد', reporterName, user.role)

      const where = [unitNo ? `واحد ${fa(unitNo)}` : null, info.label, dto.location].filter(Boolean).join(' · ')
      await notify(client, tenantId, [{ role: 'admin' }], {
        kind: 'ticket',
        title: dto.kind === 'direct' ? `پیام جدید از ${unitNo ? 'واحد ' + fa(unitNo) : reporterName}: ${dto.subject}` : `تیکت جدید: ${dto.subject}`,
        body: where, link: '/admin/tickets', ref: t.id,
      })
      if (dto.kind === 'fault' && (priority === 'urgent' || priority === 'high')) {
        await notify(client, tenantId, [{ role: 'perm:maintenance' }], {
          kind: 'ticket', title: `خرابی ${PRIORITY_FA[priority]}: ${dto.subject}`, body: where, link: '/staff/work-orders', ref: t.id,
        })
      }
      await audit(client, tenantId, user, 'ticket.create', { ticket: t.id, kind: dto.kind })
      return { id: t.id, no: t.no, asset_id: assetId, asset_category: assetCategory }
    })
  }

  /* ------------------------------ تغییرات ------------------------------ */

  @Roles('admin')
  @Patch(':id')
  async update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTicketDto) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const { row } = await this.load(client, user, id, true)
      const who = await actorName(client, user)
      if (dto.priority && dto.priority !== row.priority) {
        const sla = new Date(new Date(row.created_at).getTime() + (row.kind === 'fault' ? SLA_HOURS[dto.priority] : SLA_HOURS.low) * 3_600_000)
        await client.query(`UPDATE facility.tickets SET priority = $2, sla_due_at = $3, updated_at = now() WHERE id = $1`, [id, dto.priority, sla])
        await this.event(client, user.tenant_id!, id, 'note', `اولویت به «${PRIORITY_FA[dto.priority]}» تغییر کرد`, who, user.role)
      }
      if (dto.asset_id !== undefined) {
        if (dto.asset_id !== null && !isUuid(dto.asset_id)) throw new BadRequestException('شناسه تجهیز نامعتبر است')
        let name: string | null = null
        if (dto.asset_id) {
          name = (await client.query<{ name: string }>(`SELECT name FROM facility.assets WHERE id = $1`, [dto.asset_id])).rows[0]?.name ?? null
          if (!name) throw new NotFoundException('تجهیز یافت نشد')
        }
        await client.query(`UPDATE facility.tickets SET asset_id = $2, updated_at = now() WHERE id = $1`, [id, dto.asset_id])
        await this.event(client, user.tenant_id!, id, 'asset', name ? `تجهیز «${name}» به تیکت متصل شد` : 'اتصال تجهیز برداشته شد', who, user.role, true)
      }
      return { ok: true }
    })
  }

  /** تغییر وضعیت: مدیر همه‌چیز · کارمند ارجاع‌شده: شروع/حل · ساکن فرستنده: بستن یا بازگشایی تیکت حل‌شده */
  @Post(':id/status')
  async setStatus(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const { row, m } = await this.load(client, user, id, true)
      if (row.status === dto.status) throw new ConflictException('تیکت از قبل در همین وضعیت است')
      if (!isAdmin(user)) {
        if (isMaint(user)) {
          if (row.assignee_login !== user.sub) throw new ForbiddenException('این تیکت به شما ارجاع نشده است')
          if (!['in_progress', 'resolved'].includes(dto.status)) throw new ForbiddenException('فقط شروع رسیدگی یا حل‌شده')
        } else {
          const own = row.reporter_person ? row.reporter_person === (m?.user_id ?? user.pid) : row.reporter_login === user.sub
          if (!own || row.status !== 'resolved' || !['closed', 'open'].includes(dto.status)) throw new ForbiddenException('اجازه‌ی این تغییر را ندارید')
        }
      }
      const who = await actorName(client, user)
      await client.query(
        `UPDATE facility.tickets SET status = $2, updated_at = now(),
                first_response_at = COALESCE(first_response_at, CASE WHEN $3 THEN now() END),
                resolved_at = CASE WHEN $2 = 'resolved' THEN now() WHEN $2 IN ('open','assigned','in_progress') THEN NULL ELSE resolved_at END,
                closed_at   = CASE WHEN $2 = 'closed' THEN now() ELSE NULL END
          WHERE id = $1`, [id, dto.status, !(row.reporter_login === user.sub)])
      const label = TICKET_STATUS_FA[dto.status]
      const text = `وضعیت به «${label}» تغییر کرد${dto.note?.trim() ? ` — ${dto.note.trim()}` : ''}`
      await this.event(client, tenantId, id, 'status', text, who, user.role)
      // کار مرتبط هم‌گام شود
      if (dto.status === 'in_progress') await client.query(`UPDATE facility.work_orders SET status = 'in_progress', updated_at = now() WHERE ticket_id = $1 AND status = 'open'`, [id])
      if (dto.status === 'resolved') await client.query(`UPDATE facility.work_orders SET status = 'done', completed_at = now(), updated_at = now() WHERE ticket_id = $1 AND status IN ('open','in_progress')`, [id])
      if (dto.status === 'open') await client.query(`UPDATE facility.work_orders SET status = 'open', completed_at = NULL, updated_at = now() WHERE id = (SELECT id FROM facility.work_orders WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1) AND status = 'done'`, [id])

      const toReporter = this.reporterTarget(row).filter((t) => t.person !== (m?.user_id ?? user.pid) && t.login !== user.sub)
      await notify(client, tenantId, toReporter, {
        kind: 'ticket', title: `وضعیت تیکت «${row.subject}» تغییر کرد`, body: text, link: this.reporterLink(row), ref: id,
      })
      if (!isAdmin(user)) await notify(client, tenantId, [{ role: 'admin' }], { kind: 'ticket', title: `تیکت «${row.subject}»: ${label}`, body: `${who}`, link: '/admin/tickets', ref: id })
      else if (row.assignee_login && dto.status !== 'in_progress') await notify(client, tenantId, [{ login: row.assignee_login }], { kind: 'ticket', title: `تیکت «${row.subject}»: ${label}`, body: dto.note ?? null, link: '/staff/work-orders', ref: id })
      await audit(client, tenantId, user, 'ticket.status', { ticket: id, from: row.status, to: dto.status })
      return { ok: true, status: dto.status }
    })
  }

  @Post(':id/comments')
  async comment(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CommentDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const { row, m } = await this.load(client, user, id)
      const manage = canManage(user)
      const internal = !!dto.internal
      if (internal && !manage) throw new ForbiddenException('یادداشت داخلی فقط برای مدیر/نگهداری است')
      if (row.status === 'closed' && !manage) throw new ConflictException('تیکت بسته است')
      const who = await actorName(client, user)
      await this.event(client, tenantId, id, 'comment', dto.text.trim(), who, user.role, internal)
      if (manage && !internal) await client.query(`UPDATE facility.tickets SET first_response_at = COALESCE(first_response_at, now()), updated_at = now() WHERE id = $1`, [id])
      else await client.query(`UPDATE facility.tickets SET updated_at = now() WHERE id = $1`, [id])
      if (!internal) {
        const me = (t: Target) => t.person === (m?.user_id ?? user.pid) || t.login === user.sub
        const toReporter = this.reporterTarget(row).filter((t) => !me(t))
        await notify(client, tenantId, toReporter, { kind: 'ticket', title: `پاسخ جدید به «${row.subject}»`, body: dto.text.trim().slice(0, 140), link: this.reporterLink(row), ref: id })
        if (row.assignee_login && row.assignee_login !== user.sub) await notify(client, tenantId, [{ login: row.assignee_login }], { kind: 'ticket', title: `نظر جدید روی «${row.subject}»`, body: dto.text.trim().slice(0, 140), link: '/staff/work-orders', ref: id })
        if (!isAdmin(user)) await notify(client, tenantId, [{ role: 'admin' }], { kind: 'ticket', title: `نظر جدید روی «${row.subject}»`, body: `${who}: ${dto.text.trim().slice(0, 120)}`, link: '/admin/tickets', ref: id })
      }
      return { ok: true }
    })
  }

  @Roles('admin')
  @Post(':id/assign')
  async assign(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const { row } = await this.load(client, user, id, true)
      const who = await actorName(client, user)
      const wo = (await client.query<{ id: string }>(
        `SELECT id FROM facility.work_orders WHERE ticket_id = $1 AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 1`, [id])).rows[0]
      if (!dto.assignee_login) {
        await client.query(`UPDATE facility.tickets SET assignee_login = NULL, assignee_name = NULL, status = CASE WHEN status = 'assigned' THEN 'open' ELSE status END, updated_at = now() WHERE id = $1`, [id])
        if (wo) await client.query(`UPDATE facility.work_orders SET status = 'cancelled', updated_at = now() WHERE id = $1`, [wo.id])
        await this.event(client, tenantId, id, 'assign', 'ارجاع برداشته شد', who, user.role)
        return { ok: true }
      }
      if (!isUuid(dto.assignee_login)) throw new BadRequestException('شناسه کارمند نامعتبر است')
      const staff = (await client.query<{ id: string; full_name: string }>(
        `SELECT id, full_name FROM identity.users WHERE id = $1 AND role = 'staff' AND is_active AND ('maintenance' = ANY(permissions) OR department IN ('maintenance','cleaning'))`, [dto.assignee_login])).rows[0]
      if (!staff) throw new BadRequestException('این کارمند دسترسی «نگهداری» ندارد')
      const due = dto.due_date ?? (row.sla_due_at ? new Date(row.sla_due_at).toISOString().slice(0, 10) : null)
      await client.query(
        `UPDATE facility.tickets SET assignee_login = $2, assignee_name = $3, updated_at = now(),
                status = CASE WHEN status IN ('open','assigned') THEN 'assigned' ELSE status END,
                first_response_at = COALESCE(first_response_at, now()) WHERE id = $1`, [id, staff.id, staff.full_name])
      if (wo) {
        await client.query(`UPDATE facility.work_orders SET assignee_login = $2, assignee_name = $3, due_date = COALESCE($4::date, due_date), updated_at = now() WHERE id = $1`, [wo.id, staff.id, staff.full_name, due])
      } else {
        await client.query(
          `INSERT INTO facility.work_orders (tenant_id, title, description, asset_id, ticket_id, priority, assignee_login, assignee_name, due_date, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10)`,
          [tenantId, row.subject, [row.body, row.location ? `محل: ${row.location}` : null, dto.note].filter(Boolean).join('\n'), row.asset_id, id, row.priority, staff.id, staff.full_name, due, user.sub])
      }
      await this.event(client, tenantId, id, 'assign', `به ${staff.full_name} ارجاع شد${dto.note?.trim() ? ` — ${dto.note.trim()}` : ''}`, who, user.role)
      await notify(client, tenantId, [{ login: staff.id }], {
        kind: 'ticket', title: `کار جدید: ${row.subject}`, body: [row.location, due ? `مهلت ${due}` : null].filter(Boolean).join(' · '), link: '/staff/work-orders', ref: id,
      })
      if (row.status === 'open') await notify(client, tenantId, this.reporterTarget(row), {
        kind: 'ticket', title: `تیکت «${row.subject}» در حال پیگیری است`, body: 'به کارشناس فنی ارجاع شد', link: this.reporterLink(row), ref: id,
      })
      await audit(client, tenantId, user, 'ticket.assign', { ticket: id, assignee: staff.id })
      return { ok: true }
    })
  }

  /** ثبت تعمیر/تعویض روی تجهیز + (اختیاری) حل تیکت — همان «ثبت تعمیر / تعویض» پنل مدیر */
  @Post(':id/service')
  async service(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TicketServiceDto) {
    requireManage(user)
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const { row } = await this.load(client, user, id, true)
      if (isMaint(user) && row.assignee_login !== user.sub) throw new ForbiddenException('این تیکت به شما ارجاع نشده است')
      const who = await actorName(client, user)
      let assetId: string | null = dto.asset_id ?? row.asset_id ?? null
      if (!assetId) {
        if (!dto.asset_name?.trim()) throw new BadRequestException('نام تجهیز را وارد کنید')
        const cat = (row.asset_category as string) ?? 'other'
        assetId = (await client.query<{ id: string }>(
          `INSERT INTO facility.assets (tenant_id, name, category, location) VALUES ($1,$2,$3,$4) RETURNING id`,
          [tenantId, dto.asset_name.trim(), cat, dto.asset_location?.trim() || row.location || null])).rows[0].id
      }
      const wo = (await client.query<{ id: string }>(`SELECT id FROM facility.work_orders WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1`, [id])).rows[0]
      await client.query(
        `INSERT INTO facility.service_records (tenant_id, asset_id, ticket_id, work_order_id, type, description, performer, cost, performed_on, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::date, CURRENT_DATE),$10)`,
        [tenantId, assetId, id, wo?.id ?? null, dto.type, dto.description.trim(), (dto.performer ?? who).trim(), dto.cost ?? 0, dto.performed_on ?? null, user.sub])
      const resolve = dto.resolve !== false
      const status = resolve ? 'resolved' : row.status === 'resolved' ? 'resolved' : 'in_progress'
      await client.query(
        `UPDATE facility.tickets SET asset_id = $2, status = $3, updated_at = now(),
                first_response_at = COALESCE(first_response_at, now()),
                resolved_at = CASE WHEN $3 = 'resolved' THEN COALESCE(resolved_at, now()) ELSE resolved_at END WHERE id = $1`, [id, assetId, status])
      if (resolve && wo) await client.query(`UPDATE facility.work_orders SET status = 'done', completed_at = now(), updated_at = now() WHERE id = $1 AND status IN ('open','in_progress')`, [wo.id])
      const typeFa = { repair: 'تعمیر', replace: 'تعویض', service: 'سرویس دوره‌ای', inspection: 'بازدید' }[dto.type]
      await this.event(client, tenantId, id, 'service', `${typeFa} ثبت شد: ${dto.description.trim()} (${(dto.performer ?? who).trim()})`, who, user.role)
      if (status !== row.status) {
        await this.event(client, tenantId, id, 'status', `وضعیت به «${TICKET_STATUS_FA[status]}» تغییر کرد`, who, user.role)
        await notify(client, tenantId, this.reporterTarget(row), {
          kind: 'ticket', title: `وضعیت تیکت «${row.subject}» تغییر کرد`, body: `${typeFa}: ${dto.description.trim()}`.slice(0, 140), link: this.reporterLink(row), ref: id,
        })
      }
      await audit(client, tenantId, user, 'ticket.service', { ticket: id, asset: assetId, type: dto.type })
      return { ok: true, asset_id: assetId, status }
    })
  }
}
