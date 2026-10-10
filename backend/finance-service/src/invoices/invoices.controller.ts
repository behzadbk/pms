import { Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common'
import type { Response } from 'express'
import { randomInt } from 'crypto'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { bad, isoDate, num, obj, str } from '../common/validate'
import { tehranToday } from '../common/jalali'

export const EXPENSE_CATEGORIES = [
  'حقوق و دستمزد پرسنل',
  'قبض برق و آب مشاعات',
  'نظافت و مواد مصرفی',
  'تعمیر و نگهداری',
  'آسانسور و تأسیسات',
  'امنیت و نگهبانی',
  'بیمه و متفرقه',
]
const PAY_METHODS = ['bank_transfer', 'card_to_card', 'cheque', 'cash', 'online']
const MAX_ATTACHMENT = 3 * 1024 * 1024
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

/** امضای (magic bytes) هر نوع مجاز؛ جلوی ذخیره‌ی HTML/اسکریپت با mime جعلی را می‌گیرد */
export function attachmentMatchesMime(d: Buffer, mime: string): boolean {
  switch (mime) {
    case 'image/jpeg': return d.length > 3 && d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff
    case 'image/png': return d.length > 8 && d.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case 'image/webp': return d.length > 12 && d.subarray(0, 4).toString('latin1') === 'RIFF' && d.subarray(8, 12).toString('latin1') === 'WEBP'
    case 'application/pdf': return d.length > 5 && d.subarray(0, 5).toString('latin1') === '%PDF-'
    default: return false
  }
}

const COLS = `id, number, vendor, category, description, items, amount, invoice_date, status, paid_on, pay_method,
  attachment_name, attachment_mime, (attachment_data IS NOT NULL) AS has_attachment, registered_by_name, created_at`

/** فاکتور/هزینه‌های ساختمان — ثبت و پرداخت: حسابدار؛ مشاهده: مدیر و حسابدار */
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly db: DatabaseService) {}

  @Roles('admin', 'accountant')
  @Get('categories')
  categories() {
    return EXPENSE_CATEGORIES
  }

  @Roles('admin', 'accountant')
  @Get()
  list(@Query('category') category: string | undefined, @Query('status') status: string | undefined, @CurrentUser() user: JwtPayload) {
    if (status && !['pending', 'paid'].includes(status)) bad('وضعیت نامعتبر است')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `SELECT ${COLS} FROM finance.expense_invoices
          WHERE ($1::text IS NULL OR category = $1) AND ($2::text IS NULL OR status = $2)
          ORDER BY invoice_date DESC, created_at DESC LIMIT 500`,
        [category ?? null, status ?? null],
      )
      return r.rows
    })
  }

  @Roles('admin', 'accountant')
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(`SELECT ${COLS} FROM finance.expense_invoices WHERE id = $1`, [id])
      if (!r.rows[0]) throw new NotFoundException('فاکتور یافت نشد')
      return r.rows[0]
    })
  }

  @Roles('admin', 'accountant')
  @Get(':id/attachment')
  async attachment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
    const row = await this.db.withTenant(user.tenant_id!, async (client) => (await client.query(`SELECT attachment_name, attachment_mime, attachment_data FROM finance.expense_invoices WHERE id = $1`, [id])).rows[0])
    if (!row?.attachment_data) throw new NotFoundException('پیوستی ثبت نشده است')
    res.set({
      'Content-Type': row.attachment_mime ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.attachment_name ?? 'attachment')}`,
      // پیوند کاربر در origin خود برنامه باز می‌شود؛ مرورگر نباید نوع را حدس بزند و هیچ اسکریپتی در آن اجرا نشود
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, no-store',
    })
    return new StreamableFile(row.attachment_data)
  }

  @Roles('accountant')
  @Post()
  create(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const v = parseInvoice(body, true)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const who = await client.query<{ full_name: string }>(`SELECT full_name FROM identity.users WHERE id = $1`, [user.sub])
      const number = v.number ?? `F-${String(randomInt(1e6)).padStart(6, '0')}`
      const paidOn = v.status === 'paid' ? (v.paid_on ?? tehranToday()) : null
      const r = await client.query(
        `INSERT INTO finance.expense_invoices (tenant_id, number, vendor, category, description, items, amount, invoice_date, status, paid_on, pay_method,
                                               attachment_name, attachment_mime, attachment_data, registered_by, registered_by_name)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::date,$9,$10::date,$11,$12,$13,$14,$15,$16) RETURNING ${COLS}`,
        [user.tenant_id, number, v.vendor, v.category, v.description, JSON.stringify(v.items), v.amount, v.invoice_date, v.status, paidOn, v.pay_method ?? null,
         v.attachment?.name ?? null, v.attachment?.mime ?? null, v.attachment?.data ?? null, user.sub, who.rows[0]?.full_name ?? 'حسابداری'],
      )
      return r.rows[0]
    })
  }

  /** ویرایش فقط تا قبل از پرداخت (پس از پرداخت، گردش صندوق تغییر نمی‌کند) */
  @Roles('accountant')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const v = parseInvoice(body, false)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const cur = (await client.query(`SELECT * FROM finance.expense_invoices WHERE id = $1 FOR UPDATE`, [id])).rows[0]
      if (!cur) throw new NotFoundException('فاکتور یافت نشد')
      if (cur.status === 'paid') throw new ConflictException('فاکتور پرداخت‌شده قابل ویرایش نیست')
      const items = v.items.length ? v.items : cur.items
      const amount = v.items.length ? v.amount : cur.amount
      const r = await client.query(
        `UPDATE finance.expense_invoices SET number = COALESCE($2, number), vendor = COALESCE($3, vendor), category = COALESCE($4, category),
                description = COALESCE($5, description), items = $6::jsonb, amount = $7, invoice_date = COALESCE($8::date, invoice_date), updated_at = now()
          WHERE id = $1 RETURNING ${COLS}`,
        [id, v.number ?? null, v.vendor ?? null, v.category ?? null, v.description ?? null, JSON.stringify(items), amount, v.invoice_date ?? null],
      )
      return r.rows[0]
    })
  }

  @Roles('accountant')
  @Post(':id/pay')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const b = obj(body ?? {})
    const pay_method = str(b.pay_method, 'روش پرداخت') ?? 'bank_transfer'
    if (!PAY_METHODS.includes(pay_method)) bad('روش پرداخت نامعتبر است')
    const paid_on = isoDate(b.paid_on, 'تاریخ پرداخت') ?? tehranToday()
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `UPDATE finance.expense_invoices SET status = 'paid', paid_on = $2::date, pay_method = $3, updated_at = now()
          WHERE id = $1 AND status = 'pending' RETURNING ${COLS}`,
        [id, paid_on, pay_method],
      )
      if (!r.rows[0]) {
        const ex = await client.query(`SELECT status FROM finance.expense_invoices WHERE id = $1`, [id])
        if (!ex.rows[0]) throw new NotFoundException('فاکتور یافت نشد')
        throw new ConflictException('این فاکتور قبلاً پرداخت شده است')
      }
      return r.rows[0]
    })
  }

  @Roles('accountant')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const cur = (await client.query(`SELECT status FROM finance.expense_invoices WHERE id = $1 FOR UPDATE`, [id])).rows[0]
      if (!cur) throw new NotFoundException('فاکتور یافت نشد')
      if (cur.status === 'paid') throw new ConflictException('فاکتور پرداخت‌شده از دفتر صندوق حذف نمی‌شود')
      await client.query(`DELETE FROM finance.expense_invoices WHERE id = $1`, [id])
      return { ok: true }
    })
  }
}

function parseInvoice(body: unknown, full: boolean) {
  const b = obj(body)
  const rawItems = b.items
  let items: { title: string; qty: number; unit_price: number }[] = []
  if (rawItems !== undefined || full) {
    if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 100) bad('حداقل یک ردیف برای فاکتور لازم است')
    items = (rawItems as unknown[]).map((i) => {
      const o = obj(i)
      return {
        title: str(o.title, 'شرح ردیف', { required: true, max: 200 })!,
        qty: num(o.qty, 'تعداد', { required: true, min: 0.001, max: 1e7 })!,
        unit_price: num(o.unit_price ?? o.unitPrice, 'فی', { required: true, min: 0, max: 1e12 })!,
      }
    })
  }
  const amount = Math.round(items.reduce((a, i) => a + i.qty * i.unit_price, 0))
  if (items.length && amount <= 0) bad('مبلغ فاکتور باید بزرگ‌تر از صفر باشد')
  const category = str(b.category, 'دسته‌ی هزینه', { required: full, max: 80 })
  if (category && !EXPENSE_CATEGORIES.includes(category)) bad('دسته‌ی هزینه نامعتبر است')
  const status = (str(b.status, 'وضعیت') ?? 'pending') as 'pending' | 'paid'
  if (!['pending', 'paid'].includes(status)) bad('وضعیت نامعتبر است')
  const pay_method = str(b.pay_method, 'روش پرداخت')
  if (pay_method && !PAY_METHODS.includes(pay_method)) bad('روش پرداخت نامعتبر است')
  if (full && status === 'paid' && !pay_method) bad('روش پرداخت را مشخص کنید')

  let attachment: { name: string; mime: string; data: Buffer } | undefined
  if (b.attachment) {
    const a = obj(b.attachment)
    const mime = str(a.mime, 'نوع پیوست', { required: true })!
    if (!MIMES.includes(mime)) bad('فقط تصویر (JPG/PNG/WebP) یا PDF مجاز است')
    const data = Buffer.from(str(a.base64, 'فایل پیوست', { required: true, max: 5_000_000 })!, 'base64')
    if (!data.length || data.length > MAX_ATTACHMENT) bad('حجم پیوست باید کمتر از ۳ مگابایت باشد')
    // محتوای واقعی باید با mime اعلام‌شده بخواند (قبلاً هر بایتی با mime دلخواه ذخیره می‌شد)
    if (!attachmentMatchesMime(data, mime)) bad('محتوای فایل با نوع اعلام‌شده نمی‌خواند')
    attachment = { name: str(a.name, 'نام پیوست', { max: 120 }) ?? 'attachment', mime, data }
  }
  return {
    number: str(b.number, 'شماره فاکتور', { max: 40 }),
    vendor: str(b.vendor, 'فروشنده', { required: full, max: 120 }),
    category,
    description: str(b.description, 'شرح', { required: full, max: 500 }),
    items,
    amount,
    invoice_date: isoDate(b.invoice_date ?? b.invoiceDate, 'تاریخ فاکتور', full),
    status,
    paid_on: isoDate(b.paid_on, 'تاریخ پرداخت'),
    pay_method,
    attachment,
  }
}
