import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { FnbGateway } from '../realtime/fnb.gateway'
import { canTransition, OrderStatus, RELEASES_STOCK } from './order-status'

export interface PlaceOrderDto {
  venueId: string
  unitId: string
  deliveryType: 'in_unit' | 'amenity_zone'
  deliveryZoneId?: string
  deliveryNote?: string
  items: { itemId: string; quantity: number; selectedOptions?: unknown }[]
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly gateway: FnbGateway,
  ) {}

  /**
   * ثبت سفارش. سه تضمین کلیدی:
   *  ۱ قیمت‌ها همیشه از دیتابیس خوانده می‌شوند، نه از بدنه درخواست کلاینت.
   *  ۲ رزرو موجودی و درج سفارش داخل یک تراکنش با SELECT ... FOR UPDATE انجام
   *    می‌شود تا دو سفارش هم‌زمان نتوانند آخرین موجودی را با هم بردارند.
   *  ۳ نام و قیمت هر آیتم snapshot می‌شود تا تغییر بعدی منو فاکتور گذشته را عوض نکند.
   */
  async place(tenantId: string, userId: string, dto: PlaceOrderDto) {
    if (!dto.items?.length) throw new BadRequestException('سبد سفارش خالی است')
    // بدون این چک، تعداد منفی مبلغ سفارش را منفی و موجودی را افزایش می‌داد
    for (const line of dto.items) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
        throw new BadRequestException('تعداد هر آیتم باید عددی صحیح بین ۱ و ۵۰ باشد')
      }
    }
    if (dto.deliveryType === 'amenity_zone' && !dto.deliveryZoneId) {
      throw new BadRequestException('برای تحویل در مشاعات، انتخاب منطقه الزامی است')
    }

    return this.db.withTenant(tenantId, async (c) => {
      const ids = dto.items.map((i) => i.itemId)
      const itemsRes = await c.query(
        `SELECT id, name, price, availability, stock_count, reserved_count
         FROM fnb.menu_items WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [ids],
      )
      const byId = new Map(itemsRes.rows.map((r) => [r.id, r]))

      let subtotal = 0
      for (const line of dto.items) {
        const item = byId.get(line.itemId)
        if (!item) throw new NotFoundException(`آیتم ${line.itemId} یافت نشد`)
        if (item.availability !== 'available') {
          throw new ConflictException(`«${item.name}» در حال حاضر موجود نیست`)
        }
        if (item.stock_count !== null && item.stock_count - item.reserved_count < line.quantity) {
          throw new ConflictException(`موجودی «${item.name}» کافی نیست`)
        }
        subtotal += Number(item.price) * line.quantity
      }

      const zone = dto.deliveryZoneId
        ? (await c.query('SELECT * FROM fnb.delivery_zones WHERE id = $1 AND is_active', [dto.deliveryZoneId])).rows[0]
        : null
      if (dto.deliveryZoneId && !zone) throw new BadRequestException('منطقه تحویل نامعتبر است')

      const surcharge = Number(zone?.surcharge ?? 0)
      const orderNumber = `${Date.now().toString().slice(-6)}`

      const orderRes = await c.query(
        `INSERT INTO fnb.orders
           (tenant_id, order_number, venue_id, unit_id, ordered_by, delivery_type,
            delivery_zone_id, delivery_note, status, subtotal, surcharge, total, placed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'placed',$9,$10,$11, now()) RETURNING *`,
        [
          tenantId, orderNumber, dto.venueId, dto.unitId, userId, dto.deliveryType,
          dto.deliveryZoneId ?? null, dto.deliveryNote ?? null, subtotal, surcharge, subtotal + surcharge,
        ],
      )
      const order = orderRes.rows[0]

      for (const line of dto.items) {
        const item = byId.get(line.itemId)!
        await c.query(
          `INSERT INTO fnb.order_items
             (tenant_id, order_id, item_id, item_name_snapshot, unit_price, quantity, selected_options, line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            tenantId, order.id, item.id, item.name, item.price, line.quantity,
            JSON.stringify(line.selectedOptions ?? null), Number(item.price) * line.quantity,
          ],
        )
        // رزرو موقت موجودی (نه کسر قطعی) — با رد/لغو آزاد می‌شود
        if (item.stock_count !== null) {
          await c.query('UPDATE fnb.menu_items SET reserved_count = reserved_count + $1 WHERE id = $2', [
            line.quantity, item.id,
          ])
        }
      }

      await c.query(
        `INSERT INTO fnb.order_status_history (tenant_id, order_id, from_status, to_status, changed_by)
         VALUES ($1,$2,'draft','placed',$3)`,
        [tenantId, order.id, userId],
      )

      this.gateway.broadcast(tenantId, 'order.status.changed', { orderId: order.id, status: 'placed' })
      this.events.publish('order.placed', { orderId: order.id, unitId: dto.unitId, total: order.total }, tenantId)
      return order
    })
  }

  async changeStatus(
    tenantId: string,
    orderId: string,
    to: OrderStatus,
    userId: string,
    reason?: string,
    onlyOwnOrder = false,
  ) {
    return this.db.withTenant(tenantId, async (c) => {
      const res = await c.query('SELECT * FROM fnb.orders WHERE id = $1 FOR UPDATE', [orderId])
      const order = res.rows[0]
      if (!order) throw new NotFoundException('سفارش یافت نشد')
      // ساکن فقط سفارش خودش را می‌تواند لغو کند
      if (onlyOwnOrder && order.ordered_by !== userId) throw new NotFoundException('سفارش یافت نشد')

      if (!canTransition(order.status, to)) {
        throw new ConflictException(`گذار از «${order.status}» به «${to}» مجاز نیست`)
      }

      const timeCol =
        to === 'ready' ? ', ready_at = now()' : to === 'delivered' ? ', delivered_at = now()' : ''
      const updated = await c.query(
        `UPDATE fnb.orders SET status = $1, cancellation_reason = COALESCE($2, cancellation_reason)${timeCol}
         WHERE id = $3 RETURNING *`,
        [to, reason ?? null, orderId],
      )

      // آزادسازی موجودی رزروشده در صورت رد یا لغو
      if (RELEASES_STOCK.includes(to)) {
        await c.query(
          `UPDATE fnb.menu_items m SET reserved_count = GREATEST(0, m.reserved_count - oi.quantity)
           FROM fnb.order_items oi WHERE oi.order_id = $1 AND oi.item_id = m.id`,
          [orderId],
        )
      }
      // کسر قطعی موجودی هنگام تحویل
      if (to === 'delivered') {
        await c.query(
          `UPDATE fnb.menu_items m
           SET stock_count = CASE WHEN m.stock_count IS NULL THEN NULL
                                  ELSE GREATEST(0, m.stock_count - oi.quantity) END,
               reserved_count = GREATEST(0, m.reserved_count - oi.quantity)
           FROM fnb.order_items oi WHERE oi.order_id = $1 AND oi.item_id = m.id`,
          [orderId],
        )
      }

      await c.query(
        `INSERT INTO fnb.order_status_history (tenant_id, order_id, from_status, to_status, changed_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, orderId, order.status, to, userId],
      )

      this.gateway.broadcast(tenantId, 'order.status.changed', { orderId, status: to })
      this.events.publish(`order.${to}`, { orderId, unitId: order.unit_id }, tenantId)
      return updated.rows[0]
    })
  }

  async findOne(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const o = await c.query('SELECT * FROM fnb.orders WHERE id = $1', [id])
      if (!o.rows[0]) throw new NotFoundException('سفارش یافت نشد')
      const items = await c.query('SELECT * FROM fnb.order_items WHERE order_id = $1', [id])
      return { ...o.rows[0], items: items.rows }
    })
  }

  async listByUnit(tenantId: string, unitId: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        'SELECT * FROM fnb.orders WHERE unit_id = $1 ORDER BY placed_at DESC NULLS LAST LIMIT 50',
        [unitId],
      )
      return r.rows
    })
  }

  /** صف زنده آشپزخانه — فقط سفارش‌های در جریان */
  async kitchenQueue(tenantId: string) {
    return this.db.withTenant(tenantId, async (c) => {
      const r = await c.query(
        `SELECT o.*, json_agg(json_build_object('name', oi.item_name_snapshot, 'qty', oi.quantity)) AS items,
                z.name AS zone_name
         FROM fnb.orders o
         LEFT JOIN fnb.order_items oi ON oi.order_id = o.id
         LEFT JOIN fnb.delivery_zones z ON z.id = o.delivery_zone_id
         WHERE o.status IN ('placed','accepted','preparing','ready','out_for_delivery')
         GROUP BY o.id, z.name
         ORDER BY o.placed_at ASC`,
      )
      return r.rows
    })
  }
}
