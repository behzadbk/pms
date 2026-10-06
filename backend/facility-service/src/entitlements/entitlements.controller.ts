import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common'
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { isDesk } from '../reservations/amenities.controller'
import { EntitlementsService } from './entitlements.service'

/** شناسه‌ی UUID با شکل استاندارد (نسخه/variant سخت‌گیرانه نیست تا داده‌ی seed توسعه هم پذیرفته شود) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_MSG = 'شناسه نامعتبر است'

export class IssueTicketDto {
  @IsString() @MaxLength(40) serviceCode: string
  @IsString() @MinLength(2, { message: 'نام مهمان را بنویسید' }) @MaxLength(80) guestName: string
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ ورود نامعتبر است' }) date?: string
}
export class RecordUsageDto {
  @Matches(UUID_RE, { message: UUID_MSG }) unitId: string
  @IsString() @MaxLength(40) serviceCode: string
  @IsOptional() @IsString() @MaxLength(40) variantCode?: string
  @IsNumber() @Min(0.01) @Max(1000) quantity: number
  @IsOptional() @IsString() @MaxLength(200) note?: string
}
export class VoidDto {
  @IsString() @MinLength(2, { message: 'دلیل ابطال را بنویسید' }) @MaxLength(200) reason: string
}
export class ScanDto {
  @IsString() @MinLength(10) @MaxLength(100) token: string
}
export class QuotaDto {
  @Matches(UUID_RE, { message: UUID_MSG }) tierId: string
  @Matches(UUID_RE, { message: UUID_MSG }) serviceId: string
  @IsNumber() @Min(0) @Max(100000) included: number
}
export class TariffPatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) title?: string
  @IsOptional() @IsNumber() @Min(0) @Max(10_000_000_000) unit_price?: number
  @IsOptional() @IsNumber() @Min(1) @Max(1000) step?: number
  @IsOptional() @IsBoolean() counts_toward_quota?: boolean
  @IsOptional() @IsBoolean() is_active?: boolean
}
export class ServicePatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) title?: string
  @IsOptional() @IsString() @MaxLength(300) note?: string
  @IsOptional() @IsBoolean() is_active?: boolean
}
export class TierDto {
  @IsNumber() @Min(1) @Max(100000) min_area: number
  @IsOptional() @IsString() @MaxLength(60) name?: string
}
export class TierPatchDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string
  @IsOptional() @IsNumber() @Min(1) @Max(100000) min_area?: number
}
export class TemplateDto {
  @IsIn(['baran3']) template: 'baran3'
  @IsOptional() @IsBoolean() overwrite?: boolean
}

const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

function needDesk(user: JwtPayload) {
  if (!isDesk(user)) throw new ForbiddenException('فقط مسئول مشاعات و مدیر')
}

/**
 * آفرها و سهمیه‌ی واحد
 *   ساکن    : GET me · GET me/events · GET|POST me/tickets · POST me/tickets/:id/void
 *   مسئول   : GET catalog · desk/units · desk/units/:id/summary · desk/events · POST desk/usage · POST desk/events/:id/void · POST desk/scan
 *   مدیر    : GET config · PUT config/quotas · PATCH config/tariffs|services/:id · POST|PATCH|DELETE config/tiers · POST config/apply-template · POST config/recompute
 * مازاد مصرف (بعد از سهمیه) در صدور شارژ ماه بعد توسط finance-service به شارژ واحد اضافه می‌شود.
 */
@Controller('entitlements')
export class EntitlementsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly svc: EntitlementsService,
  ) {}

  // ───────────── ساکن ─────────────

  @Roles('resident')
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await this.svc.myUnit(client, user)
      return this.svc.summary(client, m.unit_id)
    })
  }

  @Roles('resident')
  @Get('me/events')
  myEvents(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await this.svc.myUnit(client, user)
      return this.svc.listEvents(client, { unitId: m.unit_id, limit: Number(limit) || 50 })
    })
  }

  @Roles('resident')
  @Get('me/tickets')
  myTickets(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.myTickets(client, user))
  }

  @Roles('resident')
  @Post('me/tickets')
  issue(@Body() body: IssueTicketDto, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.issueTicket(client, user, body))
  }

  @Roles('resident')
  @HttpCode(200)
  @Post('me/tickets/:id/void')
  voidTicket(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.voidMyTicket(client, user, id))
  }

  // ───────────── مسئول مشاعات / مدیر ─────────────

  @Roles('admin', 'staff')
  @Get('catalog')
  catalog(@CurrentUser() user: JwtPayload) {
    needDesk(user)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.catalog(client, { activeOnly: true }))
  }

  @Roles('admin', 'staff')
  @Get('preview')
  preview(@Query('area') area: string, @CurrentUser() user: JwtPayload) {
    needDesk(user)
    const a = Number(faToEn(String(area ?? '')))
    if (!Number.isFinite(a) || a <= 0 || a > 100000) throw new BadRequestException('متراژ نامعتبر است')
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.previewByArea(client, a))
  }

  @Roles('admin', 'staff')
  @Get('desk/units')
  units(@Query('q') q: string | undefined, @CurrentUser() user: JwtPayload) {
    needDesk(user)
    const term = faToEn((q ?? '').trim()).replace(/[%_\\]/g, '').slice(0, 20)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `SELECT u.id, u.unit_number, u.floor, u.area_sqm::float8 AS area FROM property.units u
          WHERE ($1 = '' OR u.unit_number ILIKE $1 || '%') ORDER BY length(u.unit_number), u.unit_number LIMIT 20`, [term])
      return r.rows
    })
  }

  @Roles('admin', 'staff')
  @Get('desk/units/:id/summary')
  unitSummary(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    needDesk(user)
    if (!UUID_RE.test(id)) throw new BadRequestException(UUID_MSG)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.summary(client, id))
  }

  @Roles('admin', 'staff')
  @Get('desk/events')
  events(@Query('unitId') unitId: string | undefined, @Query('period') period: string | undefined, @Query('limit') limit: string | undefined, @CurrentUser() user: JwtPayload) {
    needDesk(user)
    if (unitId && !UUID_RE.test(unitId)) throw new BadRequestException('شناسه‌ی واحد نامعتبر است')
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new BadRequestException('دوره باید به شکل 1405-07 باشد')
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.listEvents(client, { unitId, period, limit: Number(limit) || 30 }))
  }

  @Roles('admin', 'staff')
  @Post('desk/usage')
  record(@Body() body: RecordUsageDto, @CurrentUser() user: JwtPayload) {
    needDesk(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const event = await this.svc.record(client, user, { ...body, source: 'desk' })
      const summary = await this.svc.summary(client, body.unitId)
      return { event, service: summary.services.find((s) => s.code === body.serviceCode) ?? null }
    })
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post('desk/events/:id/void')
  voidEvent(@Param('id', ParseUUIDPipe) id: string, @Body() body: VoidDto, @CurrentUser() user: JwtPayload) {
    needDesk(user)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.voidEvent(client, user, id, body.reason))
  }

  @Roles('admin', 'staff')
  @HttpCode(200)
  @Post('desk/scan')
  scan(@Body() body: ScanDto, @CurrentUser() user: JwtPayload) {
    needDesk(user)
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.scanTicket(client, user, body.token))
  }

  // ───────────── مدیر: تنظیم سهمیه و تعرفه ─────────────

  @Roles('admin')
  @Get('config')
  config(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (client) => this.svc.catalog(client))
  }

  @Roles('admin')
  @Put('config/quotas')
  setQuota(@Body() body: QuotaDto, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const svc = await client.query<{ kind: string }>(`SELECT kind FROM entitlement.services WHERE id = $1`, [body.serviceId])
      if (!svc.rows[0]) throw new NotFoundException('خدمت یافت نشد')
      if (svc.rows[0].kind !== 'quota') throw new BadRequestException('این خدمت سهمیه‌ی رایگان ندارد')
      const tier = await client.query(`SELECT 1 FROM entitlement.tiers WHERE id = $1`, [body.tierId])
      if (!tier.rows[0]) throw new NotFoundException('سطح متراژ یافت نشد')
      await client.query(
        `INSERT INTO entitlement.quotas (tenant_id, tier_id, service_id, included) VALUES ($1, $2, $3, $4)
         ON CONFLICT (tier_id, service_id) DO UPDATE SET included = EXCLUDED.included`,
        [user.tenant_id, body.tierId, body.serviceId, body.included])
      const units = await this.svc.recomputeService(client, body.serviceId)
      return { ok: true, recomputed_units: units }
    })
  }

  @Roles('admin')
  @Patch('config/tariffs/:id')
  patchTariff(@Param('id', ParseUUIDPipe) id: string, @Body() body: TariffPatchDto, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const sets: string[] = []
      const vals: unknown[] = []
      const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }
      if (body.title !== undefined) set('title', body.title.trim())
      if (body.unit_price !== undefined) set('unit_price', body.unit_price)
      if (body.step !== undefined) set('step', body.step)
      if (body.counts_toward_quota !== undefined) set('counts_toward_quota', body.counts_toward_quota)
      if (body.is_active !== undefined) set('is_active', body.is_active)
      if (!sets.length) throw new BadRequestException('فیلدی برای ویرایش ارسال نشده است')
      vals.push(id)
      const r = await client.query(
        `UPDATE entitlement.tariffs SET ${sets.join(', ')} WHERE id = $${vals.length}
         RETURNING id, service_id, code, title, unit_price::float8 AS unit_price, step::float8 AS step, counts_toward_quota, is_default, is_active, sort`, vals)
      if (!r.rows[0]) throw new NotFoundException('تعرفه یافت نشد')
      return r.rows[0] // رویدادهای قبلی نرخ لحظه‌ی ثبت خود را نگه می‌دارند؛ تغییر فقط روی مصرف‌های بعدی اثر دارد
    })
  }

  @Roles('admin')
  @Patch('config/services/:id')
  patchService(@Param('id', ParseUUIDPipe) id: string, @Body() body: ServicePatchDto, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const sets: string[] = []
      const vals: unknown[] = []
      const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }
      if (body.title !== undefined) set('title', body.title.trim())
      if (body.note !== undefined) set('note', body.note.trim() || null)
      if (body.is_active !== undefined) set('is_active', body.is_active)
      if (!sets.length) throw new BadRequestException('فیلدی برای ویرایش ارسال نشده است')
      vals.push(id)
      const r = await client.query(`UPDATE entitlement.services SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id, code, title, note, is_active`, vals)
      if (!r.rows[0]) throw new NotFoundException('خدمت یافت نشد')
      return r.rows[0]
    })
  }

  @Roles('admin')
  @Post('config/tiers')
  createTier(@Body() body: TierDto, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const name = body.name?.trim() || `واحد ${String(body.min_area).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])} متری`
      const r = await client.query(
        `INSERT INTO entitlement.tiers (tenant_id, name, min_area, sort) VALUES ($1, $2, $3, COALESCE((SELECT max(sort) FROM entitlement.tiers), 0) + 1)
         RETURNING id, name, min_area::float8 AS min_area, sort`, [user.tenant_id, name, body.min_area])
      await this.svc.recomputeAll(client)
      return r.rows[0]
    })
  }

  @Roles('admin')
  @Patch('config/tiers/:id')
  patchTier(@Param('id', ParseUUIDPipe) id: string, @Body() body: TierPatchDto, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const sets: string[] = []
      const vals: unknown[] = []
      const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }
      if (body.name !== undefined) set('name', body.name.trim())
      if (body.min_area !== undefined) set('min_area', body.min_area)
      if (!sets.length) throw new BadRequestException('فیلدی برای ویرایش ارسال نشده است')
      vals.push(id)
      const r = await client.query(`UPDATE entitlement.tiers SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id, name, min_area::float8 AS min_area, sort`, vals)
      if (!r.rows[0]) throw new NotFoundException('سطح متراژ یافت نشد')
      if (body.min_area !== undefined) await this.svc.recomputeAll(client)
      return r.rows[0]
    })
  }

  @Roles('admin')
  @Delete('config/tiers/:id')
  deleteTier(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(`DELETE FROM entitlement.tiers WHERE id = $1 RETURNING id`, [id])
      if (!r.rows[0]) throw new NotFoundException('سطح متراژ یافت نشد')
      await this.svc.recomputeAll(client)
      return { ok: true }
    })
  }

  /** اعمال الگوی آماده (فعلاً «برج باران ۳»). overwrite=false ⇒ ردیف‌های ویرایش‌شده‌ی مدیر حفظ می‌شود */
  @Roles('admin')
  @HttpCode(200)
  @Post('config/apply-template')
  applyTemplate(@Body() body: TemplateDto, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query<{ res: Record<string, number> }>(`SELECT entitlement.apply_baran3_template($1::uuid, $2) AS res`, [user.tenant_id, body.overwrite === true])
      await this.svc.recomputeAll(client)
      return r.rows[0].res
    })
  }

  /** محاسبه‌ی مجدد سهم‌بندی مصرف‌های هنوز-به-شارژ-نرفته (مثلاً بعد از تغییر متراژ واحدها) */
  @Roles('admin')
  @HttpCode(200)
  @Post('config/recompute')
  recompute(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => ({ ok: true, pairs: await this.svc.recomputeAll(client) }))
  }
}
