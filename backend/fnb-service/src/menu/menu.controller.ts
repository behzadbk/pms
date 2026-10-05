import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { EventsService } from '../events/events.service'
import { FnbGateway } from '../realtime/fnb.gateway'

type Availability = 'available' | 'sold_out' | 'hidden'

export class MenuItemDto {
  @IsUUID() venueId: string
  @IsOptional() @IsUUID() categoryId?: string
  @IsString() @MinLength(1) @MaxLength(100) name: string
  @IsOptional() @IsString() @MaxLength(400) description?: string
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string
  @IsNumber() @Min(0) @Max(1e9) price: number
  @IsOptional() @IsInt() @Min(0) @Max(100000) stockCount?: number
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) dietaryTags?: string[]
}

export class UpdateMenuItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string
  @IsOptional() @IsString() @MaxLength(400) description?: string | null
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string | null
  @IsOptional() @IsNumber() @Min(0) @Max(1e9) price?: number
  @IsOptional() @IsUUID() categoryId?: string | null
  @IsOptional() @IsInt() @Min(0) @Max(100000) stockCount?: number | null
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) dietaryTags?: string[]
}

@Controller('fnb')
export class MenuController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly gateway: FnbGateway,
  ) {}

  @Get('venues')
  venues(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query('SELECT * FROM fnb.venues ORDER BY name')
      return r.rows
    })
  }

  /** منوی کامل یک رستوران با وضعیت لحظه‌ای هر آیتم */
  @Get('venues/:id/menu')
  menu(@CurrentUser() user: JwtPayload, @Param('id') venueId: string, @Query('since') since?: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const categories = await c.query(
        'SELECT * FROM fnb.menu_categories WHERE venue_id = $1 ORDER BY sort_order',
        [venueId],
      )
      // پارامتر since برای کلاینت‌های بدون WebSocket (polling سبک) — فقط تغییرات را برمی‌گرداند
      const items = since
        ? await c.query(
            `SELECT * FROM fnb.menu_items WHERE venue_id = $1 AND updated_at > $2 ORDER BY name`,
            [venueId, since],
          )
        : await c.query(
            `SELECT * FROM fnb.menu_items WHERE venue_id = $1 AND availability <> 'hidden' ORDER BY name`,
            [venueId],
          )
      return { categories: categories.rows, items: items.rows, server_time: new Date().toISOString() }
    })
  }

  @Get('delivery-zones')
  zones(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query('SELECT * FROM fnb.delivery_zones WHERE is_active ORDER BY zone_type, name')
      return r.rows
    })
  }

  /**
   * تغییر موجودی با به‌روزرسانی آنی — بخش ۱.۵ سند UPDATE-V2.
   * پس از UPDATE، تغییر هم روی WebSocket به همه کلاینت‌های باز pushed می‌شود
   * و هم به‌عنوان رویداد منتشر می‌شود (برای audit-svc و مصرف‌کننده‌های آینده).
   */
  @Roles('admin', 'staff')
  @Patch('menu-items/:id/availability')
  async setAvailability(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { availability: Availability; stock_count?: number },
  ) {
    const tenantId = user.tenant_id!
    const item = await this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `UPDATE fnb.menu_items
         SET availability = $1, stock_count = COALESCE($2, stock_count), updated_at = now()
         WHERE id = $3 RETURNING *`,
        [body.availability, body.stock_count ?? null, id],
      )
      return r.rows[0]
    })

    this.gateway.broadcast(tenantId, 'menu.item.updated', {
      id: item.id,
      availability: item.availability,
      stock_count: item.stock_count,
    })
    this.events.publish('menu.item.updated', { itemId: item.id, availability: item.availability }, tenantId)
    return item
  }

  /** «همه‌چیز تمام شد» — بستن دسته‌ای آیتم‌ها با یک درخواست */
  @Roles('admin', 'staff')
  @Patch('menu-items/bulk-availability')
  async bulkAvailability(
    @CurrentUser() user: JwtPayload,
    @Body() body: { ids: string[]; availability: Availability },
  ) {
    const tenantId = user.tenant_id!
    const rows = await this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `UPDATE fnb.menu_items SET availability = $1, updated_at = now()
         WHERE id = ANY($2::uuid[]) RETURNING id, availability, stock_count`,
        [body.availability, body.ids],
      )
      return r.rows
    })
    for (const row of rows) this.gateway.broadcast(tenantId, 'menu.item.updated', row)
    return { updated: rows.length }
  }

  @Roles('admin', 'staff')
  @Post('menu-items')
  create(@CurrentUser() user: JwtPayload, @Body() body: MenuItemDto) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `INSERT INTO fnb.menu_items
           (tenant_id, venue_id, category_id, name, description, image_url, price, availability, stock_count, dietary_tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'available',$8,$9) RETURNING *`,
        [
          user.tenant_id, body.venueId, body.categoryId ?? null, body.name.trim(), body.description ?? null,
          body.imageUrl ?? null, body.price, body.stockCount ?? null, body.dietaryTags ?? [],
        ],
      )
      return r.rows[0]
    })
  }

  /** ویرایش مشخصات آیتم منو (نام، قیمت، دسته، موجودی…) */
  @Roles('admin', 'staff')
  @Patch('menu-items/:id')
  async update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateMenuItemDto) {
    const tenantId = user.tenant_id!
    const item = await this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `UPDATE fnb.menu_items SET
           name = COALESCE($2, name), description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           image_url = CASE WHEN $5::boolean THEN $6 ELSE image_url END, price = COALESCE($7, price),
           category_id = CASE WHEN $8::boolean THEN $9::uuid ELSE category_id END,
           stock_count = CASE WHEN $10::boolean THEN $11::int ELSE stock_count END,
           dietary_tags = COALESCE($12, dietary_tags), updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, body.name?.trim() ?? null, body.description !== undefined, body.description ?? null, body.imageUrl !== undefined, body.imageUrl ?? null, body.price ?? null,
          body.categoryId !== undefined, body.categoryId ?? null, body.stockCount !== undefined, body.stockCount ?? null, body.dietaryTags ?? null],
      )
      return r.rows[0]
    })
    if (!item) throw new NotFoundException('آیتم یافت نشد')
    this.gateway.broadcast(tenantId, 'menu.item.updated', { id: item.id, availability: item.availability, stock_count: item.stock_count })
    return item
  }

  /** آیتمی که در سفارشی بوده مخفی می‌شود (سابقه‌ی سفارش‌ها می‌ماند)، وگرنه حذف می‌شود */
  @Roles('admin', 'staff')
  @Delete('menu-items/:id')
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const used = await c.query(`SELECT 1 FROM fnb.order_items WHERE item_id = $1 LIMIT 1`, [id])
      if (used.rowCount) {
        const r = await c.query(`UPDATE fnb.menu_items SET availability = 'hidden', updated_at = now() WHERE id = $1 RETURNING id`, [id])
        if (!r.rowCount) throw new NotFoundException('آیتم یافت نشد')
        return { ok: true, hidden: true }
      }
      const r = await c.query(`DELETE FROM fnb.menu_items WHERE id = $1 RETURNING id`, [id])
      if (!r.rowCount) throw new NotFoundException('آیتم یافت نشد')
      return { ok: true, hidden: false }
    })
  }
}
