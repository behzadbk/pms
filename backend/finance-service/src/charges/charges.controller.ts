import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { EventsService } from '../events/events.service'
import { ChargeEngine } from '../billing/charge-engine.service'
import { OverdueService } from '../billing/overdue.service'
import { PaymentsService } from '../payments/payments.service'
import { bad, bool, isoDate, num, obj, str } from '../common/validate'
import { parsePeriod } from '../common/jalali'

const METHODS = ['cash', 'card_to_card', 'bank_transfer', 'cheque']

const CHARGE_SELECT = `
  SELECT c.id, c.unit_id, c.period, c.formula_id, c.base_amount, c.late_fee_amount, c.total_amount, c.due_date, c.status,
         c.paid_at, c.pay_method, c.late_fee_waived, c.note, c.breakdown, c.created_at,
         u.unit_number, u.floor,
         (SELECT ru.name FROM residency.memberships m JOIN residency.users ru ON ru.id = m.user_id
           WHERE m.unit_id = c.unit_id AND m.status = 'active' AND (m.pays_charge OR m.role = 'head')
           ORDER BY m.pays_charge DESC, (m.role = 'head') DESC LIMIT 1) AS payer_name
    FROM finance.monthly_charges c JOIN property.units u ON u.id = c.unit_id`

/** شارژ و مطالبات — مدیر و حسابدار (صدور شارژ در UI هر دو نقش یکسان است) */
@Controller()
export class ChargesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly engine: ChargeEngine,
    private readonly overdue: OverdueService,
    private readonly payments: PaymentsService,
    private readonly events: EventsService,
  ) {}

  @Roles('admin', 'accountant')
  @Get('charges')
  list(@Query('period') period: string | undefined, @Query('status') status: string | undefined, @Query('unitId') unitId: string | undefined, @CurrentUser() user: JwtPayload) {
    if (period && !parsePeriod(period)) bad('دوره نامعتبر است')
    if (status && !['pending', 'paid', 'overdue'].includes(status)) bad('وضعیت نامعتبر است')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `${CHARGE_SELECT}
          WHERE ($1::text IS NULL OR c.period = $1) AND ($2::text IS NULL OR c.status = $2) AND ($3::uuid IS NULL OR c.unit_id = $3)
          ORDER BY c.period DESC, u.floor NULLS LAST, u.unit_number LIMIT 1000`,
        [period ?? null, status ?? null, unitId ?? null],
      )
      return r.rows
    })
  }

  @Roles('admin', 'accountant')
  @Get('charges/periods')
  periods(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query<{ period: string }>(`SELECT DISTINCT period FROM finance.monthly_charges ORDER BY period DESC`)
      return r.rows.map((x) => x.period)
    })
  }

  @Roles('admin', 'accountant')
  @Get('units/:unitId/charges')
  listForUnit(@Param('unitId', ParseUUIDPipe) unitId: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => (await client.query(`${CHARGE_SELECT} WHERE c.unit_id = $1 ORDER BY c.period DESC`, [unitId])).rows)
  }

  /** پیش‌نمایش (dry-run) — هیچ چیزی ذخیره نمی‌شود */
  @Roles('admin', 'accountant')
  @Post('charges/preview')
  preview(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const b = parseIssue(body)
    return this.db.withTenant(user.tenant_id!, (client) => this.engine.plan(client, user.tenant_id!, b))
  }

  /** صدور شارژ ماهانه با فرمول فعال. idempotent برای (واحد، دوره). */
  @Roles('admin', 'accountant')
  @Post(['charges/generate', 'charges/generate-monthly'])
  async generate(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const b = parseIssue(body)
    const result = await this.db.withTenant(user.tenant_id!, (client) => this.engine.issue(client, user.tenant_id!, b))
    this.events.publish('charge.generated', { period: result.period, count: result.generatedCount }, user.tenant_id)
    return result
  }

  /** اجرای دستی بررسی معوقات/جریمه (همان کاری که job روزانه می‌کند) */
  @Roles('admin', 'accountant')
  @Post('charges/run-overdue')
  runOverdue(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (client) => this.overdue.runForTenant(client, user.tenant_id!))
  }

  /** اصلاح یک شارژ (مبلغ پایه/سررسید/معافیت از جریمه/یادداشت) — فقط تا قبل از پرداخت */
  @Roles('admin', 'accountant')
  @Patch('charges/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const b = obj(body)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const cur = (await client.query(`SELECT * FROM finance.monthly_charges WHERE id = $1 FOR UPDATE`, [id])).rows[0]
      if (!cur) throw new NotFoundException('شارژ یافت نشد')
      if (cur.status === 'paid') throw new ConflictException('شارژ پرداخت‌شده قابل ویرایش نیست')
      const base = num(b.base_amount, 'مبلغ پایه', { min: 0, max: 1e12 }) ?? cur.base_amount
      const waive = bool(b.waive_late_fee, 'معافیت از جریمه') ?? cur.late_fee_waived
      let fee = cur.late_fee_amount
      if (waive && !cur.late_fee_waived) fee = 0
      const due = isoDate(b.due_date, 'سررسید') ?? cur.due_date
      const note = b.note === undefined ? cur.note : (str(b.note, 'یادداشت', { max: 300 }) ?? null)
      await client.query(
        `UPDATE finance.monthly_charges SET base_amount = $2, late_fee_amount = $3, total_amount = $2 + $3, due_date = $4::date,
                late_fee_waived = $5, note = $6, updated_at = now() WHERE id = $1`,
        [id, base, fee, due, waive, note],
      )
      // اگر سررسید به آینده برگشت، وضعیت به «در انتظار» برگردد؛ job امروز دوباره معوق می‌کند اگر لازم باشد
      await client.query(`UPDATE finance.monthly_charges SET status = 'pending' WHERE id = $1 AND status = 'overdue' AND due_date >= (now() AT TIME ZONE 'Asia/Tehran')::date`, [id])
      return (await client.query(`${CHARGE_SELECT} WHERE c.id = $1`, [id])).rows[0]
    })
  }

  /** ابطال شارژ اشتباه — فقط اگر پرداخت موفقی نداشته باشد */
  @Roles('admin', 'accountant')
  @Delete('charges/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const cur = (await client.query(`SELECT status FROM finance.monthly_charges WHERE id = $1 FOR UPDATE`, [id])).rows[0]
      if (!cur) throw new NotFoundException('شارژ یافت نشد')
      const paid = await client.query(`SELECT 1 FROM finance.payments WHERE monthly_charge_id = $1 AND status = 'success'`, [id])
      if (cur.status === 'paid' || paid.rowCount) throw new ConflictException('شارژ پرداخت‌شده قابل ابطال نیست')
      await client.query(`DELETE FROM finance.payments WHERE monthly_charge_id = $1`, [id])
      await client.query(`DELETE FROM finance.monthly_charges WHERE id = $1`, [id])
      return { ok: true }
    })
  }

  /**
   * «ثبت پرداخت» دستی (نقدی / کارت‌به‌کارت / حواله / چک) — جایگزین درگاه وقتی درگاه آنلاین فعال نیست.
   * مبلغ همیشه کل شارژ (با جریمه‌ی فعلی) است؛ در گردش صندوق با روش و شماره پیگیری دیده می‌شود.
   */
  @Roles('accountant', 'admin')
  @Post('charges/:id/payments/manual')
  manualPayment(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const b = obj(body)
    const method = str(b.method, 'روش پرداخت', { required: true })!
    if (!METHODS.includes(method)) bad('روش پرداخت نامعتبر است')
    const reference = str(b.reference, 'شماره پیگیری', { max: 80 }) ?? null
    const note = str(b.note, 'یادداشت', { max: 300 }) ?? null
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const charge = (await client.query(`SELECT * FROM finance.monthly_charges WHERE id = $1 FOR UPDATE`, [id])).rows[0]
      if (!charge) throw new NotFoundException('شارژ یافت نشد')
      if (charge.status === 'paid') throw new ConflictException('این شارژ قبلاً پرداخت شده است')
      const ins = await client.query(
        `INSERT INTO finance.payments (tenant_id, monthly_charge_id, amount, gateway, status, method, reference, gateway_ref_id, recorded_by, note, idempotency_key)
         VALUES ($1, $2, $3, 'manual', 'initiated', $4, $5, $5, $6, $7, $8) RETURNING id`,
        [user.tenant_id, id, charge.total_amount, method, reference, user.sub, note, `manual-${id}`],
      )
      await this.payments.settle(client, user.tenant_id!, ins.rows[0].id, { method, refId: reference })
      return (await client.query(`${CHARGE_SELECT} WHERE c.id = $1`, [id])).rows[0]
    })
  }
}

function parseIssue(body: unknown): { period: string; formulaId?: string; dueDate?: string } {
  const b = obj(body)
  const period = str(b.period, 'دوره', { required: true })!
  if (!parsePeriod(period)) bad('دوره باید شمسی و به شکل YYYY-MM باشد (مثلاً 1405-07)')
  const formulaId = str(b.formulaId ?? b.formula_id, 'فرمول')
  if (formulaId && !/^[0-9a-f-]{36}$/i.test(formulaId)) bad('شناسه‌ی فرمول نامعتبر است')
  return { period, formulaId, dueDate: isoDate(b.dueDate ?? b.due_date, 'سررسید') }
}
