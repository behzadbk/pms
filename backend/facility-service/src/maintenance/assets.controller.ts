import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { AssetDto, ServiceRecordDto, UpdateAssetDto } from './dto'

/** تجهیزات ساختمان و سابقه‌ی تعمیر/سرویس (CMMS) — فقط مدیر و پرسنل */
@Roles('admin', 'staff')
@Controller('maintenance')
export class AssetsController {
  constructor(private readonly db: DatabaseService) {}

  @Get('assets')
  list(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (c) =>
      (await c.query(
        `SELECT a.*, (SELECT max(performed_on) FROM facility.service_records s WHERE s.asset_id = a.id) AS last_service_on
           FROM facility.assets a WHERE a.is_active ORDER BY a.category, a.name`,
      )).rows,
    )
  }

  @Post('assets')
  create(@CurrentUser() user: JwtPayload, @Body() dto: AssetDto) {
    return this.db.withTenant(user.tenant_id!, async (c) =>
      (await c.query(
        `INSERT INTO facility.assets (tenant_id, name, category, location, service_interval_days) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [user.tenant_id, dto.name.trim(), dto.category, dto.location?.trim() || '—', dto.serviceIntervalDays ?? null],
      )).rows[0],
    )
  }

  @Patch('assets/:id')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssetDto) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `UPDATE facility.assets SET name = COALESCE($2, name), category = COALESCE($3, category), location = COALESCE($4, location),
           service_interval_days = CASE WHEN $5::boolean THEN $6::int ELSE service_interval_days END, is_active = COALESCE($7, is_active)
         WHERE id = $1 RETURNING *`,
        [id, dto.name?.trim() ?? null, dto.category ?? null, dto.location?.trim() ?? null, dto.serviceIntervalDays !== undefined, dto.serviceIntervalDays ?? null, dto.isActive ?? null],
      )
      if (!r.rows[0]) throw new NotFoundException('تجهیز یافت نشد')
      return r.rows[0]
    })
  }

  /** تجهیزی که سابقه‌ی سرویس دارد غیرفعال می‌شود تا تاریخچه نماند */
  @Roles('admin')
  @Delete('assets/:id')
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const used = await c.query(`SELECT 1 FROM facility.service_records WHERE asset_id = $1 LIMIT 1`, [id])
      if (used.rowCount) {
        await c.query(`UPDATE facility.assets SET is_active = false WHERE id = $1`, [id])
        return { ok: true, deactivated: true }
      }
      const r = await c.query(`DELETE FROM facility.assets WHERE id = $1 RETURNING id`, [id])
      if (!r.rowCount) throw new NotFoundException('تجهیز یافت نشد')
      return { ok: true, deactivated: false }
    })
  }

  @Get('service-records')
  records(@CurrentUser() user: JwtPayload, @Query('assetId') assetId?: string) {
    return this.db.withTenant(user.tenant_id!, async (c) =>
      (await c.query(
        `SELECT s.*, a.name AS asset_name FROM facility.service_records s JOIN facility.assets a ON a.id = s.asset_id
          WHERE ($1::uuid IS NULL OR s.asset_id = $1::uuid) ORDER BY s.performed_on DESC, s.created_at DESC LIMIT 500`,
        [assetId ?? null],
      )).rows,
    )
  }

  /** ثبت تعمیر/تعویض/سرویس؛ اگر به تیکتی وصل باشد تیکت هم بسته (یا در حال رسیدگی) و در روند پیگیری ثبت می‌شود */
  @Post('service-records')
  addRecord(@CurrentUser() user: JwtPayload, @Body() dto: ServiceRecordDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (c) => {
      const asset = await c.query(`SELECT 1 FROM facility.assets WHERE id = $1 AND is_active`, [dto.assetId])
      if (!asset.rowCount) throw new BadRequestException('تجهیز یافت نشد')
      const rec = (await c.query(
        `INSERT INTO facility.service_records (tenant_id, asset_id, ticket_id, type, description, performer, cost, performed_on, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date, CURRENT_DATE),$9) RETURNING *`,
        [tenantId, dto.assetId, dto.ticketId ?? null, dto.type, dto.description.trim(), dto.performer.trim(), dto.cost ?? 0, dto.date ?? null, user.sub],
      )).rows[0]
      if (dto.ticketId) {
        const t = await c.query(`SELECT id FROM facility.tickets WHERE id = $1 FOR UPDATE`, [dto.ticketId])
        if (!t.rowCount) throw new ConflictException('تیکت یافت نشد')
        const status = dto.closeTicket === false ? 'in_progress' : 'resolved'
        await c.query(
          `UPDATE facility.tickets SET asset_id = COALESCE(asset_id, $2), status = $3, updated_at = now(),
                  resolved_at = CASE WHEN $3 = 'resolved' THEN now() ELSE NULL END WHERE id = $1`,
          [dto.ticketId, dto.assetId, status],
        )
        const label = { repair: 'تعمیر', replace: 'تعویض', service: 'سرویس دوره‌ای', inspection: 'بازدید' }[dto.type]
        await c.query(`INSERT INTO facility.ticket_events (tenant_id, ticket_id, text, actor) VALUES ($1,$2,$3,$4)`, [tenantId, dto.ticketId, `${label} ثبت شد: ${dto.description.trim()} (${dto.performer.trim()})`, user.sub])
      }
      return rec
    })
  }
}
