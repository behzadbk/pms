import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { EventsService } from '../events/events.service'
import { FnbGateway } from '../realtime/fnb.gateway'

type Availability = 'available' | 'sold_out' | 'hidden'

interface MenuItemBody {
  venueKind: 'restaurant' | 'cafe'
  category: string
  name: string
  description?: string
  imageUrl?: string
  price?: number
  availability: Availability
  icon?: string
  color?: string
  isDailySpecial?: boolean
}

const DEFAULT_VENUES = [
  { kind: 'restaurant', name: 'رستوران ساختمان', billing: 'wallet', prep: 25 },
  { kind: 'cafe', name: 'کافی‌شاپ ساختمان', billing: 'monthly_charge', prep: 10 },
]

@Controller('fnb')
export class MenuController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly gateway: FnbGateway,
  ) {}

  /**
   * کاتالوگ کامل ساختمان (رستوران + کافی‌شاپ + منو) در یک درخواست.
   * venueهای رستوران/کافی‌شاپ در اولین فراخوانی خودکار ساخته می‌شوند.
   * ساکن آیتم‌های «مخفی» را نمی‌بیند؛ مسئول منو (staff/admin) همه را می‌بیند.
   */
  @Get('catalog')
  catalog(@CurrentUser() user: JwtPayload) {
    const canSeeHidden = user.role === 'admin' || user.role === 'staff'
    return this.db.withTenant(user.tenant_id!, async (c) => {
      for (const v of DEFAULT_VENUES) {
        await c.query(
          `INSERT INTO fnb.venues (tenant_id, name, kind, billing, prep_time_minutes)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, kind) WHERE kind IS NOT NULL DO NOTHING`,
          [user.tenant_id, v.name, v.kind, v.billing, v.prep],
        )
      }
      const venues = await c.query(
        `SELECT id, name, kind, billing, is_open, prep_time_minutes FROM fnb.venues WHERE kind IS NOT NULL ORDER BY kind DESC`,
      )
      const items = await c.query(
        `SELECT m.id, m.venue_id, v.kind AS venue_kind, m.category, m.name, m.description, m.image_url,
                m.price::float8 AS price, m.availability, m.icon, m.color, m.is_daily_special
         FROM fnb.menu_items m JOIN fnb.venues v ON v.id = m.venue_id
         WHERE v.kind IS NOT NULL ${canSeeHidden ? '' : "AND m.availability <> 'hidden'"}
         ORDER BY m.is_daily_special DESC, m.name`,
      )
      return { venues: venues.rows, items: items.rows }
    })
  }

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
  create(@CurrentUser() user: JwtPayload, @Body() body: MenuItemBody) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const venueId = await this.venueIdByKind(c, body.venueKind)
      const b = this.validate(body)
      if (b.isDailySpecial && b.availability === 'available') {
        await c.query('UPDATE fnb.menu_items SET is_daily_special = false WHERE venue_id = $1', [venueId])
      }
      const r = await c.query(
        `INSERT INTO fnb.menu_items
           (tenant_id, venue_id, category, name, description, image_url, price, availability, icon, color, is_daily_special)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [user.tenant_id, venueId, b.category, b.name, b.description, b.imageUrl, b.price, b.availability, b.icon, b.color, b.isDailySpecial],
      )
      return { id: r.rows[0].id }
    })
  }

  @Roles('admin', 'staff')
  @Put('menu-items/:id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: MenuItemBody) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const b = this.validate(body)
      const cur = await c.query('SELECT venue_id FROM fnb.menu_items WHERE id = $1', [id])
      if (!cur.rows[0]) throw new NotFoundException('آیتم یافت نشد')
      if (b.isDailySpecial && b.availability === 'available') {
        await c.query('UPDATE fnb.menu_items SET is_daily_special = false WHERE venue_id = $1 AND id <> $2', [cur.rows[0].venue_id, id])
      }
      await c.query(
        `UPDATE fnb.menu_items
         SET category=$2, name=$3, description=$4, image_url=$5, price=$6, availability=$7, icon=$8, color=$9,
             is_daily_special=$10, updated_at = now()
         WHERE id = $1`,
        [id, b.category, b.name, b.description, b.imageUrl, b.price, b.availability, b.icon, b.color, b.isDailySpecial],
      )
      return { id }
    })
  }

  @Roles('admin', 'staff')
  @Delete('menu-items/:id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      // آیتمی که سابقه‌ی سفارش دارد حذف نمی‌شود (snapshot سفارش‌ها سالم بماند) — مخفی می‌شود
      const used = await c.query('SELECT 1 FROM fnb.order_items WHERE item_id = $1 LIMIT 1', [id])
      if (used.rows[0]) {
        await c.query(`UPDATE fnb.menu_items SET availability='hidden', is_daily_special=false, updated_at=now() WHERE id=$1`, [id])
        return { deleted: false, hidden: true }
      }
      await c.query('DELETE FROM fnb.menu_items WHERE id = $1', [id])
      return { deleted: true }
    })
  }

  private async venueIdByKind(c: PoolClient, kind: string): Promise<string> {
    const r = await c.query('SELECT id FROM fnb.venues WHERE kind = $1', [kind])
    if (!r.rows[0]) throw new BadRequestException('رستوران/کافی‌شاپ نامعتبر است')
    return r.rows[0].id
  }

  private validate(body: MenuItemBody) {
    const name = String(body.name ?? '').trim()
    const category = String(body.category ?? '').trim()
    if (!name) throw new BadRequestException('نام آیتم الزامی است')
    if (!category) throw new BadRequestException('دسته الزامی است')
    const price = Number(body.price ?? 0)
    if (!Number.isFinite(price) || price < 0) throw new BadRequestException('قیمت نامعتبر است')
    if (!['available', 'sold_out', 'hidden'].includes(body.availability)) throw new BadRequestException('وضعیت نامعتبر است')
    return {
      name: name.slice(0, 120),
      category: category.slice(0, 60),
      description: body.description ? String(body.description).slice(0, 300) : null,
      imageUrl: body.imageUrl ? String(body.imageUrl) : null,
      price: Math.round(price),
      availability: body.availability,
      icon: String(body.icon || 'burger').slice(0, 30),
      color: String(body.color || '#c9a227').slice(0, 9),
      isDailySpecial: !!body.isDailySpecial,
    }
  }
}
