import { Body, ConflictException, ForbiddenException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { RequireModule } from '../auth/decorators/require-module.decorator'
import { EventsService } from '../events/events.service'
import { FnbGateway } from '../realtime/fnb.gateway'
import { assertCanManage, bad, hhmm, int, KINDS, manageKinds, notify, str, VENUE_COLS, VenueKind } from '../common/access'

type Availability = 'available' | 'sold_out' | 'hidden'
const AVAIL: Availability[] = ['available', 'sold_out', 'hidden']
type Body_ = Record<string, unknown>

const has = (b: Body_, k: string) => b[k] !== undefined

/** ساخت UPDATE پویا: فقط فیلدهای ارسال‌شده */
function patchSql(table: string, sets: Record<string, unknown>, id: string) {
  const cols = Object.keys(sets)
  if (!cols.length) throw bad('هیچ فیلدی برای ویرایش ارسال نشده است')
  const vals = cols.map((c) => sets[c])
  return { sql: `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`, vals: [...vals, id] }
}

@RequireModule('fnb_ordering')
@Controller()
export class MenuController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly gateway: FnbGateway,
  ) {}

  // ───────────────────────── مجموعه‌ها (رستوران / کافی‌شاپ) ─────────────────────────

  /** مجموعه‌های فعال — برای ساکن. مدیر/کارمند هم می‌تواند بخواند. */
  @Get('venues')
  venues(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(`SELECT ${VENUE_COLS} FROM fnb.venues v WHERE v.is_active ORDER BY v.kind DESC, v.name`)
      return r.rows
    })
  }

  /** مجموعه‌هایی که کاربر می‌تواند مدیریت کند (شامل غیرفعال‌ها) */
  @Roles('admin', 'staff')
  @Get('venues/manage')
  manageList(@CurrentUser() user: JwtPayload, @Query('kind') kind?: string) {
    const kinds = manageKinds(user).filter((k) => !kind || k === kind)
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `SELECT ${VENUE_COLS},
                (SELECT count(*)::int FROM fnb.menu_items i WHERE i.venue_id = v.id) AS items_count,
                (SELECT count(*)::int FROM fnb.orders o WHERE o.venue_id = v.id AND o.status IN ('placed','accepted','preparing','ready','out_for_delivery')) AS active_orders
           FROM fnb.venues v WHERE v.kind = ANY($1::text[]) ORDER BY v.is_active DESC, v.name`,
        [kinds],
      )
      return r.rows
    })
  }

  @Roles('admin', 'staff')
  @Post('venues')
  async createVenue(@CurrentUser() user: JwtPayload, @Body() b: Body_) {
    const kind = str(b.kind, 'نوع مجموعه', { max: 20 }) as VenueKind
    if (!KINDS.includes(kind)) throw bad('نوع مجموعه باید restaurant یا cafe باشد')
    assertCanManage(user, kind)
    const name = str(b.name, 'نام مجموعه', { max: 80 })
    const opens = hhmm(b.opens_at, 'ساعت شروع')
    const closes = hhmm(b.closes_at, 'ساعت پایان')
    if ((opens === null) !== (closes === null)) throw bad('ساعت شروع و پایان را با هم وارد کنید')
    const prep = int(b.prep_time_minutes ?? 20, 'زمان آماده‌سازی', { min: 1, max: 240 })
    const minOrder = int(b.min_order ?? 0, 'حداقل سفارش')
    const row = await this.db.withTenant(user.tenant_id!, async (c) => {
      const dup = await c.query(`SELECT 1 FROM fnb.venues WHERE kind = $1 AND lower(name) = lower($2) AND is_active`, [kind, name])
      if (dup.rowCount) throw new ConflictException('مجموعه‌ای با همین نام وجود دارد')
      const r = await c.query(
        `INSERT INTO fnb.venues (tenant_id, name, kind, description, opens_at, closes_at, prep_time_minutes, accepts_delivery, min_order, is_open, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true) RETURNING id`,
        [user.tenant_id, name, kind, str(b.description, 'توضیح', { max: 400, optional: true }), opens, closes, prep, b.accepts_delivery === false ? false : true, minOrder],
      )
      return this.venueRow(c, r.rows[0].id)
    })
    this.gateway.broadcast(user.tenant_id!, 'venue.updated', { id: row.id })
    return row
  }

  @Roles('admin', 'staff')
  @Patch('venues/:id')
  async updateVenue(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() b: Body_) {
    const row = await this.db.withTenant(user.tenant_id!, async (c) => {
      const cur = await this.venueRow(c, id)
      assertCanManage(user, cur.kind)
      const sets: Record<string, unknown> = {}
      if (has(b, 'name')) sets.name = str(b.name, 'نام مجموعه', { max: 80 })
      if (has(b, 'kind')) {
        const k = str(b.kind, 'نوع مجموعه', { max: 20 }) as VenueKind
        if (!KINDS.includes(k)) throw bad('نوع مجموعه نامعتبر است')
        assertCanManage(user, k)
        sets.kind = k
      }
      if (has(b, 'description')) sets.description = str(b.description, 'توضیح', { max: 400, optional: true })
      if (has(b, 'opens_at') || has(b, 'closes_at')) {
        const o = has(b, 'opens_at') ? hhmm(b.opens_at, 'ساعت شروع') : cur.opens_at
        const cl = has(b, 'closes_at') ? hhmm(b.closes_at, 'ساعت پایان') : cur.closes_at
        if ((o === null) !== (cl === null)) throw bad('ساعت شروع و پایان را با هم وارد کنید')
        sets.opens_at = o
        sets.closes_at = cl
      }
      if (has(b, 'prep_time_minutes')) sets.prep_time_minutes = int(b.prep_time_minutes, 'زمان آماده‌سازی', { min: 1, max: 240 })
      if (has(b, 'min_order')) sets.min_order = int(b.min_order, 'حداقل سفارش')
      for (const k of ['accepts_delivery', 'is_open', 'is_active'] as const) {
        if (has(b, k)) {
          if (typeof b[k] !== 'boolean') throw bad(`مقدار ${k} باید true یا false باشد`)
          sets[k] = b[k]
        }
      }
      const q = patchSql('fnb.venues', sets, id)
      await c.query(q.sql, q.vals)
      return this.venueRow(c, id)
    })
    this.gateway.broadcast(user.tenant_id!, 'venue.status.changed', { venueId: id, isOpen: row.open_now })
    return row
  }

  /** حذف مجموعه — اگر سفارشی دارد فقط غیرفعال می‌شود (سوابق مالی/سفارش حفظ شود) */
  @Roles('admin', 'staff')
  @Delete('venues/:id')
  async deleteVenue(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const cur = await this.venueRow(c, id)
      assertCanManage(user, cur.kind)
      const used = await c.query('SELECT 1 FROM fnb.orders WHERE venue_id = $1 LIMIT 1', [id])
      if (used.rowCount) {
        await c.query('UPDATE fnb.venues SET is_active = false WHERE id = $1', [id])
        return { id, deleted: false, deactivated: true }
      }
      await c.query('DELETE FROM fnb.menu_items WHERE venue_id = $1', [id])
      await c.query('DELETE FROM fnb.menu_categories WHERE venue_id = $1', [id])
      await c.query('DELETE FROM fnb.venues WHERE id = $1', [id])
      return { id, deleted: true, deactivated: false }
    })
  }

  private async venueRow(c: PoolClient, id: string) {
    const r = await c.query(`SELECT ${VENUE_COLS} FROM fnb.venues v WHERE v.id = $1`, [id])
    if (!r.rows[0]) throw new NotFoundException('مجموعه یافت نشد')
    return r.rows[0]
  }

  // ───────────────────────── دسته‌بندی منو ─────────────────────────

  @Roles('admin', 'staff')
  @Post('venues/:id/categories')
  createCategory(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) venueId: string, @Body() b: Body_) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      assertCanManage(user, (await this.venueRow(c, venueId)).kind)
      const name = str(b.name, 'نام دسته', { max: 60 })
      const dup = await c.query('SELECT 1 FROM fnb.menu_categories WHERE venue_id = $1 AND name = $2', [venueId, name])
      if (dup.rowCount) throw new ConflictException('این دسته قبلاً تعریف شده است')
      const max = await c.query('SELECT COALESCE(max(sort_order), 0) + 1 AS n FROM fnb.menu_categories WHERE venue_id = $1', [venueId])
      const r = await c.query(
        `INSERT INTO fnb.menu_categories (tenant_id, venue_id, name, sort_order) VALUES ($1,$2,$3,$4) RETURNING *`,
        [user.tenant_id, venueId, name, int(b.sort_order, 'ترتیب', { optional: true }) ?? max.rows[0].n],
      )
      return r.rows[0]
    })
  }

  @Roles('admin', 'staff')
  @Patch('categories/:id')
  updateCategory(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() b: Body_) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const cat = await this.categoryRow(c, id)
      assertCanManage(user, cat.kind)
      const sets: Record<string, unknown> = {}
      if (has(b, 'name')) {
        sets.name = str(b.name, 'نام دسته', { max: 60 })
        const dup = await c.query('SELECT 1 FROM fnb.menu_categories WHERE venue_id = $1 AND name = $2 AND id <> $3', [cat.venue_id, sets.name, id])
        if (dup.rowCount) throw new ConflictException('این دسته قبلاً تعریف شده است')
      }
      if (has(b, 'sort_order')) sets.sort_order = int(b.sort_order, 'ترتیب')
      const q = patchSql('fnb.menu_categories', sets, id)
      return (await c.query(q.sql, q.vals)).rows[0]
    })
  }

  /** حذف دسته — آیتم‌های آن بدون دسته می‌مانند */
  @Roles('admin', 'staff')
  @Delete('categories/:id')
  deleteCategory(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const cat = await this.categoryRow(c, id)
      assertCanManage(user, cat.kind)
      await c.query('UPDATE fnb.menu_items SET category_id = NULL, updated_at = now() WHERE category_id = $1', [id])
      await c.query('DELETE FROM fnb.menu_categories WHERE id = $1', [id])
      return { id, deleted: true }
    })
  }

  private async categoryRow(c: PoolClient, id: string) {
    const r = await c.query(
      `SELECT mc.*, v.kind FROM fnb.menu_categories mc JOIN fnb.venues v ON v.id = mc.venue_id WHERE mc.id = $1`, [id])
    if (!r.rows[0]) throw new NotFoundException('دسته یافت نشد')
    return r.rows[0]
  }

  // ───────────────────────── منو ─────────────────────────

  /** منوی کامل یک مجموعه. مدیر با ?all=1 آیتم‌های مخفی را هم می‌بیند. */
  @Get('venues/:id/menu')
  menu(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) venueId: string, @Query('all') all?: string, @Query('since') since?: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const venue = await this.venueRow(c, venueId)
      const manager = all === '1' && manageKinds(user).includes(venue.kind)
      const categories = await c.query('SELECT * FROM fnb.menu_categories WHERE venue_id = $1 ORDER BY sort_order, name', [venueId])
      // پارامتر since برای کلاینت‌های بدون WebSocket (polling سبک) — فقط تغییرات را برمی‌گرداند
      const items = await c.query(
        `SELECT i.id, i.venue_id, i.category_id, c.name AS category_name, i.name, i.description, i.image_url, i.price,
                i.availability, i.stock_count, i.reserved_count, i.prep_time_minutes, i.is_daily_special, i.updated_at
           FROM fnb.menu_items i LEFT JOIN fnb.menu_categories c ON c.id = i.category_id
          WHERE i.venue_id = $1 ${manager ? '' : "AND i.availability <> 'hidden'"} ${since ? 'AND i.updated_at > $2' : ''}
          ORDER BY i.is_daily_special DESC, c.sort_order NULLS LAST, i.name`,
        since ? [venueId, since] : [venueId],
      )
      return { venue, categories: categories.rows, items: items.rows, server_time: new Date().toISOString() }
    })
  }

  private itemFields(b: Body_, partial: boolean) {
    const out: Record<string, unknown> = {}
    if (!partial || has(b, 'name')) out.name = str(b.name, 'نام آیتم', { max: 100 })
    if (!partial || has(b, 'price')) out.price = int(b.price, 'قیمت', { min: 0, max: 100_000_000 })
    if (has(b, 'description')) out.description = str(b.description, 'توضیح', { max: 400, optional: true })
    if (has(b, 'image_url')) {
      const u = b.image_url
      if (u !== null && u !== '' && (typeof u !== 'string' || u.length > 600_000 || !/^(https?:\/\/|data:image\/|\/)/.test(u))) throw bad('نشانی عکس نامعتبر است')
      out.image_url = u || null
    }
    if (has(b, 'availability')) {
      if (!AVAIL.includes(b.availability as Availability)) throw bad('وضعیت آیتم نامعتبر است')
      out.availability = b.availability
    }
    if (has(b, 'stock_count')) out.stock_count = int(b.stock_count, 'موجودی', { optional: true, max: 100000 })
    if (has(b, 'prep_time_minutes')) out.prep_time_minutes = int(b.prep_time_minutes, 'زمان آماده‌سازی', { optional: true, min: 1, max: 240 })
    if (has(b, 'is_daily_special')) {
      if (typeof b.is_daily_special !== 'boolean') throw bad('مقدار غذای روز نامعتبر است')
      out.is_daily_special = b.is_daily_special
    }
    return out
  }

  @Roles('admin', 'staff')
  @Post('menu-items')
  async createItem(@CurrentUser() user: JwtPayload, @Body() b: Body_) {
    const tenantId = user.tenant_id!
    const venueId = str(b.venue_id, 'مجموعه', { max: 40 })!
    const f = this.itemFields(b, false)
    const out = await this.db.withTenant(tenantId, async (c) => {
      const venue = await this.venueRow(c, venueId)
      assertCanManage(user, venue.kind)
      const categoryId = await this.checkCategory(c, venueId, b.category_id)
      const r = await c.query(
        `INSERT INTO fnb.menu_items (tenant_id, venue_id, category_id, name, description, image_url, price, availability, stock_count, prep_time_minutes, is_daily_special)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false) RETURNING id`,
        [tenantId, venueId, categoryId, f.name, f.description ?? null, f.image_url ?? null, f.price, f.availability ?? 'available', f.stock_count ?? null, f.prep_time_minutes ?? null],
      )
      if (f.is_daily_special) await this.setDailySpecial(c, tenantId, venue, r.rows[0].id)
      return this.itemRow(c, r.rows[0].id)
    })
    this.gateway.broadcast(tenantId, 'menu.item.updated', { id: out.id, availability: out.availability })
    return out
  }

  @Roles('admin', 'staff')
  @Patch('menu-items/bulk-availability')
  async bulkAvailability(@CurrentUser() user: JwtPayload, @Body() body: { ids: string[]; availability: Availability }) {
    const tenantId = user.tenant_id!
    if (!AVAIL.includes(body?.availability) || !Array.isArray(body.ids) || !body.ids.length) throw bad('درخواست نامعتبر است')
    const rows = await this.db.withTenant(tenantId, async (c) => {
      const kinds = manageKinds(user)
      const r = await c.query(
        `UPDATE fnb.menu_items m SET availability = $1, updated_at = now()
          FROM fnb.venues v
         WHERE m.id = ANY($2::uuid[]) AND v.id = m.venue_id AND v.kind = ANY($3::text[])
         RETURNING m.id, m.availability, m.stock_count`,
        [body.availability, body.ids, kinds],
      )
      return r.rows
    })
    for (const row of rows) this.gateway.broadcast(tenantId, 'menu.item.updated', row)
    return { updated: rows.length }
  }

  @Roles('admin', 'staff')
  @Patch('menu-items/:id/availability')
  async setAvailability(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { availability: Availability; stock_count?: number | null },
  ) {
    const tenantId = user.tenant_id!
    if (!AVAIL.includes(body?.availability)) throw bad('وضعیت آیتم نامعتبر است')
    const item = await this.db.withTenant(tenantId, async (c) => {
      assertCanManage(user, (await this.itemRow(c, id)).kind)
      await c.query(
        `UPDATE fnb.menu_items SET availability = $1, stock_count = CASE WHEN $3::boolean THEN $2::int ELSE stock_count END, updated_at = now() WHERE id = $4`,
        [body.availability, body.stock_count ?? null, body.stock_count !== undefined, id],
      )
      return this.itemRow(c, id)
    })
    this.gateway.broadcast(tenantId, 'menu.item.updated', { id: item.id, availability: item.availability, stock_count: item.stock_count })
    this.events.publish('menu.item.updated', { itemId: item.id, availability: item.availability }, tenantId)
    return item
  }

  @Roles('admin', 'staff')
  @Patch('menu-items/:id')
  async updateItem(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() b: Body_) {
    const tenantId = user.tenant_id!
    const f = this.itemFields(b, true)
    const out = await this.db.withTenant(tenantId, async (c) => {
      const cur = await this.itemRow(c, id)
      assertCanManage(user, cur.kind)
      const sets: Record<string, unknown> = { ...f }
      delete sets.is_daily_special
      if (has(b, 'category_id')) sets.category_id = await this.checkCategory(c, cur.venue_id, b.category_id)
      if (Object.keys(sets).length) {
        sets.updated_at = new Date()
        const q = patchSql('fnb.menu_items', sets, id)
        await c.query(q.sql, q.vals)
      }
      if (f.is_daily_special === true) await this.setDailySpecial(c, tenantId, cur, id)
      else if (f.is_daily_special === false) await c.query('UPDATE fnb.menu_items SET is_daily_special = false, updated_at = now() WHERE id = $1', [id])
      return this.itemRow(c, id)
    })
    this.gateway.broadcast(tenantId, 'menu.item.updated', { id: out.id, availability: out.availability })
    return out
  }

  /** حذف آیتم — اگر در سفارش‌های گذشته آمده، فقط مخفی می‌شود تا فاکتورها سالم بمانند */
  @Roles('admin', 'staff')
  @Delete('menu-items/:id')
  @HttpCode(200)
  async deleteItem(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    const out = await this.db.withTenant(user.tenant_id!, async (c) => {
      assertCanManage(user, (await this.itemRow(c, id)).kind)
      const used = await c.query('SELECT 1 FROM fnb.order_items WHERE item_id = $1 LIMIT 1', [id])
      if (used.rowCount) {
        await c.query(`UPDATE fnb.menu_items SET availability = 'hidden', is_daily_special = false, updated_at = now() WHERE id = $1`, [id])
        return { id, deleted: false, hidden: true }
      }
      await c.query('DELETE FROM fnb.menu_items WHERE id = $1', [id])
      return { id, deleted: true, hidden: false }
    })
    this.gateway.broadcast(user.tenant_id!, 'menu.item.updated', { id, availability: 'hidden' })
    return out
  }

  private async itemRow(c: PoolClient, id: string) {
    const r = await c.query(
      `SELECT i.id, i.venue_id, i.category_id, i.name, i.description, i.image_url, i.price, i.availability, i.stock_count,
              i.reserved_count, i.prep_time_minutes, i.is_daily_special, i.updated_at, v.kind
         FROM fnb.menu_items i JOIN fnb.venues v ON v.id = i.venue_id WHERE i.id = $1`, [id])
    if (!r.rows[0]) throw new NotFoundException('آیتم یافت نشد')
    return r.rows[0]
  }

  private async checkCategory(c: PoolClient, venueId: string, raw: unknown): Promise<string | null> {
    if (raw === undefined || raw === null || raw === '') return null
    const r = await c.query('SELECT 1 FROM fnb.menu_categories WHERE id = $1 AND venue_id = $2', [raw, venueId])
    if (!r.rowCount) throw bad('دسته‌ی انتخاب‌شده متعلق به این مجموعه نیست')
    return String(raw)
  }

  /** فقط یک غذای روز در هر مجموعه؛ با تعیین آن، برای ساکنین اعلان ثبت می‌شود */
  private async setDailySpecial(c: PoolClient, tenantId: string, venue: { id?: string; venue_id?: string; name?: string }, itemId: string) {
    const venueId = venue.venue_id ?? venue.id!
    await c.query('UPDATE fnb.menu_items SET is_daily_special = false, updated_at = now() WHERE venue_id = $1 AND id <> $2 AND is_daily_special', [venueId, itemId])
    const was = await c.query('SELECT is_daily_special, name FROM fnb.menu_items WHERE id = $1', [itemId])
    await c.query('UPDATE fnb.menu_items SET is_daily_special = true, updated_at = now() WHERE id = $1', [itemId])
    if (!was.rows[0].is_daily_special) {
      const v = await c.query('SELECT name FROM fnb.venues WHERE id = $1', [venueId])
      await notify(c, tenantId, [{ role: 'resident' }], {
        kind: 'fnb_daily_special', title: `غذای روز: ${was.rows[0].name}`, body: v.rows[0]?.name ?? null, link: '/resident/food-order', ref: itemId,
      })
    }
  }

  // ───────────────────────── مناطق تحویل ─────────────────────────

  /** مناطق تحویل فعال (ساکن). مدیر با ?all=1 غیرفعال‌ها را هم می‌بیند. */
  @Get('delivery-zones')
  zones(@CurrentUser() user: JwtPayload, @Query('all') all?: string) {
    const manager = all === '1' && manageKinds(user).length > 0
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `SELECT id, name, zone_type, amenity_id, is_active, surcharge, sort_order FROM fnb.delivery_zones
          ${manager ? '' : 'WHERE is_active'} ORDER BY zone_type, sort_order, name`)
      return r.rows
    })
  }

  @Roles('admin', 'staff')
  @Post('delivery-zones')
  createZone(@CurrentUser() user: JwtPayload, @Body() b: Body_) {
    this.assertAnyManager(user)
    const name = str(b.name, 'نام منطقه', { max: 60 })
    const surcharge = int(b.surcharge ?? 0, 'هزینه‌ی تحویل', { max: 10_000_000 })
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const dup = await c.query(`SELECT 1 FROM fnb.delivery_zones WHERE lower(name) = lower($1) AND is_active`, [name])
      if (dup.rowCount) throw new ConflictException('منطقه‌ای با همین نام وجود دارد')
      const r = await c.query(
        `INSERT INTO fnb.delivery_zones (tenant_id, name, zone_type, amenity_id, surcharge, is_active)
         VALUES ($1,$2,'amenity_zone',$3,$4,true) RETURNING *`,
        [user.tenant_id, name, b.amenity_id ? String(b.amenity_id) : null, surcharge],
      )
      return r.rows[0]
    })
  }

  @Roles('admin', 'staff')
  @Patch('delivery-zones/:id')
  updateZone(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() b: Body_) {
    this.assertAnyManager(user)
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const cur = await c.query('SELECT zone_type FROM fnb.delivery_zones WHERE id = $1', [id])
      if (!cur.rows[0]) throw new NotFoundException('منطقه یافت نشد')
      const sets: Record<string, unknown> = {}
      if (has(b, 'name')) sets.name = str(b.name, 'نام منطقه', { max: 60 })
      if (has(b, 'surcharge')) sets.surcharge = int(b.surcharge, 'هزینه‌ی تحویل', { max: 10_000_000 })
      if (has(b, 'sort_order')) sets.sort_order = int(b.sort_order, 'ترتیب')
      if (has(b, 'is_active')) {
        if (typeof b.is_active !== 'boolean') throw bad('مقدار is_active نامعتبر است')
        sets.is_active = b.is_active
      }
      const q = patchSql('fnb.delivery_zones', sets, id)
      return (await c.query(q.sql, q.vals)).rows[0]
    })
  }

  @Roles('admin', 'staff')
  @Delete('delivery-zones/:id')
  deleteZone(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    this.assertAnyManager(user)
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const cur = await c.query('SELECT 1 FROM fnb.delivery_zones WHERE id = $1', [id])
      if (!cur.rowCount) throw new NotFoundException('منطقه یافت نشد')
      const used = await c.query('SELECT 1 FROM fnb.orders WHERE delivery_zone_id = $1 LIMIT 1', [id])
      if (used.rowCount) {
        await c.query('UPDATE fnb.delivery_zones SET is_active = false WHERE id = $1', [id])
        return { id, deleted: false, deactivated: true }
      }
      await c.query('DELETE FROM fnb.delivery_zones WHERE id = $1', [id])
      return { id, deleted: true, deactivated: false }
    })
  }

  private assertAnyManager(user: JwtPayload) {
    if (!manageKinds(user).length) throw new ForbiddenException('دسترسی مدیریت مناطق تحویل را ندارید')
  }
}
