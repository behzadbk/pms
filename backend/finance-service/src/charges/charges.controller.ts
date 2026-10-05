import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsIn, IsISO8601, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { PropertyClientService } from '../property-client/property-client.service'
import { EventsService } from '../events/events.service'
import { UNIT_ID_RE, assertUnitAccess } from '../common/unit-access'

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export class GenerateMonthlyDto {
  /** دوره‌ی میلادیِ شارژ به شکل YYYY-MM (نمایش فارسی‌اش را فرانت می‌سازد) */
  @Matches(PERIOD_RE, { message: 'دوره باید به شکل YYYY-MM باشد' }) period: string
  @Matches(UNIT_ID_RE, { message: 'شناسه‌ی فرمول نامعتبر است' }) formulaId: string
}

export class UpdateChargeDto {
  @IsOptional() @IsIn(['pending', 'paid']) status?: 'pending' | 'paid'
  @IsOptional() @IsString() @MaxLength(60) payMethod?: string
  @IsOptional() @IsISO8601() paidAt?: string
  @IsOptional() @IsString() @MaxLength(300) note?: string
  @IsOptional() @IsNumber() @Min(0) @Max(1e12) baseAmount?: number
}

export class ImportChargeRow {
  /** شماره‌ی واحد دقیقاً مثل ثبت‌شده در ساختمان */
  @IsString() @MaxLength(20) unit: string
  @Matches(PERIOD_RE, { message: 'دوره باید به شکل YYYY-MM باشد' }) period: string
  @IsNumber() @Min(0) @Max(1e12) base: number
  @IsOptional() @IsNumber() @Min(0) @Max(1e12) lateFee?: number
  @IsOptional() @IsISO8601() dueDate?: string
  @IsIn(['pending', 'paid', 'overdue']) status: 'pending' | 'paid' | 'overdue'
  @IsOptional() @IsISO8601() paidAt?: string
  @IsOptional() @IsString() @MaxLength(60) payMethod?: string
}

export class ImportChargesDto {
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ImportChargeRow) rows: ImportChargeRow[]
}

class ListQuery {
  @IsOptional() @Matches(PERIOD_RE) period?: string
  @IsOptional() @IsIn(['pending', 'paid', 'overdue']) status?: string
  @IsOptional() @Matches(UNIT_ID_RE) unitId?: string
}

export interface FormulaRow {
  calc_type: string
  base_amount: string
  amount_per_sqm: string
  amount_per_person: string
}

/** مبلغ شارژ یک واحد طبق فرمول — fixed | per_area | per_person | hybrid */
export function chargeAmount(f: FormulaRow, areaSqm: number, persons: number): number {
  const base = Number(f.base_amount) || 0
  const perSqm = Number(f.amount_per_sqm) || 0
  const perPerson = Number(f.amount_per_person) || 0
  switch (f.calc_type) {
    case 'fixed': return Math.round(base)
    case 'per_area': return Math.round(perSqm * areaSqm)
    case 'per_person': return Math.round(perPerson * persons)
    default: return Math.round(base + perSqm * areaSqm + perPerson * persons)
  }
}

const CHARGE_SELECT = `SELECT c.id, c.unit_id, u.unit_number AS unit_no, c.period, c.formula_id, c.base_amount, c.late_fee_amount,
        c.total_amount, c.due_date, c.status, c.paid_at, c.pay_method, c.note, c.source, c.created_at
   FROM finance.monthly_charges c LEFT JOIN property.units u ON u.id = c.unit_id`

@Controller()
export class ChargesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly propertyClient: PropertyClientService,
    private readonly events: EventsService,
  ) {}

  @Roles('resident', 'admin', 'accountant')
  @Get('units/:unitId/charges')
  async listForUnit(@Param('unitId') unitId: string, @CurrentUser() user: JwtPayload) {
    if (!UNIT_ID_RE.test(unitId)) throw new BadRequestException('شناسه‌ی واحد نامعتبر است')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      await assertUnitAccess(client, user, unitId)
      await client.query(`SELECT finance.sweep_overdue($1)`, [user.tenant_id])
      const res = await client.query(`${CHARGE_SELECT} WHERE c.unit_id = $1 ORDER BY c.period DESC`, [unitId])
      return res.rows
    })
  }

  /** همه‌ی شارژهای ساختمان (با فیلتر دوره/وضعیت/واحد) — پنل حسابداری و گزارش مالی مدیر */
  @Roles('admin', 'accountant')
  @Get('charges')
  async list(@Query() q: ListQuery, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      await client.query(`SELECT finance.sweep_overdue($1)`, [user.tenant_id])
      const res = await client.query(
        `${CHARGE_SELECT}
          WHERE ($1::text IS NULL OR c.period = $1) AND ($2::text IS NULL OR c.status = $2) AND ($3::uuid IS NULL OR c.unit_id = $3)
          ORDER BY c.period DESC, u.unit_number LIMIT 5000`,
        [q.period ?? null, q.status ?? null, q.unitId ?? null],
      )
      return res.rows
    })
  }

  /**
   * صدور شارژ ماهانه — لیست واحدها از property-svc (gRPC) و تعداد ساکنان فعال از عضویت‌ها گرفته می‌شود،
   * مبلغ هر واحد طبق فرمول انتخابی محاسبه و سررسید طبق «روز سررسید» تنظیمات ساختمان تعیین می‌شود.
   */
  // صدور شارژ مسئولیت حسابداری است؛ مدیر ساختمان فقط گزارش را می‌بیند
  @Roles('accountant')
  @Post('charges/generate-monthly')
  async generateMonthly(@Body() body: GenerateMonthlyDto, @CurrentUser() user: JwtPayload) {
    const tenantId = user.tenant_id!
    const units = await this.propertyClient.listUnitsByTenant(tenantId)
    const out = await this.db.withTenant(tenantId, async (client) => {
      const formula = (await client.query<FormulaRow & { id: string; is_active: boolean }>(`SELECT * FROM finance.charge_formulas WHERE id = $1`, [body.formulaId])).rows[0]
      if (!formula) throw new NotFoundException('فرمول شارژ یافت نشد')
      if (!formula.is_active) throw new BadRequestException('این فرمول غیرفعال است')
      const dueDay = Number((await client.query<{ due_day: number }>(`SELECT due_day FROM finance.settings`)).rows[0]?.due_day ?? 10)
      const dueDate = `${body.period}-${String(dueDay).padStart(2, '0')}`
      const persons = new Map<string, number>(
        (await client.query<{ unit_id: string; n: number }>(
          `SELECT unit_id, count(*)::int AS n FROM residency.memberships WHERE status = 'active' AND role NOT IN ('owner_absent', 'caregiver') GROUP BY unit_id`,
        )).rows.map((r) => [r.unit_id, r.n]),
      )
      let created = 0
      for (const unit of units) {
        const amount = chargeAmount(formula, unit.areaSqm ?? 0, persons.get(unit.id) ?? 0)
        const res = await client.query(
          `INSERT INTO finance.monthly_charges (tenant_id, unit_id, period, formula_id, base_amount, total_amount, due_date, status, source)
           VALUES ($1, $2, $3, $4, $5, $5, $6::date, 'pending', 'issued')
           ON CONFLICT (unit_id, period) DO NOTHING RETURNING id`,
          [tenantId, unit.id, body.period, body.formulaId, amount, dueDate],
        )
        if (res.rowCount) created++
      }
      await client.query(`SELECT finance.sweep_overdue($1)`, [tenantId])
      return { generatedCount: created, period: body.period, dueDate }
    })
    this.events.publish('charge.generated', { period: out.period, count: out.generatedCount, dueDate: out.dueDate }, tenantId)
    return out
  }

  /** ثبت دستی وصول شارژ (نقدی/کارت‌به‌کارت)، اصلاح مبلغ پایه یا یادداشت */
  @Roles('accountant')
  @Patch('charges/:id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChargeDto, @CurrentUser() user: JwtPayload) {
    const tenantId = user.tenant_id!
    const out = await this.db.withTenant(tenantId, async (client) => {
      const cur = (await client.query<{ id: string; status: string; base_amount: string; late_fee_amount: string; total_amount: string }>(`SELECT id, status, base_amount, late_fee_amount, total_amount FROM finance.monthly_charges WHERE id = $1 FOR UPDATE`, [id])).rows[0]
      if (!cur) throw new NotFoundException('شارژ یافت نشد')
      if (dto.baseAmount !== undefined) {
        await client.query(`UPDATE finance.monthly_charges SET base_amount = $2, total_amount = $2 + late_fee_amount WHERE id = $1`, [id, dto.baseAmount])
      }
      if (dto.note !== undefined) await client.query(`UPDATE finance.monthly_charges SET note = $2 WHERE id = $1`, [id, dto.note || null])
      if (dto.status === 'paid' && cur.status !== 'paid') {
        const total = (await client.query<{ total_amount: string }>(`SELECT total_amount FROM finance.monthly_charges WHERE id = $1`, [id])).rows[0].total_amount
        await client.query(`UPDATE finance.monthly_charges SET status = 'paid', paid_at = COALESCE($2::timestamptz, now()), pay_method = $3 WHERE id = $1`, [id, dto.paidAt ?? null, dto.payMethod ?? 'نقدی/دستی'])
        await client.query(
          `INSERT INTO finance.payments (tenant_id, monthly_charge_id, amount, gateway, status, idempotency_key, paid_at)
           VALUES ($1, $2, $3, 'manual', 'success', $4, COALESCE($5::timestamptz, now())) ON CONFLICT (idempotency_key) DO NOTHING`,
          [tenantId, id, total, `manual:${id}`, dto.paidAt ?? null],
        )
        this.events.publish('payment.succeeded', { chargeId: id, manual: true }, tenantId)
      } else if (dto.status === 'pending' && cur.status === 'paid') {
        await client.query(`UPDATE finance.monthly_charges SET status = 'pending', paid_at = NULL, pay_method = NULL WHERE id = $1`, [id])
        await client.query(`DELETE FROM finance.payments WHERE monthly_charge_id = $1 AND gateway = 'manual'`, [id])
      }
      await client.query(`SELECT finance.sweep_overdue($1)`, [tenantId])
      return (await client.query(`${CHARGE_SELECT} WHERE c.id = $1`, [id])).rows[0]
    })
    return out
  }

  /** ورود شارژها از فایل حسابداری: ردیف همان (واحد، دوره) جایگزین می‌شود؛ واحد نامعتبر رد و گزارش می‌شود */
  @Roles('accountant')
  @Post('charges/import')
  async importRows(@Body() dto: ImportChargesDto, @CurrentUser() user: JwtPayload) {
    const tenantId = user.tenant_id!
    const out = await this.db.withTenant(tenantId, async (client) => {
      const units = new Map((await client.query<{ id: string; unit_number: string }>(`SELECT id, unit_number FROM property.units`)).rows.map((u) => [u.unit_number, u.id]))
      const dueDay = Number((await client.query<{ due_day: number }>(`SELECT due_day FROM finance.settings`)).rows[0]?.due_day ?? 10)
      let imported = 0
      const skipped: { index: number; unit: string; reason: string }[] = []
      for (const [i, r] of dto.rows.entries()) {
        const unitId = units.get(String(r.unit).trim())
        if (!unitId) { skipped.push({ index: i, unit: r.unit, reason: 'واحد با این شماره در ساختمان نیست' }); continue }
        const due = r.dueDate ? r.dueDate.slice(0, 10) : `${r.period}-${String(dueDay).padStart(2, '0')}`
        const late = r.lateFee ?? 0
        await client.query(
          `INSERT INTO finance.monthly_charges (tenant_id, unit_id, period, base_amount, late_fee_amount, total_amount, due_date, status, paid_at, pay_method, source)
           VALUES ($1, $2, $3, $4, $5, $4 + $5, $6::date, $7, $8::timestamptz, $9, 'import')
           ON CONFLICT (unit_id, period) DO UPDATE SET base_amount = EXCLUDED.base_amount, late_fee_amount = EXCLUDED.late_fee_amount,
             total_amount = EXCLUDED.total_amount, due_date = EXCLUDED.due_date, status = EXCLUDED.status,
             paid_at = EXCLUDED.paid_at, pay_method = EXCLUDED.pay_method, source = 'import'`,
          [tenantId, unitId, r.period, r.base, late, due, r.status, r.status === 'paid' ? (r.paidAt ?? new Date().toISOString()) : null, r.status === 'paid' ? (r.payMethod ?? 'فایل حسابداری') : null],
        )
        imported++
      }
      await client.query(`SELECT finance.sweep_overdue($1)`, [tenantId])
      return { imported, skipped }
    })
    this.events.publish('charge.imported', { count: out.imported }, tenantId)
    return out
  }

  /** اجرای دستی جارو دیرکرد (job خودکار هم هر چند ساعت اجرا می‌شود) */
  @Roles('admin', 'accountant')
  @Post('charges/sweep-overdue')
  sweep(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client: PoolClient) => ({
      updated: Number((await client.query<{ n: number }>(`SELECT finance.sweep_overdue($1) AS n`, [user.tenant_id])).rows[0].n),
    }))
  }
}
