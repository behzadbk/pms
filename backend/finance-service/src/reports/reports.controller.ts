import { Controller, Get, Query } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { SettingsService } from '../billing/settings.service'
import { bad, num } from '../common/validate'
import { parsePeriod, periodOfIso, periodRange, shiftPeriod, tehranToday } from '../common/jalali'

/** گزارش‌های تجمیعی واقعی (جایگزین financeSummary/monthlyTrend ساختگی) */
@Controller()
export class ReportsController {
  constructor(private readonly db: DatabaseService, private readonly settings: SettingsService) {}

  @Roles('admin', 'accountant')
  @Get('summary')
  summary(@Query('months') monthsQ: string | undefined, @Query('period') periodQ: string | undefined, @CurrentUser() user: JwtPayload) {
    const months = num(monthsQ, 'تعداد ماه', { min: 1, max: 24, int: true }) ?? 6
    if (periodQ && !parsePeriod(periodQ)) bad('دوره نامعتبر است')
    const today = tehranToday()
    const current = periodOfIso(today)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const s = await this.settings.get(client, user.tenant_id!)
      const first = shiftPeriod(current, -(months - 1))
      const from = periodRange(first).start
      const to = periodRange(current).end

      const tot = (await client.query(
        `SELECT (SELECT coalesce(sum(amount),0) FROM finance.payments WHERE status = 'success') AS income_total,
                (SELECT coalesce(sum(amount),0) FROM finance.expense_invoices WHERE status = 'paid') AS expense_total,
                (SELECT count(*)::int FROM finance.expense_invoices WHERE status = 'pending') AS unpaid_count,
                (SELECT coalesce(sum(amount),0) FROM finance.expense_invoices WHERE status = 'pending') AS unpaid_total,
                (SELECT max(period) FROM finance.monthly_charges WHERE period <= $1) AS latest_period`, [current],
      )).rows[0]

      const inc = await client.query<{ d: string; amt: number }>(
        `SELECT (paid_at AT TIME ZONE 'Asia/Tehran')::date::text AS d, sum(amount) AS amt FROM finance.payments
          WHERE status = 'success' AND (paid_at AT TIME ZONE 'Asia/Tehran')::date BETWEEN $1::date AND $2::date GROUP BY 1`, [from, to])
      const exp = await client.query<{ d: string; amt: number }>(
        `SELECT paid_on::text AS d, sum(amount) AS amt FROM finance.expense_invoices
          WHERE status = 'paid' AND paid_on BETWEEN $1::date AND $2::date GROUP BY 1`, [from, to])
      const monthly = Array.from({ length: months }, (_, i) => ({ period: shiftPeriod(first, i), income: 0, expense: 0 }))
      const idx = new Map(monthly.map((m, i) => [m.period, i]))
      for (const r of inc.rows) { const i = idx.get(periodOfIso(r.d)); if (i !== undefined) monthly[i].income += r.amt }
      for (const r of exp.rows) { const i = idx.get(periodOfIso(r.d)); if (i !== undefined) monthly[i].expense += r.amt }

      const byCat = await client.query<{ category: string; amount: number }>(
        `SELECT category, sum(amount) AS amount FROM finance.expense_invoices
          WHERE status = 'paid' AND paid_on BETWEEN $1::date AND $2::date GROUP BY category ORDER BY amount DESC`, [from, to])

      const collectPeriod = periodQ ?? tot.latest_period ?? current
      const col = (await client.query(
        `SELECT count(*)::int AS count, coalesce(sum(total_amount),0) AS total,
                coalesce(sum(total_amount) FILTER (WHERE status = 'paid'),0) AS paid,
                count(*) FILTER (WHERE status = 'pending')::int AS pending_count,
                count(*) FILTER (WHERE status = 'overdue')::int AS overdue_count,
                coalesce(sum(total_amount) FILTER (WHERE status = 'overdue'),0) AS overdue_total
           FROM finance.monthly_charges WHERE period = $1`, [collectPeriod])).rows[0]

      const overdue = await client.query(
        `SELECT c.id, c.period, c.total_amount, c.late_fee_amount, c.due_date, u.unit_number
           FROM finance.monthly_charges c JOIN property.units u ON u.id = c.unit_id
          WHERE c.status = 'overdue' ORDER BY c.due_date, u.unit_number LIMIT 100`)
      const overdueAll = (await client.query(`SELECT count(*)::int AS count, coalesce(sum(total_amount),0) AS total FROM finance.monthly_charges WHERE status = 'overdue'`)).rows[0]

      const recent = await client.query(
        `SELECT p.id, p.amount, p.method, p.paid_at, c.period, u.unit_number
           FROM finance.payments p JOIN finance.monthly_charges c ON c.id = p.monthly_charge_id JOIN property.units u ON u.id = c.unit_id
          WHERE p.status = 'success' ORDER BY p.paid_at DESC NULLS LAST LIMIT 8`)

      const thisMonth = monthly[monthly.length - 1]
      return {
        current_period: current,
        opening_balance: s.opening_balance,
        income_total: tot.income_total,
        expense_total: tot.expense_total,
        fund_balance: s.opening_balance + tot.income_total - tot.expense_total,
        month_income: thisMonth.income,
        month_expense: thisMonth.expense,
        collection: { period: collectPeriod, ...col, rate: col.total ? Math.round((col.paid / col.total) * 100) : 0, outstanding: col.total - col.paid },
        overdue: { ...overdueAll, units: overdue.rows },
        unpaid_invoices: { count: tot.unpaid_count, total: tot.unpaid_total },
        monthly,
        expense_by_category: byCat.rows,
        recent_payments: recent.rows,
      }
    })
  }

  /** گردش صندوق: وصولی‌های شارژ (+) و فاکتورهای پرداخت‌شده (−) به ترتیب تاریخ */
  @Roles('admin', 'accountant')
  @Get('ledger')
  ledger(@Query('limit') limitQ: string | undefined, @CurrentUser() user: JwtPayload) {
    const limit = num(limitQ, 'تعداد', { min: 1, max: 500, int: true }) ?? 100
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `SELECT * FROM (
           SELECT 'p-' || p.id AS id, 'income' AS type, p.amount, (p.paid_at AT TIME ZONE 'Asia/Tehran')::date::text AS date, p.paid_at AS sort_at,
                  p.method, p.reference, u.unit_number, c.period, NULL::text AS vendor, NULL::text AS description, NULL::uuid AS invoice_id
             FROM finance.payments p JOIN finance.monthly_charges c ON c.id = p.monthly_charge_id JOIN property.units u ON u.id = c.unit_id
            WHERE p.status = 'success'
           UNION ALL
           SELECT 'i-' || i.id, 'expense', i.amount, i.paid_on::text, i.updated_at, i.pay_method, i.number, NULL, NULL, i.vendor, i.description, i.id
             FROM finance.expense_invoices i WHERE i.status = 'paid'
         ) t ORDER BY date DESC, sort_at DESC LIMIT $1`, [limit])
      return r.rows
    })
  }

  /**
   * ریز «شارژ متغیر» به تفکیک واحد برای یک ماه (مصرف خدمات + سفارش‌های تحویل‌شده‌ی کافه/رستوران) — مانیتورینگ مدیر.
   * عمداً فقط مدیر ساختمان: ریز مصرف و وضعیت تسویه‌ی هر واحد نباید برای ساکنین دیگر، کارکنان یا نگهبانی دیده شود
   * (ساکن فقط صورتحساب واحد خودش را می‌بیند: me/fnb-bills و me/charges).
   */
  @Roles('admin')
  @Get('reports/variable-charges')
  variableCharges(@Query('period') periodQ: string | undefined, @CurrentUser() user: JwtPayload) {
    const period = periodQ ?? periodOfIso(tehranToday())
    if (!parsePeriod(period)) bad('دوره باید شمسی و به شکل YYYY-MM باشد')
    const { start, end } = periodRange(period)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const orders = await client.query<{ unit_id: string; unit_number: string; id: string; order_number: string; venue_name: string; total: number; delivered_at: string; billed: boolean; exempt: boolean }>(
        `SELECT o.unit_id, u.unit_number, o.id, o.order_number, v.name AS venue_name, o.total::float8 AS total, o.delivered_at,
                (o.billed_charge_id IS NOT NULL) AS billed, o.bill_exempt AS exempt
           FROM fnb.orders o JOIN property.units u ON u.id = o.unit_id JOIN fnb.venues v ON v.id = o.venue_id
          WHERE o.status = 'delivered' AND o.total > 0 AND (o.delivered_at AT TIME ZONE 'Asia/Tehran')::date BETWEEN $1::date AND $2::date
          ORDER BY o.delivered_at DESC LIMIT 1000`, [start, end])
      const services = await client.query<{ unit_id: string; unit_number: string; service: string; qty: number; amount: number; billed: boolean }>(
        `SELECT e.unit_id, u.unit_number, s.title AS service, sum(e.overage_qty)::float8 AS qty, sum(e.amount)::float8 AS amount,
                bool_and(e.billed_charge_id IS NOT NULL) AS billed
           FROM entitlement.usage_events e JOIN entitlement.services s ON s.id = e.service_id JOIN property.units u ON u.id = e.unit_id
          WHERE e.status = 'active' AND e.amount > 0 AND e.period = $1
          GROUP BY e.unit_id, u.unit_number, s.title ORDER BY u.unit_number, s.title`, [period])

      const byUnit = new Map<string, { unit_id: string; unit_number: string; fnb_orders: number; fnb_total: number; fnb_pending: number; service_total: number; service_pending: number }>()
      const unit = (id: string, no: string) => {
        let u = byUnit.get(id)
        if (!u) { u = { unit_id: id, unit_number: no, fnb_orders: 0, fnb_total: 0, fnb_pending: 0, service_total: 0, service_pending: 0 }; byUnit.set(id, u) }
        return u
      }
      // سفارش‌های معاف‌شده (قبل از راه‌اندازی صورتحساب) در جمع نمی‌آیند؛ فقط در فهرست سفارش‌ها علامت می‌خورند
      for (const o of orders.rows) {
        if (o.exempt) continue
        const u = unit(o.unit_id, o.unit_number)
        u.fnb_orders += 1
        u.fnb_total += o.total
        if (!o.billed) u.fnb_pending += o.total
      }
      for (const x of services.rows) {
        const u = unit(x.unit_id, x.unit_number)
        u.service_total += x.amount
        if (!x.billed) u.service_pending += x.amount
      }
      const units = [...byUnit.values()]
        .map((u) => ({ ...u, total: u.fnb_total + u.service_total, pending: u.fnb_pending + u.service_pending }))
        .sort((a, b) => b.total - a.total || a.unit_number.localeCompare(b.unit_number, 'fa', { numeric: true }))
      const sum = (f: (u: (typeof units)[number]) => number) => units.reduce((a, u) => a + f(u), 0)
      return {
        period,
        totals: { fnb: sum((u) => u.fnb_total), services: sum((u) => u.service_total), total: sum((u) => u.total), pending: sum((u) => u.pending), units: units.length },
        units,
        orders: orders.rows.slice(0, 200),
        services: services.rows,
      }
    })
  }
}
