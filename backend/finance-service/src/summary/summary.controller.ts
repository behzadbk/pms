import { Controller, Get, Query } from '@nestjs/common'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

class LedgerQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit?: number
}

const TEHRAN = `'Asia/Tehran'`

/**
 * خلاصه‌ی مالی ساختمان — همه‌ی عددها از دیتابیس محاسبه می‌شوند (ساختمان تازه: همه صفر).
 *   موجودی صندوق = موجودی اولیه + شارژهای وصول‌شده − فاکتورهای پرداخت‌شده
 */
@Controller()
export class SummaryController {
  constructor(private readonly db: DatabaseService) {}

  @Roles('admin', 'accountant')
  @Get('summary')
  summary(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      await c.query(`SELECT finance.sweep_overdue($1)`, [user.tenant_id])
      const num = (v: unknown) => Number(v ?? 0)
      const s = (await c.query<Record<string, string>>(
        `SELECT
           COALESCE((SELECT opening_balance FROM finance.settings), 0) AS opening,
           COALESCE((SELECT sum(total_amount) FROM finance.monthly_charges WHERE status = 'paid'), 0) AS income_all,
           COALESCE((SELECT sum(amount) FROM finance.invoices WHERE status = 'paid'), 0) AS expense_all,
           COALESCE((SELECT sum(total_amount) FROM finance.monthly_charges WHERE status = 'paid'
                       AND date_trunc('month', paid_at AT TIME ZONE ${TEHRAN}) = date_trunc('month', now() AT TIME ZONE ${TEHRAN})), 0) AS month_income,
           COALESCE((SELECT sum(amount) FROM finance.invoices WHERE status = 'paid'
                       AND date_trunc('month', COALESCE(paid_at, issued_at::timestamptz) AT TIME ZONE ${TEHRAN}) = date_trunc('month', now() AT TIME ZONE ${TEHRAN})), 0) AS month_expense,
           COALESCE((SELECT sum(total_amount) FROM finance.monthly_charges WHERE status = 'overdue'), 0) AS overdue_total,
           (SELECT count(DISTINCT unit_id) FROM finance.monthly_charges WHERE status = 'overdue') AS overdue_units,
           COALESCE((SELECT sum(amount) FROM finance.invoices WHERE status = 'pending'), 0) AS unpaid_invoices_total,
           (SELECT count(*) FROM finance.invoices WHERE status = 'pending') AS unpaid_invoices_count,
           (SELECT max(period) FROM finance.monthly_charges) AS current_period`,
      )).rows[0]
      const cur = s.current_period
      const rate = cur
        ? (await c.query<{ total: string; paid: string }>(
            `SELECT COALESCE(sum(total_amount), 0) AS total, COALESCE(sum(total_amount) FILTER (WHERE status = 'paid'), 0) AS paid FROM finance.monthly_charges WHERE period = $1`, [cur])).rows[0]
        : { total: '0', paid: '0' }
      const trend = (await c.query<{ ym: string; income: string; expense: string }>(
        `WITH months AS (
           SELECT to_char(date_trunc('month', now() AT TIME ZONE ${TEHRAN}) - (g || ' month')::interval, 'YYYY-MM') AS ym FROM generate_series(5, 0, -1) g)
         SELECT m.ym,
           COALESCE((SELECT sum(total_amount) FROM finance.monthly_charges c WHERE c.status = 'paid' AND to_char(c.paid_at AT TIME ZONE ${TEHRAN}, 'YYYY-MM') = m.ym), 0) AS income,
           COALESCE((SELECT sum(amount) FROM finance.invoices i WHERE i.status = 'paid' AND to_char(COALESCE(i.paid_at, i.issued_at::timestamptz) AT TIME ZONE ${TEHRAN}, 'YYYY-MM') = m.ym), 0) AS expense
         FROM months m ORDER BY m.ym`)).rows
      const breakdown = (await c.query<{ category: string; amount: string }>(
        `SELECT category, sum(amount) AS amount FROM finance.invoices GROUP BY category ORDER BY sum(amount) DESC`)).rows
      return {
        openingBalance: num(s.opening),
        fundBalance: num(s.opening) + num(s.income_all) - num(s.expense_all),
        monthIncome: num(s.month_income),
        monthExpense: num(s.month_expense),
        overdueTotal: num(s.overdue_total),
        overdueUnits: num(s.overdue_units),
        unpaidInvoicesTotal: num(s.unpaid_invoices_total),
        unpaidInvoicesCount: num(s.unpaid_invoices_count),
        currentPeriod: cur ?? null,
        collectionRate: num(rate.total) ? Math.round((num(rate.paid) / num(rate.total)) * 100) : 0,
        monthlyTrend: trend.map((t) => ({ period: t.ym, income: num(t.income), expense: num(t.expense) })),
        expenseBreakdown: breakdown.map((b) => ({ category: b.category, amount: num(b.amount) })),
      }
    })
  }

  /** دفتر صندوق: شارژهای وصول‌شده (درآمد) و فاکتورهای پرداخت‌شده (هزینه) به ترتیب تاریخ */
  @Roles('admin', 'accountant')
  @Get('ledger')
  ledger(@CurrentUser() user: JwtPayload, @Query() q: LedgerQuery) {
    return this.db.withTenant(user.tenant_id!, async (c) =>
      (await c.query(
        `SELECT * FROM (
           SELECT 'c-' || c.id AS id, 'income' AS type, 'واریز شارژ ' || COALESCE(u.unit_number, '') || ' — ' || c.period AS description,
                  c.total_amount AS amount, c.paid_at AS date, COALESCE(c.pay_method, '—') AS method, NULL::uuid AS invoice_id
             FROM finance.monthly_charges c LEFT JOIN property.units u ON u.id = c.unit_id WHERE c.status = 'paid'
           UNION ALL
           SELECT 'i-' || i.id, 'expense', i.description || ' (' || i.vendor || ')', i.amount,
                  COALESCE(i.paid_at, i.issued_at::timestamptz), COALESCE(i.method, '—'), i.id
             FROM finance.invoices i WHERE i.status = 'paid'
         ) t ORDER BY date DESC NULLS LAST LIMIT $1`, [q.limit ?? 200])).rows,
    )
  }
}
