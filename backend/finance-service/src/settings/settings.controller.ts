import { Body, Controller, ForbiddenException, Get, Put } from '@nestjs/common'
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

export class UpdateSettingsDto {
  /** none = بدون جریمه · fixed = مبلغ ثابت · percent_monthly = درصد به‌ازای هر ۳۰ روز · percent_daily = درصد روزانه */
  @IsOptional() @IsIn(['none', 'fixed', 'percent_monthly', 'percent_daily'], { message: 'نوع جریمه نامعتبر است' }) lateFeeMode?: string
  @IsOptional() @IsNumber() @Min(0) @Max(1e10) lateFeeValue?: number
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) @Max(1000) lateFeeCapPercent?: number | null
  @IsOptional() @IsInt() @Min(0) @Max(365) graceDays?: number
  @IsOptional() @IsInt() @Min(1) @Max(28) dueDay?: number
  @IsOptional() @IsNumber() @Min(0) @Max(1e13) openingBalance?: number
}

const toDto = (r: Record<string, unknown> | undefined) => ({
  lateFeeMode: (r?.late_fee_mode as string) ?? 'none',
  lateFeeValue: Number(r?.late_fee_value ?? 0),
  lateFeeCapPercent: r?.late_fee_cap_percent == null ? null : Number(r.late_fee_cap_percent),
  graceDays: Number(r?.grace_days ?? 0),
  dueDay: Number(r?.due_day ?? 10),
  openingBalance: Number(r?.opening_balance ?? 0),
  updatedAt: (r?.updated_at as string) ?? null,
})

/**
 * تنظیمات مالی ساختمان. نرخ/قاعده‌ی جریمه‌ی دیرکرد را مدیر ساختمان تعیین می‌کند (پیش‌فرض: بدون جریمه)؛
 * موجودی اولیه‌ی صندوق و روز سررسید را حسابدار هم می‌تواند ثبت کند.
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly db: DatabaseService) {}

  @Roles('admin', 'accountant')
  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (c) => toDto((await c.query(`SELECT * FROM finance.settings`)).rows[0]))
  }

  @Roles('admin', 'accountant')
  @Put()
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateSettingsDto) {
    const lateKeys = ['lateFeeMode', 'lateFeeValue', 'lateFeeCapPercent', 'graceDays'] as const
    if (user.role !== 'admin' && lateKeys.some((k) => dto[k] !== undefined)) {
      throw new ForbiddenException('نرخ و قاعده‌ی جریمه‌ی دیرکرد را فقط مدیر ساختمان تعیین می‌کند')
    }
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `INSERT INTO finance.settings (tenant_id, late_fee_mode, late_fee_value, late_fee_cap_percent, grace_days, due_day, opening_balance, updated_by)
         VALUES ($1, COALESCE($2, 'none'), COALESCE($3, 0), $4, COALESCE($5, 0), COALESCE($6, 10), COALESCE($7, 0), $8)
         ON CONFLICT (tenant_id) DO UPDATE SET
           late_fee_mode = COALESCE($2, finance.settings.late_fee_mode),
           late_fee_value = COALESCE($3, finance.settings.late_fee_value),
           late_fee_cap_percent = CASE WHEN $9::boolean THEN $4 ELSE finance.settings.late_fee_cap_percent END,
           grace_days = COALESCE($5, finance.settings.grace_days),
           due_day = COALESCE($6, finance.settings.due_day),
           opening_balance = COALESCE($7, finance.settings.opening_balance),
           updated_at = now(), updated_by = $8
         RETURNING *`,
        [user.tenant_id, dto.lateFeeMode ?? null, dto.lateFeeValue ?? null, dto.lateFeeCapPercent ?? null, dto.graceDays ?? null, dto.dueDay ?? null, dto.openingBalance ?? null, user.sub, dto.lateFeeCapPercent !== undefined],
      )
      // تغییر قاعده‌ی جریمه فوراً روی شارژهای دیرکردی اعمال می‌شود
      await c.query(`SELECT finance.sweep_overdue($1)`, [user.tenant_id])
      return toDto(r.rows[0])
    })
  }
}
