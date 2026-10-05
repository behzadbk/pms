import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsIn, IsISO8601, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { EventsService } from '../events/events.service'

export class InvoiceItemDto {
  @IsString() @MaxLength(120) title: string
  @IsNumber() @Min(0) @Max(1e6) qty: number
  @IsNumber() @Min(0) @Max(1e12) unitPrice: number
}

export class CreateInvoiceDto {
  @IsOptional() @IsString() @MaxLength(40) number?: string
  @IsString() @MinLength(1) @MaxLength(120) vendor: string
  @IsString() @MinLength(1) @MaxLength(80) category: string
  @IsOptional() @IsString() @MaxLength(300) description?: string
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InvoiceItemDto) items?: InvoiceItemDto[]
  @IsNumber() @Min(0) @Max(1e13) amount: number
  @IsISO8601() issuedAt: string
  @IsOptional() @IsIn(['paid', 'pending']) status?: 'paid' | 'pending'
  @IsOptional() @IsString() @MaxLength(60) method?: string
  @IsOptional() @IsString() @MaxLength(200) attachmentName?: string
  @IsOptional() @IsISO8601() paidAt?: string
}

export class UpdateInvoiceDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) vendor?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) category?: string
  @IsOptional() @IsString() @MaxLength(300) description?: string
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InvoiceItemDto) items?: InvoiceItemDto[]
  @IsOptional() @IsNumber() @Min(0) @Max(1e13) amount?: number
  @IsOptional() @IsISO8601() issuedAt?: string
  @IsOptional() @IsIn(['paid', 'pending']) status?: 'paid' | 'pending'
  @IsOptional() @IsString() @MaxLength(60) method?: string
  @IsOptional() @IsString() @MaxLength(200) attachmentName?: string
  @IsOptional() @IsISO8601() paidAt?: string
}

export class ImportInvoicesDto {
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => CreateInvoiceDto) rows: CreateInvoiceDto[]
}

class ListQuery {
  @IsOptional() @IsIn(['paid', 'pending']) status?: string
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2000) limit?: number
}

const COLS = `i.id, i.number, i.vendor, i.category, i.description, i.items, i.amount, i.issued_at, i.status, i.method,
  i.attachment_name, i.paid_at, i.registered_by, i.created_at, u.full_name AS registered_by_name`
const FROM = `finance.invoices i LEFT JOIN identity.users u ON u.id = i.registered_by`

const genNumber = () => `F-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`

/**
 * فاکتور و هزینه‌های ساختمان — ثبت با حسابدار، مشاهده برای مدیر ساختمان.
 * پیش‌تر فقط در localStorage مرورگرِ حسابدار نگه‌داری می‌شد و برای مدیر دیده نمی‌شد.
 */
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  @Roles('admin', 'accountant')
  @Get()
  list(@CurrentUser() user: JwtPayload, @Query() q: ListQuery) {
    return this.db.withTenant(user.tenant_id!, async (c) =>
      (await c.query(
        `SELECT ${COLS} FROM ${FROM}
          WHERE ($1::text IS NULL OR i.status = $1) AND ($2::text IS NULL OR to_char(i.issued_at, 'YYYY-MM') = $2)
          ORDER BY i.issued_at DESC, i.created_at DESC LIMIT $3`,
        [q.status ?? null, q.month ?? null, q.limit ?? 500],
      )).rows,
    )
  }

  @Roles('accountant')
  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateInvoiceDto) {
    const row = await this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO finance.invoices (tenant_id, number, vendor, category, description, items, amount, issued_at, status, method, attachment_name, paid_at, registered_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::date, $9, $10, $11, $12::timestamptz, $13) RETURNING id`,
        [user.tenant_id, dto.number?.trim() || genNumber(), dto.vendor.trim(), dto.category.trim(), dto.description ?? '', JSON.stringify(dto.items ?? []), dto.amount,
          dto.issuedAt.slice(0, 10), dto.status ?? 'pending', dto.method ?? null, dto.attachmentName ?? null,
          (dto.status ?? 'pending') === 'paid' ? (dto.paidAt ?? new Date().toISOString()) : null, user.sub],
      )
      return (await c.query(`SELECT ${COLS} FROM ${FROM} WHERE i.id = $1`, [r.rows[0].id])).rows[0]
    })
    this.events.publish('invoice.created', { invoiceId: row.id, vendor: row.vendor, amount: Number(row.amount) }, user.tenant_id)
    return row
  }

  @Roles('accountant')
  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `UPDATE finance.invoices SET
           vendor = COALESCE($2, vendor), category = COALESCE($3, category), description = COALESCE($4, description),
           items = COALESCE($5::jsonb, items), amount = COALESCE($6, amount), issued_at = COALESCE($7::date, issued_at),
           status = COALESCE($8, status), method = COALESCE($9, method), attachment_name = COALESCE($10, attachment_name),
           paid_at = CASE WHEN COALESCE($8, status) = 'paid' THEN COALESCE($11::timestamptz, paid_at, now()) ELSE NULL END,
           updated_at = now()
         WHERE id = $1 RETURNING id`,
        [id, dto.vendor?.trim() ?? null, dto.category?.trim() ?? null, dto.description ?? null, dto.items ? JSON.stringify(dto.items) : null, dto.amount ?? null,
          dto.issuedAt ? dto.issuedAt.slice(0, 10) : null, dto.status ?? null, dto.method ?? null, dto.attachmentName ?? null, dto.paidAt ?? null],
      )
      if (!r.rowCount) throw new NotFoundException('فاکتور یافت نشد')
      return (await c.query(`SELECT ${COLS} FROM ${FROM} WHERE i.id = $1`, [id])).rows[0]
    })
  }

  @Roles('accountant')
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(`DELETE FROM finance.invoices WHERE id = $1 RETURNING id`, [id])
      if (!r.rowCount) throw new NotFoundException('فاکتور یافت نشد')
      return { ok: true }
    })
  }

  /** ورود فاکتورها از فایل حسابداری — شماره‌ی تکراری به‌روزرسانی می‌شود */
  @Roles('accountant')
  @Post('import')
  async importRows(@CurrentUser() user: JwtPayload, @Body() dto: ImportInvoicesDto) {
    const imported = await this.db.withTenant(user.tenant_id!, async (c) => {
      let n = 0
      for (const r of dto.rows) {
        await c.query(
          `INSERT INTO finance.invoices (tenant_id, number, vendor, category, description, items, amount, issued_at, status, method, attachment_name, paid_at, registered_by)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::date, $9, $10, $11, $12::timestamptz, $13)
           ON CONFLICT (tenant_id, number) DO UPDATE SET vendor = EXCLUDED.vendor, category = EXCLUDED.category, description = EXCLUDED.description,
             items = EXCLUDED.items, amount = EXCLUDED.amount, issued_at = EXCLUDED.issued_at, status = EXCLUDED.status,
             method = EXCLUDED.method, paid_at = EXCLUDED.paid_at, updated_at = now()`,
          [user.tenant_id, r.number?.trim() || genNumber(), r.vendor.trim(), r.category.trim(), r.description ?? '', JSON.stringify(r.items ?? []), r.amount,
            r.issuedAt.slice(0, 10), r.status ?? 'pending', r.method ?? null, r.attachmentName ?? null,
            (r.status ?? 'pending') === 'paid' ? (r.paidAt ?? new Date().toISOString()) : null, user.sub],
        )
        n++
      }
      return n
    })
    return { imported }
  }
}
