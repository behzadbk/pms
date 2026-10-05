import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { EventsService } from '../events/events.service'
import { CreateFormulaDto, UpdateFormulaDto } from './dto/formula.dto'

const COLS = `id, name, calc_type AS "calcType", base_amount::float AS "baseAmount",
  amount_per_sqm::float AS "amountPerSqm", is_active AS "isActive", created_at AS "createdAt"`

/** تعریف فرمول شارژ هر ساختمان (بدون نیاز به SQL دستی). مدیر و حسابدار هر دو می‌توانند. */
@Controller('charge-formulas')
export class FormulasController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  @Roles('admin', 'accountant')
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(`SELECT ${COLS} FROM finance.charge_formulas ORDER BY is_active DESC, created_at DESC`)
      return r.rows
    })
  }

  @Roles('admin', 'accountant')
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateFormulaDto) {
    if (dto.baseAmount === 0 && dto.amountPerSqm === 0) {
      throw new BadRequestException('حداقل یکی از «مبلغ پایه» یا «مبلغ هر متر» باید بیشتر از صفر باشد')
    }
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `INSERT INTO finance.charge_formulas (tenant_id, name, calc_type, base_amount, amount_per_sqm)
         VALUES ($1, $2, 'hybrid', $3, $4) RETURNING ${COLS}`,
        [user.tenant_id, dto.name.trim(), dto.baseAmount, dto.amountPerSqm],
      )
      this.events.publish('charge_formula.created', { id: r.rows[0].id, by: user.sub }, user.tenant_id!)
      return r.rows[0]
    })
  }

  /** فرمولی که قبلاً شارژ از آن صادر شده تغییر مبلغ نمی‌کند (شارژهای صادرشده دست‌نخورده می‌مانند)؛ فقط فعال/غیرفعال و نام. */
  @Roles('admin', 'accountant')
  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFormulaDto) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const used = await c.query(`SELECT 1 FROM finance.monthly_charges WHERE formula_id = $1 LIMIT 1`, [id])
      if (used.rowCount && (dto.baseAmount !== undefined || dto.amountPerSqm !== undefined)) {
        throw new BadRequestException('از این فرمول شارژ صادر شده؛ برای تغییر مبلغ، فرمول جدید بسازید')
      }
      const sets: string[] = []
      const vals: unknown[] = []
      const set = (col: string, v: unknown) => {
        vals.push(v)
        sets.push(`${col} = $${vals.length}`)
      }
      if (dto.name !== undefined) set('name', dto.name.trim())
      if (dto.baseAmount !== undefined) set('base_amount', dto.baseAmount)
      if (dto.amountPerSqm !== undefined) set('amount_per_sqm', dto.amountPerSqm)
      if (dto.isActive !== undefined) set('is_active', dto.isActive)
      if (!sets.length) throw new BadRequestException('هیچ فیلدی برای ویرایش ارسال نشده')
      vals.push(id)
      const r = await c.query(`UPDATE finance.charge_formulas SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING ${COLS}`, vals)
      if (!r.rows[0]) throw new NotFoundException('فرمول یافت نشد')
      return r.rows[0]
    })
  }
}
