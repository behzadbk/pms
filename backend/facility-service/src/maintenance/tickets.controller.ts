import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { EventsService } from '../events/events.service'
import { unitOfResident } from '../reservations/debtor-lock'
import { CreateTicketDto, NoteDto, STATUSES, UpdateTicketDto } from './dto'

const MANAGERS = ['admin', 'staff']
const CATEGORY_LABEL: Record<string, string> = { fault: 'گزارش خرابی', criticism: 'انتقاد', suggestion: 'پیشنهاد', direct: 'پیام به مدیر' }

const SELECT = `
  SELECT t.*, u.unit_number AS unit_no, a.name AS asset_name, a.category AS asset_category,
         COALESCE((SELECT json_agg(json_build_object('at', e.created_at, 'text', e.text) ORDER BY e.created_at)
                     FROM facility.ticket_events e WHERE e.ticket_id = t.id), '[]'::json) AS timeline
    FROM facility.tickets t
    LEFT JOIN property.units u ON u.id = t.unit_id
    LEFT JOIN facility.assets a ON a.id = t.asset_id`

async function addEvent(c: PoolClient, tenantId: string, ticketId: string, text: string, actor: string) {
  await c.query(`INSERT INTO facility.ticket_events (tenant_id, ticket_id, text, actor) VALUES ($1,$2,$3,$4)`, [tenantId, ticketId, text, actor])
}

/**
 * تیکت‌ها: ساکن/کودک فقط تیکت‌های واحد خودش را می‌سازد و می‌بیند؛ مدیر و پرسنل همه را.
 * هر تغییر در «روند پیگیری» (ticket_events) ثبت می‌شود و رویداد برای اعلان منتشر می‌شود.
 */
@Controller('maintenance')
export class TicketsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  @Post('tickets')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTicketDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (c) => {
      const manager = MANAGERS.includes(user.role)
      let unitId: string | null = null
      if (manager) unitId = dto.unitId ?? null
      else {
        unitId = await unitOfResident(c, user)
        if (!unitId) throw new ForbiddenException('واحد فعالی برای شما ثبت نشده است')
      }
      const unit = unitId ? (await c.query(`SELECT unit_number FROM property.units WHERE id = $1`, [unitId])).rows[0] : null
      const reporter = unit ? `واحد ${unit.unit_number}` : manager ? 'مدیریت' : 'ساکن'
      // فقط گزارش خرابی اولویت بالا می‌گیرد؛ انتقاد/پیشنهاد همیشه کم‌اهمیت است
      const priority = dto.kind === 'fault' ? (dto.priority ?? 'normal') : 'low'
      const t = (await c.query(
        `INSERT INTO facility.tickets (tenant_id, kind, subject, body, category, priority, location, unit_id, reporter, reported_by, asset_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [tenantId, dto.kind, dto.subject.trim(), dto.body?.trim() ?? '', CATEGORY_LABEL[dto.kind], priority, dto.location?.trim() || null, unitId, reporter, user.sub, manager ? (dto.assetId ?? null) : null],
      )).rows[0]
      await addEvent(c, tenantId, t.id, 'تیکت ثبت شد', user.sub)
      this.events.publish('ticket.created', { ticketId: t.id, kind: t.kind, subject: t.subject, unitId, priority }, tenantId)
      return t
    })
  }

  @Get('tickets')
  list(@CurrentUser() user: JwtPayload, @Query('status') status?: string, @Query('kind') kind?: string, @Query('assetId') assetId?: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const params: unknown[] = []
      const where: string[] = []
      if (!MANAGERS.includes(user.role)) {
        const unitId = await unitOfResident(c, user)
        if (!unitId) return []
        params.push(unitId)
        where.push(`t.unit_id = $${params.length}`)
      }
      if (status) {
        const list = status.split(',').filter((s) => (STATUSES as readonly string[]).includes(s))
        params.push(list)
        where.push(`t.status = ANY($${params.length}::text[])`)
      }
      if (kind) { params.push(kind); where.push(`t.kind = $${params.length}`) }
      if (assetId) { params.push(assetId); where.push(`t.asset_id = $${params.length}::uuid`) }
      const r = await c.query(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.created_at DESC LIMIT 500`, params)
      return r.rows
    })
  }

  @Get('tickets/:id')
  get(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const t = (await c.query(`${SELECT} WHERE t.id = $1`, [id])).rows[0]
      if (!t) throw new NotFoundException('تیکت یافت نشد')
      if (!MANAGERS.includes(user.role) && t.unit_id !== (await unitOfResident(c, user))) throw new NotFoundException('تیکت یافت نشد')
      return t
    })
  }

  @Roles('admin', 'staff')
  @Patch('tickets/:id')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTicketDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (c) => {
      const cur = (await c.query(`SELECT * FROM facility.tickets WHERE id = $1 FOR UPDATE`, [id])).rows[0]
      if (!cur) throw new NotFoundException('تیکت یافت نشد')
      if (dto.assetId) {
        const a = await c.query(`SELECT 1 FROM facility.assets WHERE id = $1`, [dto.assetId])
        if (!a.rowCount) throw new BadRequestException('تجهیز یافت نشد')
      }
      const set = (k: string) => (dto as Record<string, unknown>)[k] !== undefined
      await c.query(
        `UPDATE facility.tickets SET
           status = COALESCE($2, status), priority = COALESCE($3, priority),
           asset_id = CASE WHEN $4::boolean THEN $5::uuid ELSE asset_id END,
           assigned_to = CASE WHEN $6::boolean THEN $7::uuid ELSE assigned_to END,
           due_date = CASE WHEN $8::boolean THEN $9::date ELSE due_date END,
           resolved_at = CASE WHEN $2 = 'resolved' THEN now() WHEN $2 IS NOT NULL THEN NULL ELSE resolved_at END,
           updated_at = now()
         WHERE id = $1`,
        [id, dto.status ?? null, dto.priority ?? null, set('assetId'), dto.assetId ?? null, set('assignedTo'), dto.assignedTo ?? null, set('dueDate'), dto.dueDate ?? null],
      )
      const label = { open: 'بازگشایی شد', in_progress: 'در حال رسیدگی', resolved: 'حل‌شده' } as const
      const parts: string[] = []
      if (dto.status && dto.status !== cur.status) parts.push(`وضعیت: ${label[dto.status]}`)
      if (dto.priority && dto.priority !== cur.priority) parts.push(`اولویت تغییر کرد`)
      if (set('assetId')) parts.push(dto.assetId ? 'تجهیز مرتبط تعیین شد' : 'اتصال تجهیز برداشته شد')
      if (set('assignedTo')) parts.push(dto.assignedTo ? 'به کارمند ارجاع شد' : 'ارجاع برداشته شد')
      if (dto.note?.trim()) parts.push(dto.note.trim())
      if (parts.length) await addEvent(c, tenantId, id, parts.join(' — '), user.sub)
      if (dto.status && dto.status !== cur.status) {
        this.events.publish('ticket.status_changed', { ticketId: id, unitId: cur.unit_id, subject: cur.subject, from: cur.status, to: dto.status }, tenantId)
      }
      return (await c.query(`${SELECT} WHERE t.id = $1`, [id])).rows[0]
    })
  }

  @Roles('admin', 'staff')
  @Post('tickets/:id/notes')
  note(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const ok = await c.query(`SELECT 1 FROM facility.tickets WHERE id = $1`, [id])
      if (!ok.rowCount) throw new NotFoundException('تیکت یافت نشد')
      await addEvent(c, user.tenant_id!, id, dto.text.trim(), user.sub)
      return { ok: true }
    })
  }

  /** کارهای نگهداری: خرابی‌های باز و در حال رسیدگی — پایه‌ی صفحه‌ی «کارهای نگهداری» پرسنل */
  @Roles('admin', 'staff')
  @Get('work-orders')
  workOrders(@CurrentUser() user: JwtPayload, @Query('mine') mine?: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `${SELECT} WHERE t.kind = 'fault' AND t.status <> 'resolved' AND ($1::boolean IS NOT TRUE OR t.assigned_to = $2::uuid)
          ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at`,
        [mine === 'true', user.sub],
      )
      return r.rows
    })
  }
}
