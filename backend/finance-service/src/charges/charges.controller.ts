import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { PropertyClientService } from '../property-client/property-client.service'
import { EventsService } from '../events/events.service'
import { UNIT_ID_RE, assertUnitAccess } from '../common/unit-access'

interface GenerateMonthlyBody {
  period: string // 'YYYY-MM'
  formulaId: string
}

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
      const res = await client.query(
        `SELECT * FROM finance.monthly_charges WHERE unit_id = $1 ORDER BY period DESC`,
        [unitId],
      )
      return res.rows
    })
  }

  /**
   * پیاده‌سازی واقعی سناریوی «صدور شارژ ماهانه» (docs/SPEC.md بخش ۴.۱ اول)
   * — لیست واحدها را از property-svc از طریق gRPC می‌گیرد (نه از دیتابیس محلی)
   * و بر اساس فرمول محاسبه، برای هر واحد یک monthly_charges می‌سازد.
   */
  // صدور شارژ مسئولیت حسابداری است؛ مدیر ساختمان فقط گزارش را می‌بیند
  @Roles('accountant')
  @Post('charges/generate-monthly')
  async generateMonthly(@Body() body: GenerateMonthlyBody, @CurrentUser() user: JwtPayload) {
    const tenantId = user.tenant_id!
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body?.period ?? '')) {
      throw new BadRequestException('دوره باید به شکل YYYY-MM باشد')
    }
    if (!UNIT_ID_RE.test(body?.formulaId ?? '')) throw new BadRequestException('شناسه‌ی فرمول نامعتبر است')

    return this.db.withTenant(tenantId, async (client) => {
      const formulaRes = await client.query(`SELECT * FROM finance.charge_formulas WHERE id = $1`, [body.formulaId])
      const formula = formulaRes.rows[0]
      if (!formula) throw new NotFoundException('فرمول شارژ یافت نشد')
      if (formula.is_active === false) throw new BadRequestException('این فرمول غیرفعال است')

      const units = await this.propertyClient.listUnitsByTenant(tenantId)

      const created = []
      for (const unit of units) {
        const amount =
          Number(formula.base_amount) + Number(formula.amount_per_sqm) * (unit.areaSqm ?? 0)

        const res = await client.query(
          `INSERT INTO finance.monthly_charges (tenant_id, unit_id, period, formula_id, base_amount, total_amount, due_date, status)
           VALUES ($1, $2, $3::date, $4, $5, $5, (date_trunc('month', $3::date) + interval '9 days')::date, 'pending')
           ON CONFLICT (unit_id, period) DO NOTHING
           RETURNING *`,
          [tenantId, unit.id, `${body.period}-01`, body.formulaId, amount],
        )
        if (res.rows[0]) created.push(res.rows[0])
      }

      this.events.publish('charge.generated', { period: body.period, count: created.length }, tenantId)
      return { generatedCount: created.length, period: body.period }
    })
  }
}
