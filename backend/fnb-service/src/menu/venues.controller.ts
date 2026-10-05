import { Body, ConflictException, Controller, Delete, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { EventsService } from '../events/events.service'
import { FnbGateway } from '../realtime/fnb.gateway'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export class CreateVenueDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string
  @IsOptional() @IsBoolean() isOpen?: boolean
  @IsOptional() @Matches(TIME_RE, { message: 'ساعت باید به شکل HH:MM باشد' }) opensAt?: string
  @IsOptional() @Matches(TIME_RE, { message: 'ساعت باید به شکل HH:MM باشد' }) closesAt?: string
  @IsOptional() @IsInt() @Min(1) @Max(240) prepTimeMinutes?: number
}

export class UpdateVenueDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string
  @IsOptional() @IsBoolean() isOpen?: boolean
  @IsOptional() @Matches(TIME_RE, { message: 'ساعت باید به شکل HH:MM باشد' }) opensAt?: string
  @IsOptional() @Matches(TIME_RE, { message: 'ساعت باید به شکل HH:MM باشد' }) closesAt?: string
  @IsOptional() @IsInt() @Min(1) @Max(240) prepTimeMinutes?: number
}

export class CategoryDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number
}

export class ZoneDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string
  @IsIn(['in_unit', 'amenity_zone']) zoneType: 'in_unit' | 'amenity_zone'
  /** مشاع مرتبط (facility.amenities.id) برای منطقه‌ی تحویل در مشاعات */
  @IsOptional() @IsUUID() amenityId?: string
  @IsOptional() @IsNumber() @Min(0) @Max(1e8) surcharge?: number
}

export class UpdateZoneDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string
  @IsOptional() @IsNumber() @Min(0) @Max(1e8) surcharge?: number
  @IsOptional() @IsBoolean() isActive?: boolean
}

/**
 * ساخت و مدیریت رستوران/کافه، دسته‌های منو و مناطق تحویل. بدون این endpointها ساختمانِ تازه
 * هیچ venue ای نداشت و ماژول غذا قابل راه‌اندازی نبود (ساخت فقط با SQL ممکن بود).
 * ثبت و ویرایش با مدیر یا پرسنل بخش آشپزخانه/کافه.
 */
@Controller('fnb')
export class VenuesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly gateway: FnbGateway,
  ) {}

  /* ───────── رستوران / کافه ───────── */

  @Roles('admin', 'staff')
  @Post('venues')
  async createVenue(@CurrentUser() user: JwtPayload, @Body() dto: CreateVenueDto) {
    const row = await this.db.withTenant(user.tenant_id!, async (c) =>
      (await c.query(
        `INSERT INTO fnb.venues (tenant_id, name, is_open, opens_at, closes_at, prep_time_minutes)
         VALUES ($1, $2, $3, $4::time, $5::time, $6) RETURNING *`,
        [user.tenant_id, dto.name.trim(), dto.isOpen ?? true, dto.opensAt ?? null, dto.closesAt ?? null, dto.prepTimeMinutes ?? 20],
      )).rows[0],
    )
    this.events.publish('venue.created', { venueId: row.id, name: row.name }, user.tenant_id)
    return row
  }

  @Roles('admin', 'staff')
  @Patch('venues/:id')
  async updateVenue(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVenueDto) {
    const row = await this.db.withTenant(user.tenant_id!, async (c) =>
      (await c.query(
        `UPDATE fnb.venues SET name = COALESCE($2, name), is_open = COALESCE($3, is_open),
           opens_at = COALESCE($4::time, opens_at), closes_at = COALESCE($5::time, closes_at),
           prep_time_minutes = COALESCE($6, prep_time_minutes)
         WHERE id = $1 RETURNING *`,
        [id, dto.name?.trim() ?? null, dto.isOpen ?? null, dto.opensAt ?? null, dto.closesAt ?? null, dto.prepTimeMinutes ?? null],
      )).rows[0],
    )
    if (!row) throw new NotFoundException('رستوران/کافه یافت نشد')
    if (dto.isOpen !== undefined) this.gateway.broadcast(user.tenant_id!, 'venue.status.changed', { venueId: id, isOpen: row.is_open })
    return row
  }

  /** حذف فقط وقتی سفارشی ثبت نشده؛ وگرنه ببندید (سابقه‌ی سفارش‌ها حفظ می‌شود) */
  @Roles('admin')
  @Delete('venues/:id')
  deleteVenue(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const used = await c.query(`SELECT 1 FROM fnb.orders WHERE venue_id = $1 LIMIT 1`, [id])
      if (used.rowCount) throw new ConflictException('برای این مکان سفارش ثبت شده است؛ به‌جای حذف، آن را ببندید')
      await c.query(`DELETE FROM fnb.menu_items WHERE venue_id = $1`, [id])
      await c.query(`DELETE FROM fnb.menu_categories WHERE venue_id = $1`, [id])
      const r = await c.query(`DELETE FROM fnb.venues WHERE id = $1 RETURNING id`, [id])
      if (!r.rowCount) throw new NotFoundException('رستوران/کافه یافت نشد')
      return { ok: true }
    })
  }

  /* ───────── دسته‌های منو ───────── */

  @Roles('admin', 'staff')
  @Post('venues/:id/categories')
  createCategory(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) venueId: string, @Body() dto: CategoryDto) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const venue = await c.query(`SELECT 1 FROM fnb.venues WHERE id = $1`, [venueId])
      if (!venue.rowCount) throw new NotFoundException('رستوران/کافه یافت نشد')
      return (await c.query(
        `INSERT INTO fnb.menu_categories (tenant_id, venue_id, name, sort_order)
         VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(max(sort_order), 0) + 1 FROM fnb.menu_categories WHERE venue_id = $2))) RETURNING *`,
        [user.tenant_id, venueId, dto.name.trim(), dto.sortOrder ?? null],
      )).rows[0]
    })
  }

  @Roles('admin', 'staff')
  @Patch('categories/:id')
  updateCategory(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(`UPDATE fnb.menu_categories SET name = COALESCE($2, name), sort_order = COALESCE($3, sort_order) WHERE id = $1 RETURNING *`, [id, dto.name?.trim() ?? null, dto.sortOrder ?? null])
      if (!r.rows[0]) throw new NotFoundException('دسته یافت نشد')
      return r.rows[0]
    })
  }

  /** آیتم‌های دسته حذف نمی‌شوند؛ بدون دسته می‌مانند */
  @Roles('admin', 'staff')
  @Delete('categories/:id')
  deleteCategory(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      await c.query(`UPDATE fnb.menu_items SET category_id = NULL WHERE category_id = $1`, [id])
      const r = await c.query(`DELETE FROM fnb.menu_categories WHERE id = $1 RETURNING id`, [id])
      if (!r.rowCount) throw new NotFoundException('دسته یافت نشد')
      return { ok: true }
    })
  }

  /* ───────── مناطق تحویل ───────── */

  @Roles('admin', 'staff')
  @Post('delivery-zones')
  createZone(@CurrentUser() user: JwtPayload, @Body() dto: ZoneDto) {
    return this.db.withTenant(user.tenant_id!, async (c) =>
      (await c.query(
        `INSERT INTO fnb.delivery_zones (tenant_id, name, zone_type, amenity_id, surcharge) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [user.tenant_id, dto.name.trim(), dto.zoneType, dto.amenityId ?? null, dto.surcharge ?? 0],
      )).rows[0],
    )
  }

  @Roles('admin', 'staff')
  @Patch('delivery-zones/:id')
  updateZone(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateZoneDto) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(`UPDATE fnb.delivery_zones SET name = COALESCE($2, name), surcharge = COALESCE($3, surcharge), is_active = COALESCE($4, is_active) WHERE id = $1 RETURNING *`, [id, dto.name?.trim() ?? null, dto.surcharge ?? null, dto.isActive ?? null])
      if (!r.rows[0]) throw new NotFoundException('منطقه یافت نشد')
      return r.rows[0]
    })
  }

  /** حذف = غیرفعال‌سازی (سفارش‌های قبلی به منطقه ارجاع دارند) */
  @Roles('admin', 'staff')
  @Delete('delivery-zones/:id')
  deleteZone(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(`UPDATE fnb.delivery_zones SET is_active = false WHERE id = $1 RETURNING id`, [id])
      if (!r.rowCount) throw new NotFoundException('منطقه یافت نشد')
      return { ok: true }
    })
  }
}
