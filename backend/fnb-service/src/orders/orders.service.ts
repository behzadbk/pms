import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { FnbGateway } from '../realtime/fnb.gateway'
import { canTransition, OrderStatus, RELEASES_STOCK } from './order-status'
import { JwtPayload } from '../auth/decorators/current-user.decorator'
import { faDigits, manageKinds, myMembership, notify, OPEN_NOW_SQL, permForKind, quietHours, VenueKind } from '../common/access'

export interface PlaceOrderDto {
  venue_id: string
  delivery_type: 'in_unit' | 'amenity_zone'
  delivery_zone_id?: string
  delivery_note?: string
  items: { item_id: string; quantity: number }[]
}

const ORDER_SELECT = `
  SELECT o.id, o.order_number, o.venue_id, v.name AS venue_name, v.kind AS venue_kind, v.prep_time_minutes,
         o.unit_id, u.unit_number, o.delivery_type, o.delivery_zone_id, z.name AS zone_name, o.delivery_note,
         o.status, o.subtotal, o.surcharge, o.total, o.placed_at, o.ready_at, o.delivered_at, o.cancellation_reason,
         COALESCE((SELECT json_agg(json_build_object('item_id', oi.item_id, 'name', oi.item_name_snapshot, 'quantity', oi.quantity,
                                                     'unit_price', oi.unit_price, 'line_total', oi.line_total) ORDER BY oi.item_name_snapshot)
                     FROM fnb.order_items oi WHERE oi.order_id = o.id), '[]'::json) AS items
    FROM fnb.orders o
    JOIN fnb.venues v ON v.id = o.venue_id
    LEFT JOIN property.units u ON u.id = o.unit_id
    LEFT JOIN fnb.delivery_zones z ON z.id = o.delivery_zone_id`

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly gateway: FnbGateway,
  ) {}

  /**
   * ثبت سفارش. تضمین‌های کلیدی:
   *  ۱ قیمت‌ها و واحد ساکن همیشه از دیتابیس خوانده می‌شوند، نه از بدنه درخواست کلاینت.
   *  ۲ رزرو موجودی و درج سفارش داخل یک تراکنش با SELECT ... FOR UPDATE انجام می‌شود.
   *  ۳ نام و قیمت هر آیتم snapshot می‌شود تا تغییر بعدی منو فاکتور گذشته را عوض نکند.
   *  ۴ قواعد مجموعه: باز بودن، حداقل سفارش، پذیرش تحویل در واحد، تعلق آیتم‌ها به همان مجموعه.
   */
  async place(user: JwtPayload, dto: PlaceOrderDto) {
    const tenantId = user.tenant_id!
    if (!dto?.venue_id) throw new BadRequestException('مجموعه‌ی سفارش مشخص نیست')
    if (!Array.isArray(dto.items) || !dto.items.length) throw new BadRequestException('سبد سفارش خالی است')
    if (!['in_unit', 'amenity_zone'].includes(dto.delivery_type)) throw new BadRequestException('نوع تحویل نامعتبر است')
    const qty = new Map<string, number>()
    for (const line of dto.items) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
        throw new BadRequestException('تعداد هر آیتم باید عددی صحیح بین ۱ و ۵۰ باشد')
      }
      qty.set(line.item_id, (qty.get(line.item_id) ?? 0) + line.quantity)
    }
    if (dto.delivery_type === 'amenity_zone' && !dto.delivery_zone_id) {
      throw new BadRequestException('برای تحویل در مشاعات، انتخاب منطقه الزامی است')
    }

    const order = await this.db.withTenant(tenantId, async (c) => {
      const m = await myMembership(c, user)
      if (m.role === 'child') {
        const lv = (await c.query<{ lv: number }>(`SELECT residency.child_module_level($1, 'food') AS lv`, [m.id])).rows[0]?.lv ?? 0
        if (lv < 1) throw new ForbiddenException('این بخش برای تو فعال نیست')
        if ((await c.query<{ q: boolean }>(`SELECT residency.in_quiet_hours($1) AS q`, [m.id])).rows[0].q) quietHours()
        if (lv < 2) throw new ForbiddenException('ثبت سفارش برای این حساب نیاز به تأیید والدین دارد')
      }
      if (['caregiver', 'owner_absent'].includes(m.role)) throw new ForbiddenException('سفارش غذا برای این نوع عضویت فعال نیست')
      // قوانین برج: سفارش غذا برای واحد بدهکار بسته است (اگر مدیر این بخش را محدود کرده باشد)
      const lock = await c.query<{ r: boolean }>(`SELECT residency.unit_restricted($1, 'module:food') AS r`, [m.unit_id])
      if (lock.rows[0]?.r) {
        throw new ForbiddenException({ statusCode: 403, code: 'debtor_restricted', message: 'سفارش غذا برای واحد شما به‌علت معوقه‌ی شارژ بسته است؛ پس از تسویه باز می‌شود.' })
      }

      const vr = await c.query(`SELECT v.*, ${OPEN_NOW_SQL} AS open_now FROM fnb.venues v WHERE v.id = $1`, [dto.venue_id])
      const venue = vr.rows[0]
      if (!venue || !venue.is_active) throw new NotFoundException('مجموعه یافت نشد')
      if (!venue.open_now) throw new ConflictException(`«${venue.name}» الان بسته است`)
      if (dto.delivery_type === 'in_unit' && !venue.accepts_delivery) {
        throw new ConflictException(`«${venue.name}» تحویل در واحد ندارد؛ یکی از مناطق مشاعات را انتخاب کنید`)
      }

      const ids = [...qty.keys()]
      const itemsRes = await c.query(
        `SELECT id, name, price, availability, stock_count, reserved_count
           FROM fnb.menu_items WHERE id = ANY($1::uuid[]) AND venue_id = $2 FOR UPDATE`,
        [ids, dto.venue_id],
      )
      const byId = new Map(itemsRes.rows.map((r) => [r.id, r]))

      let subtotal = 0
      for (const [itemId, q] of qty) {
        const item = byId.get(itemId)
        if (!item) throw new NotFoundException('یکی از آیتم‌های سبد در این منو وجود ندارد')
        if (item.availability !== 'available') throw new ConflictException(`«${item.name}» در حال حاضر موجود نیست`)
        if (item.stock_count !== null && item.stock_count - item.reserved_count < q) {
          throw new ConflictException(`موجودی «${item.name}» کافی نیست`)
        }
        subtotal += Number(item.price) * q
      }
      if (subtotal < Number(venue.min_order)) {
        throw new ConflictException(`حداقل مبلغ سفارش ${faDigits(Number(venue.min_order).toLocaleString('en-US'))} تومان است`)
      }

      let surcharge = 0
      let zoneId: string | null = null
      if (dto.delivery_type === 'amenity_zone') {
        const z = (await c.query(`SELECT * FROM fnb.delivery_zones WHERE id = $1 AND is_active AND zone_type = 'amenity_zone'`, [dto.delivery_zone_id])).rows[0]
        if (!z) throw new BadRequestException('منطقه تحویل نامعتبر است')
        surcharge = Number(z.surcharge ?? 0)
        zoneId = z.id
      }

      const num = (await c.query<{ n: string }>(`SELECT nextval('fnb.order_number_seq')::text AS n`)).rows[0].n
      const o = (await c.query(
        `INSERT INTO fnb.orders
           (tenant_id, order_number, venue_id, unit_id, ordered_by, person_id, delivery_type,
            delivery_zone_id, delivery_note, status, subtotal, surcharge, total, placed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'placed',$10,$11,$12, now()) RETURNING id`,
        [tenantId, num, dto.venue_id, m.unit_id, user.sub, m.user_id, dto.delivery_type, zoneId,
         (dto.delivery_note ?? '').toString().trim().slice(0, 200) || null, subtotal, surcharge, subtotal + surcharge],
      )).rows[0]

      for (const [itemId, q] of qty) {
        const item = byId.get(itemId)!
        await c.query(
          `INSERT INTO fnb.order_items (tenant_id, order_id, item_id, item_name_snapshot, unit_price, quantity, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, o.id, item.id, item.name, item.price, q, Number(item.price) * q],
        )
        // رزرو موقت موجودی (نه کسر قطعی) — با رد/لغو آزاد می‌شود
        if (item.stock_count !== null) {
          await c.query('UPDATE fnb.menu_items SET reserved_count = reserved_count + $1 WHERE id = $2', [q, item.id])
        }
      }
      await c.query(
        `INSERT INTO fnb.order_status_history (tenant_id, order_id, from_status, to_status, changed_by) VALUES ($1,$2,'draft','placed',$3)`,
        [tenantId, o.id, user.sub],
      )

      const full = await this.fetchOne(c, o.id)
      // اعلان به کارکنان همان بخش (آشپزخانه یا کافی‌شاپ)
      await notify(c, tenantId, [{ role: 'perm:' + permForKind(venue.kind) }], {
        kind: 'fnb_order_placed',
        title: `سفارش جدید #${faDigits(num)} — واحد ${faDigits(full.unit_number ?? '')}`,
        body: `${venue.name} · ${faDigits(full.items.length)} قلم`,
        link: venue.kind === 'cafe' ? '/staff/cafe' : '/staff/kitchen',
        ref: o.id,
      })
      return full
    })

    this.gateway.broadcast(tenantId, 'order.status.changed', { orderId: order.id, status: 'placed' })
    this.events.publish('order.placed', { orderId: order.id, unitId: order.unit_id, total: order.total }, tenantId)
    return order
  }

  async changeStatus(user: JwtPayload, orderId: string, to: OrderStatus, reason?: string, asResident = false) {
    const tenantId = user.tenant_id!
    const out = await this.db.withTenant(tenantId, async (c) => {
      const res = await c.query(
        `SELECT o.*, v.kind AS venue_kind, v.name AS venue_name FROM fnb.orders o JOIN fnb.venues v ON v.id = o.venue_id WHERE o.id = $1 FOR UPDATE OF o`,
        [orderId],
      )
      const order = res.rows[0]
      if (!order) throw new NotFoundException('سفارش یافت نشد')
      if (asResident) {
        const m = await myMembership(c, user)
        if (m.unit_id !== order.unit_id) throw new NotFoundException('سفارش یافت نشد')
      } else if (!manageKinds(user).includes(order.venue_kind as VenueKind)) {
        throw new ForbiddenException('دسترسی به سفارش‌های این بخش را ندارید')
      }
      if (!canTransition(order.status, to)) throw new ConflictException(`گذار از «${order.status}» به «${to}» مجاز نیست`)
      if (to === 'rejected' && !asResident && !reason?.trim()) {
        // دلیل اختیاری است؛ برای ساکن پیام پیش‌فرض می‌گذاریم
        reason = 'پذیرفته نشد'
      }

      const timeCol = to === 'ready' ? ', ready_at = now()' : to === 'delivered' ? ', delivered_at = now()' : ''
      await c.query(
        `UPDATE fnb.orders SET status = $1, cancellation_reason = COALESCE($2, cancellation_reason)${timeCol} WHERE id = $3`,
        [to, reason ?? null, orderId],
      )
      // آزادسازی موجودی رزروشده در صورت رد یا لغو
      if (RELEASES_STOCK.includes(to)) {
        await c.query(
          `UPDATE fnb.menu_items m SET reserved_count = GREATEST(0, m.reserved_count - oi.quantity)
             FROM fnb.order_items oi WHERE oi.order_id = $1 AND oi.item_id = m.id`, [orderId])
      }
      // کسر قطعی موجودی هنگام تحویل
      if (to === 'delivered') {
        await c.query(
          `UPDATE fnb.menu_items m
              SET stock_count = CASE WHEN m.stock_count IS NULL THEN NULL ELSE GREATEST(0, m.stock_count - oi.quantity) END,
                  reserved_count = GREATEST(0, m.reserved_count - oi.quantity)
             FROM fnb.order_items oi WHERE oi.order_id = $1 AND oi.item_id = m.id`, [orderId])
      }
      await c.query(
        `INSERT INTO fnb.order_status_history (tenant_id, order_id, from_status, to_status, changed_by) VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, orderId, order.status, to, user.sub],
      )

      // اعلان به ساکن سفارش‌دهنده (پوش خودکار)
      const TEXT: Partial<Record<OrderStatus, string>> = {
        accepted: 'سفارش شما پذیرفته شد',
        ready: 'سفارش شما آماده است',
        out_for_delivery: 'سفارش شما در راه است',
        rejected: 'سفارش شما پذیرفته نشد',
      }
      if (!asResident && TEXT[to] && order.person_id) {
        await notify(c, tenantId, [{ person: order.person_id }], {
          kind: `fnb_order_${to}`, title: `${TEXT[to]} — #${faDigits(order.order_number)}`,
          body: to === 'rejected' ? reason ?? order.venue_name : order.venue_name, link: '/resident/food-order', ref: orderId,
        })
      }
      return { unit_id: order.unit_id, order: await this.fetchOne(c, orderId) }
    })
    this.gateway.broadcast(tenantId, 'order.status.changed', { orderId, status: to })
    this.events.publish(`order.${to}`, { orderId, unitId: out.unit_id }, tenantId)
    return out.order
  }

  private async fetchOne(c: PoolClient, id: string) {
    const r = await c.query(`${ORDER_SELECT} WHERE o.id = $1`, [id])
    if (!r.rows[0]) throw new NotFoundException('سفارش یافت نشد')
    return r.rows[0]
  }

  /** یک سفارش — ساکن فقط سفارش واحد خودش، مدیر/کارمند فقط بخش‌های خودش */
  async findOne(user: JwtPayload, id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const o = await this.fetchOne(c, id)
      if (['admin', 'staff'].includes(user.role)) {
        if (!manageKinds(user).includes(o.venue_kind)) throw new ForbiddenException('دسترسی به این سفارش را ندارید')
      } else if ((await myMembership(c, user)).unit_id !== o.unit_id) throw new NotFoundException('سفارش یافت نشد')
      return o
    })
  }

  /** سفارش‌های واحد من — جدیدترین‌ها */
  async listMine(user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const m = await myMembership(c, user)
      const r = await c.query(`${ORDER_SELECT} WHERE o.unit_id = $1 ORDER BY o.placed_at DESC NULLS LAST LIMIT 30`, [m.unit_id])
      return r.rows
    })
  }

  /** صف زنده آشپزخانه — فقط سفارش‌های در جریانِ بخش‌هایی که کاربر به آن‌ها دسترسی دارد */
  async kitchenQueue(user: JwtPayload, kind?: string, venueId?: string) {
    const kinds = manageKinds(user).filter((k) => !kind || k === kind)
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const args: unknown[] = [kinds]
      let extra = ''
      if (venueId) { args.push(venueId); extra = ` AND o.venue_id = $${args.length}` }
      const r = await c.query(
        `${ORDER_SELECT}
          WHERE v.kind = ANY($1::text[]) AND o.status IN ('placed','accepted','preparing','ready','out_for_delivery')${extra}
          ORDER BY o.placed_at ASC`, args)
      const d = await c.query(
        `SELECT count(*)::int AS n FROM fnb.orders o JOIN fnb.venues v ON v.id = o.venue_id
          WHERE v.kind = ANY($1::text[]) AND o.status = 'delivered'${extra}
            AND (o.delivered_at AT TIME ZONE 'Asia/Tehran')::date = (now() AT TIME ZONE 'Asia/Tehran')::date`, args)
      return { orders: r.rows, delivered_today: d.rows[0].n, server_time: new Date().toISOString() }
    })
  }
}
