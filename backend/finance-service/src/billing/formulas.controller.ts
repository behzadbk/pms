import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { bad, bool, num, obj, str } from '../common/validate'
import { PERIOD_RE } from '../common/jalali'

const CALC_TYPES = ['fixed', 'per_area', 'per_person', 'hybrid']
const COLS = `id, name, calc_type, base_amount, amount_per_sqm, per_resident_amount, fixed_items, round_to, effective_from, is_active, created_at, updated_at`

/** تعریف فرمول شارژ هر ساختمان — مدیر و حسابدار */
@Controller('formulas')
@Roles('admin', 'accountant')
export class FormulasController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `SELECT ${COLS.split(', ').map((c) => 'f.' + c).join(', ')},
                (SELECT count(*) FROM finance.monthly_charges c WHERE c.formula_id = f.id) AS charges_count
           FROM finance.charge_formulas f ORDER BY f.is_active DESC, f.effective_from DESC NULLS LAST, f.created_at DESC`,
      )
      return r.rows
    })
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const v = parse(body)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `INSERT INTO finance.charge_formulas (tenant_id, name, calc_type, base_amount, amount_per_sqm, per_resident_amount, fixed_items, round_to, effective_from, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING ${COLS}`,
        [user.tenant_id, v.name, v.calc_type, v.base_amount, v.amount_per_sqm, v.per_resident_amount, JSON.stringify(v.fixed_items), v.round_to, v.effective_from, v.is_active],
      )
      return r.rows[0]
    })
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const v = parse(body)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `UPDATE finance.charge_formulas SET name=$2, calc_type=$3, base_amount=$4, amount_per_sqm=$5, per_resident_amount=$6,
                fixed_items=$7::jsonb, round_to=$8, effective_from=$9, is_active=$10, updated_at=now()
          WHERE id=$1 RETURNING ${COLS}`,
        [id, v.name, v.calc_type, v.base_amount, v.amount_per_sqm, v.per_resident_amount, JSON.stringify(v.fixed_items), v.round_to, v.effective_from, v.is_active],
      )
      if (!r.rows[0]) throw new NotFoundException('فرمول یافت نشد')
      return r.rows[0]
    })
  }

  /** حذف فقط وقتی هیچ شارژی با آن صادر نشده؛ وگرنه باید غیرفعال شود (تاریخچه محفوظ می‌ماند) */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const used = await client.query(`SELECT count(*) AS n FROM finance.monthly_charges WHERE formula_id = $1`, [id])
      if (used.rows[0].n > 0) throw new ConflictException('با این فرمول شارژ صادر شده است؛ به‌جای حذف، آن را غیرفعال کنید')
      const r = await client.query(`DELETE FROM finance.charge_formulas WHERE id = $1 RETURNING id`, [id])
      if (!r.rows[0]) throw new NotFoundException('فرمول یافت نشد')
      return { ok: true }
    })
  }
}

function parse(body: unknown) {
  const b = obj(body)
  const calc_type = str(b.calc_type, 'نوع فرمول') ?? 'hybrid'
  if (!CALC_TYPES.includes(calc_type)) bad('نوع فرمول نامعتبر است')
  const rawItems = b.fixed_items ?? []
  if (!Array.isArray(rawItems) || rawItems.length > 20) bad('اقلام ثابت نامعتبر است (حداکثر ۲۰ ردیف)')
  const fixed_items = (rawItems as unknown[]).map((i) => {
    const o = obj(i)
    return { title: str(o.title, 'عنوان قلم ثابت', { required: true, max: 80 })!, amount: num(o.amount, 'مبلغ قلم ثابت', { required: true, min: 0, max: 1e12 })! }
  })
  const eff = str(b.effective_from, 'اعمال از دوره') || null
  if (eff && !PERIOD_RE.test(eff)) bad('دوره‌ی «اعمال از» باید به شکل YYYY-MM شمسی باشد (مثلاً 1405-07)')
  const v = {
    name: str(b.name, 'نام فرمول', { required: true, max: 80 })!,
    calc_type,
    base_amount: num(b.base_amount, 'مبلغ پایه', { min: 0, max: 1e12 }) ?? 0,
    amount_per_sqm: num(b.amount_per_sqm, 'مبلغ هر متر', { min: 0, max: 1e10 }) ?? 0,
    per_resident_amount: num(b.per_resident_amount, 'مبلغ هر نفر', { min: 0, max: 1e10 }) ?? 0,
    fixed_items,
    round_to: num(b.round_to, 'گرد کردن', { min: 1, max: 1_000_000, int: true }) ?? 1,
    effective_from: eff,
    is_active: bool(b.is_active, 'فعال بودن') ?? true,
  }
  if (v.base_amount + v.amount_per_sqm + v.per_resident_amount + fixed_items.reduce((a, i) => a + i.amount, 0) <= 0) {
    bad('حداقل یکی از ضرایب فرمول باید بزرگ‌تر از صفر باشد')
  }
  return v
}
