import { Body, Controller, Post } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { EventsService } from '../events/events.service'
import { SettingsService } from '../billing/settings.service'
import { EXPENSE_CATEGORIES } from '../invoices/invoices.controller'
import { bad, isoDate, num, obj, str } from '../common/validate'
import { computeDueDate, parsePeriod, tehranToday } from '../common/jalali'

const MAX_ROWS = 2000
const FALLBACK_CATEGORY = 'بیمه و متفرقه'

export interface ImportError { line: number; message: string }

function rowsOf(body: unknown): Record<string, unknown>[] {
  const b = obj(body)
  if (!Array.isArray(b.rows) || b.rows.length < 1) bad('هیچ ردیفی برای ورود ارسال نشده است')
  if (b.rows.length > MAX_ROWS) bad(`حداکثر ${MAX_ROWS} ردیف در هر بار ورود مجاز است`)
  return b.rows.map((r) => obj(r))
}

/**
 * ورود اطلاعات از فایل حسابداری (اکسل/CSV که فرانت می‌خواند و ردیف‌های سالم را اینجا می‌فرستد).
 * فقط حسابدار؛ ردیف‌های نامعتبر با شماره‌ی ردیف گزارش می‌شوند و بقیه ثبت می‌شوند.
 */
@Controller()
export class ImportsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
  ) {}

  /** شارژ واحدها: هر ردیف {unit_number, period (YYYY-MM شمسی), amount, status, due_date?, paid_on?}؛ ردیف همان (واحد، دوره) جایگزین می‌شود مگر پرداخت‌شده باشد */
  @Roles('accountant')
  @Post('charges/import')
  async importCharges(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const rows = rowsOf(body)
    const tenantId = user.tenant_id!
    const out = await this.db.withTenant(tenantId, async (client) => {
      const dueDay = (await this.settings.get(client, tenantId)).due_day
      const numbers = [...new Set(rows.map((r) => String(r.unit_number ?? '').trim()).filter(Boolean))]
      const units = await client.query<{ id: string; unit_number: string }>(`SELECT id, unit_number FROM property.units WHERE unit_number = ANY($1::text[])`, [numbers])
      const unitId = new Map(units.rows.map((u) => [u.unit_number, u.id]))
      const result = { created: 0, updated: 0, skipped: 0, errors: [] as ImportError[] }
      // کلیدهای «واحد|دوره»ی دیده‌شده در همین فایل: دو ردیف برای یک (واحد، دوره) در یک فایل خطا می‌شود تا ردیف دوم
      // بی‌صدا روی اولی ننویسد.
      const seen = new Set<string>()
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const line = Number(r.line) || i + 2
        // هر ردیف داخل یک SAVEPOINT اجرا می‌شود. در PostgreSQL بعد از اولین خطای SQL کل تراکنش «aborted» می‌شود و هیچ
        // دستوری دیگر اجرا نمی‌شود؛ با SAVEPOINT فقط همان ردیفِ خراب برگردانده می‌شود (ROLLBACK TO) و ردیف‌های سالم ثبت می‌مانند.
        // خطاها با شماره‌ی خط فایل گزارش می‌شوند (line پیش‌فرض = اندیس+۲ چون ردیف ۱ سرستون است).
        await client.query('SAVEPOINT imp_row')
        let kind: 'created' | 'updated' = 'created'
        try {
          const unitNumber = str(r.unit_number, 'شماره‌ی واحد', { required: true, max: 40 })!
          const period = str(r.period, 'دوره', { required: true })!
          if (!parsePeriod(period)) bad('دوره باید شمسی و به شکل YYYY-MM باشد')
          const amount = num(r.amount, 'مبلغ', { required: true, min: 0, max: 1e12 })!
          const status = str(r.status, 'وضعیت') ?? 'pending'
          if (!['pending', 'paid', 'overdue'].includes(status)) bad('وضعیت نامعتبر است')
          const due = isoDate(r.due_date, 'سررسید') ?? computeDueDate(period, dueDay)
          const paidOn = status === 'paid' ? (isoDate(r.paid_on, 'تاریخ پرداخت') ?? tehranToday()) : null
          const uid = unitId.get(unitNumber)
          if (!uid) bad(`واحد «${unitNumber}» در این ساختمان تعریف نشده است`)
          const key = `${uid}|${period}`
          if (seen.has(key)) bad('این واحد و دوره در همین فایل تکرار شده است')
          seen.add(key)

          // ردیفِ همان (واحد، دوره) قفل می‌شود (FOR UPDATE) تا هم‌زمان با پرداخت آنلاین/ثبت دستی خراب نشود.
          // شارژ «پرداخت‌شده» هرگز جایگزین نمی‌شود (skipped)؛ بقیه با مبلغ فایل بازنویسی و جریمه/اعلان‌شان صفر می‌شود.
          const cur = (await client.query<{ id: string; status: string }>(`SELECT id, status FROM finance.monthly_charges WHERE unit_id = $1 AND period = $2 FOR UPDATE`, [uid, period])).rows[0]
          if (cur?.status === 'paid') { result.skipped++; bad('این شارژ قبلاً پرداخت شده و جایگزین نمی‌شود') }
          let id: string
          if (cur) {
            await client.query(
              `UPDATE finance.monthly_charges SET base_amount = $2, late_fee_amount = 0, total_amount = $2, due_date = $3::date, status = $4,
                      late_fee_through = NULL, overdue_notified_at = NULL, source = 'import', updated_at = now() WHERE id = $1`,
              // ردیفِ «paid» ابتدا با وضعیت pending ثبت می‌شود و در بلوک پایین (همراه با ردیف payments) به paid می‌رسد؛
              // تا وضعیت شارژ و پرداخت همیشه با هم و سازگار نوشته شوند.
              [cur.id, amount, due, status === 'paid' ? 'pending' : status],
            )
            id = cur.id
            kind = 'updated'
          } else {
            id = (await client.query<{ id: string }>(
              `INSERT INTO finance.monthly_charges (tenant_id, unit_id, period, base_amount, late_fee_amount, total_amount, due_date, status, source)
               VALUES ($1, $2, $3, $4, 0, $4, $5::date, $6, 'import') RETURNING id`,
              [tenantId, uid, period, amount, due, status === 'paid' ? 'pending' : status],
            )).rows[0].id
          }
          if (status === 'paid') {
            // پرداخت‌شده: ردیف payments هم ثبت می‌شود تا در گردش صندوق و گزارش‌ها بیاید
            // ساعت پرداخت در فایل نیست؛ ۱۲:۰۰ ظهر تهران فرض می‌شود تا تاریخ در تبدیل منطقه‌ی زمانی یک روز جابه‌جا نشود.
            // idempotency_key = import-<chargeId> + ON CONFLICT DO NOTHING یعنی ورود دوباره، پرداخت تکراری نمی‌سازد.
            const paidAt = `($1::date + time '12:00') AT TIME ZONE 'Asia/Tehran'`
            await client.query(
              `INSERT INTO finance.payments (tenant_id, monthly_charge_id, amount, gateway, status, method, paid_at, idempotency_key, recorded_by, note)
               VALUES ($2, $3, $4, 'import', 'success', 'import', ${paidAt}, $5, $6, 'ورود از فایل حسابداری')
               ON CONFLICT (idempotency_key) DO NOTHING`,
              [paidOn, tenantId, id, amount, `import-${id}`, user.sub],
            )
            await client.query(
              `UPDATE finance.monthly_charges SET status = 'paid', paid_at = ${paidAt}, pay_method = 'import', updated_at = now() WHERE id = $2`,
              [paidOn, id],
            )
          }
          result[kind]++
          await client.query('RELEASE SAVEPOINT imp_row')
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT imp_row')
          result.errors.push({ line, message: (e as { response?: { message?: string }; message: string }).response?.message ?? (e as Error).message })
        }
      }
      return result
    })
    if (out.created || out.updated) this.events.publish('charge.imported', { created: out.created, updated: out.updated }, tenantId)
    return out
  }

  /** فاکتور/هزینه‌ها: هر ردیف {invoice_date, description, amount, vendor?, category?, status?, number?}؛ شماره‌ی تکراری رد می‌شود (ورود دوباره‌ی همان فایل بی‌خطر است) */
  @Roles('accountant')
  @Post('invoices/import')
  importInvoices(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const rows = rowsOf(body)
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const who = await client.query<{ full_name: string }>(`SELECT full_name FROM identity.users WHERE id = $1`, [user.sub])
      const registeredBy = who.rows[0]?.full_name ?? 'حسابداری'
      // اگر ردیفی شماره نداشته باشد شماره‌ی خودکار IMP-<batch>-<ردیف> ساخته می‌شود. batch از زمان اجراست؛ پس
      // ورود دوباره‌ی همان فایلِ «بدون ستون شماره» فاکتور تکراری می‌سازد. ضدتکراری بودن فقط برای فایل‌های دارای شماره است.
      const batch = Date.now().toString(36)
      const result = { created: 0, skipped: 0, errors: [] as ImportError[] }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const line = Number(r.line) || i + 2
        // همان الگوی SAVEPOINT-برای-هر-ردیف (بالا توضیح داده شده).
        await client.query('SAVEPOINT imp_row')
        try {
          const date = isoDate(r.invoice_date, 'تاریخ', true)!
          const description = str(r.description, 'شرح', { required: true, max: 500 })!
          const amount = Math.round(num(r.amount, 'مبلغ', { required: true, min: 1, max: 1e12 })!)
          const vendor = str(r.vendor, 'فروشنده', { max: 120 }) ?? 'نامشخص'
          const rawCat = str(r.category, 'دسته', { max: 80 })
          const category = rawCat && EXPENSE_CATEGORIES.includes(rawCat) ? rawCat : FALLBACK_CATEGORY
          const status = str(r.status, 'وضعیت') ?? 'paid'
          if (!['pending', 'paid'].includes(status)) bad('وضعیت نامعتبر است')
          const number = str(r.number, 'شماره', { max: 40 }) ?? `IMP-${batch}-${i + 1}`
          const ins = await client.query(
            `INSERT INTO finance.expense_invoices (tenant_id, number, vendor, category, description, items, amount, invoice_date, status, paid_on, pay_method, registered_by, registered_by_name)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::date,$9,$10::date,$11,$12,$13)
             ON CONFLICT (tenant_id, number) DO NOTHING RETURNING id`,
            [tenantId, number, vendor, category, description, JSON.stringify([{ title: description, qty: 1, unit_price: amount }]), amount, date, status,
             status === 'paid' ? date : null, status === 'paid' ? 'bank_transfer' : null, user.sub, registeredBy],
          )
          if (ins.rowCount) result.created++
          else { result.skipped++; bad(`فاکتور با شماره‌ی «${number}» از قبل ثبت شده است`) }
          await client.query('RELEASE SAVEPOINT imp_row')
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT imp_row')
          result.errors.push({ line, message: (e as { response?: { message?: string }; message: string }).response?.message ?? (e as Error).message })
        }
      }
      return result
    })
  }
}
