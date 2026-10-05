import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

const CALC_TYPES = ['fixed', 'per_area', 'per_person', 'hybrid']

export class CreateFormulaDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string
  @IsIn(CALC_TYPES, { message: 'نوع محاسبه نامعتبر است' }) calcType: string
  /** مبلغ پایه‌ی ثابت هر واحد (تومان) */
  @IsOptional() @IsNumber() @Min(0) @Max(1e12) baseAmount?: number
  /** مبلغ به‌ازای هر متر مربع */
  @IsOptional() @IsNumber() @Min(0) @Max(1e10) amountPerSqm?: number
  /** مبلغ به‌ازای هر نفر ساکن فعال */
  @IsOptional() @IsNumber() @Min(0) @Max(1e10) amountPerPerson?: number
  @IsOptional() @IsBoolean() isActive?: boolean
}

export class UpdateFormulaDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string
  @IsOptional() @IsIn(CALC_TYPES, { message: 'نوع محاسبه نامعتبر است' }) calcType?: string
  @IsOptional() @IsNumber() @Min(0) @Max(1e12) baseAmount?: number
  @IsOptional() @IsNumber() @Min(0) @Max(1e10) amountPerSqm?: number
  @IsOptional() @IsNumber() @Min(0) @Max(1e10) amountPerPerson?: number
  @IsOptional() @IsBoolean() isActive?: boolean
}

const COLS = `id, name, calc_type, base_amount, amount_per_sqm, amount_per_person, is_active, created_at, updated_at`

/**
 * فرمول‌های محاسبه‌ی شارژ ساختمان. بدون این API ساختمانِ تازه فرمولی نداشت و
 * POST /charges/generate-monthly (که formulaId می‌خواهد) قابل استفاده نبود.
 * ساخت/ویرایش با حسابدار؛ مدیر ساختمان فقط می‌بیند.
 */
@Controller('charge-formulas')
export class FormulasController {
  constructor(private readonly db: DatabaseService) {}

  @Roles('admin', 'accountant')
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (c) => (await c.query(`SELECT ${COLS} FROM finance.charge_formulas ORDER BY is_active DESC, created_at DESC`)).rows)
  }

  @Roles('accountant')
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateFormulaDto) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `INSERT INTO finance.charge_formulas (tenant_id, name, calc_type, base_amount, amount_per_sqm, amount_per_person, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLS}`,
        [user.tenant_id, dto.name.trim(), dto.calcType, dto.baseAmount ?? 0, dto.amountPerSqm ?? 0, dto.amountPerPerson ?? 0, dto.isActive ?? true],
      )
      return r.rows[0]
    })
  }

  @Roles('accountant')
  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFormulaDto) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `UPDATE finance.charge_formulas SET
           name = COALESCE($2, name), calc_type = COALESCE($3, calc_type),
           base_amount = COALESCE($4, base_amount), amount_per_sqm = COALESCE($5, amount_per_sqm),
           amount_per_person = COALESCE($6, amount_per_person), is_active = COALESCE($7, is_active), updated_at = now()
         WHERE id = $1 RETURNING ${COLS}`,
        [id, dto.name?.trim() ?? null, dto.calcType ?? null, dto.baseAmount ?? null, dto.amountPerSqm ?? null, dto.amountPerPerson ?? null, dto.isActive ?? null],
      )
      if (!r.rows[0]) throw new NotFoundException('فرمول یافت نشد')
      return r.rows[0]
    })
  }

  /** فرمولی که شارژی با آن صادر شده حذف نمی‌شود، غیرفعال می‌شود (سابقه‌ی شارژها می‌ماند) */
  @Roles('accountant')
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const used = await c.query(`SELECT 1 FROM finance.monthly_charges WHERE formula_id = $1 LIMIT 1`, [id])
      if (used.rowCount) {
        const r = await c.query(`UPDATE finance.charge_formulas SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id`, [id])
        if (!r.rowCount) throw new NotFoundException('فرمول یافت نشد')
        return { ok: true, deactivated: true }
      }
      const r = await c.query(`DELETE FROM finance.charge_formulas WHERE id = $1 RETURNING id`, [id])
      if (!r.rowCount) throw new NotFoundException('فرمول یافت نشد')
      return { ok: true, deactivated: false }
    })
  }
}
