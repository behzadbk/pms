import { Controller, Get } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { FINANCE_ACCESS_SQL } from '../billing/notify'
import { periodOfIso, periodRange, shiftPeriod, tehranToday } from '../common/jalali'

const MY_UNITS = `SELECT DISTINCT m.unit_id FROM residency.memberships m WHERE m.user_id = $1 AND ${FINANCE_ACCESS_SQL}`

/** نمای ساکن: شارژهای واحد خودم، رسیدها و شفافیت مالی ساختمان (کودک/مراقب دسترسی ندارند) */
@Controller()
@Roles('resident')
export class MeController {
  constructor(private readonly db: DatabaseService) {}

  @Get('me/charges')
  charges(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `SELECT c.id, c.unit_id, u.unit_number, c.period, c.base_amount, c.late_fee_amount, c.total_amount, c.due_date, c.status, c.paid_at, c.pay_method, c.breakdown,
                (SELECT f.name FROM finance.charge_formulas f WHERE f.id = c.formula_id) AS formula_name
           FROM finance.monthly_charges c JOIN property.units u ON u.id = c.unit_id
          WHERE c.unit_id IN (${MY_UNITS}) ORDER BY c.period DESC, u.unit_number`,
        [user.pid ?? null],
      )
      return r.rows
    })
  }

  @Get('me/receipts')
  receipts(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `SELECT p.id, p.amount, p.method, p.reference, p.paid_at, c.period, u.unit_number
           FROM finance.payments p JOIN finance.monthly_charges c ON c.id = p.monthly_charge_id JOIN property.units u ON u.id = c.unit_id
          WHERE p.status = 'success' AND c.unit_id IN (${MY_UNITS}) ORDER BY p.paid_at DESC NULLS LAST LIMIT 100`,
        [user.pid ?? null],
      )
      return r.rows
    })
  }

  /**
   * صورتحساب کافه و رستوران واحد من: سفارش‌های «تحویل‌شده» که مبلغشان به شارژ متغیر واحد می‌رود.
   * فقط واحدهای خودِ ساکن (MY_UNITS)؛ charge_period = شارژی که سفارش در آن می‌نشیند (یا خواهد نشست).
   */
  @Get('me/fnb-bills')
  fnbBills(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query<{ delivered_at: string; billed_charge_id: string | null; billed_period: string | null; charge_status: string | null } & Record<string, unknown>>(
        `SELECT o.id, o.order_number, v.name AS venue_name, v.kind AS venue_kind, u.unit_number,
                o.subtotal, o.surcharge, o.total, o.delivered_at, o.billed_charge_id,
                c.period AS billed_period, c.status AS charge_status,
                COALESCE((SELECT json_agg(json_build_object('name', oi.item_name_snapshot, 'quantity', oi.quantity,
                                                            'unit_price', oi.unit_price, 'line_total', oi.line_total) ORDER BY oi.item_name_snapshot)
                            FROM fnb.order_items oi WHERE oi.order_id = o.id), '[]'::json) AS items
           FROM fnb.orders o
           JOIN fnb.venues v ON v.id = o.venue_id
           JOIN property.units u ON u.id = o.unit_id
           LEFT JOIN finance.monthly_charges c ON c.id = o.billed_charge_id
          WHERE o.status = 'delivered' AND NOT o.bill_exempt AND o.total > 0 AND o.unit_id IN (${MY_UNITS})
          ORDER BY o.delivered_at DESC LIMIT 100`,
        [user.pid ?? null],
      )
      return r.rows.map((o) => {
        const deliveredPeriod = periodOfIso(tehranToday(new Date(o.delivered_at)))
        return { ...o, delivered_period: deliveredPeriod, charge_period: o.billed_period ?? shiftPeriod(deliveredPeriod, 1), billed: !!o.billed_charge_id }
      })
    })
  }

  /** هزینه‌های پرداخت‌شده‌ی ساختمان در ماه جاری و ماه قبل — کل‌ساختمان، بدون پیوست */
  @Get('resident/transparency')
  transparency(@CurrentUser() user: JwtPayload) {
    const current = periodOfIso(tehranToday())
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const month = async (period: string) => {
        const { start, end } = periodRange(period)
        const inv = await client.query(
          `SELECT id, vendor, category, description, amount, paid_on FROM finance.expense_invoices
            WHERE status = 'paid' AND paid_on BETWEEN $1::date AND $2::date ORDER BY paid_on DESC, amount DESC`, [start, end])
        const cats = new Map<string, number>()
        for (const i of inv.rows) cats.set(i.category, (cats.get(i.category) ?? 0) + i.amount)
        return {
          period,
          total: inv.rows.reduce((a, i) => a + i.amount, 0),
          by_category: [...cats.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
          invoices: inv.rows,
        }
      }
      return { current: await month(current), previous: await month(shiftPeriod(current, -1)) }
    })
  }
}
