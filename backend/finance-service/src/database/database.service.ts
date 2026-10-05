import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { Pool, PoolClient, types } from 'pg'
import { HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus'

/**
 * پیاده‌سازی واقعیِ الگوی Row-Level Security توضیح‌داده‌شده در
 * docs/ARCHITECTURE-SAAS.md بخش ۳ («تزریق tenant_id در هر Request»).
 *
 * نکته: در Production واقعی این لایه معمولاً از طریق Prisma Client Extension
 * انجام می‌شود؛ اینجا برای اینکه این سرویس بدون وابستگی به دانلود Prisma
 * Engine binary (که در برخی محیط‌های محدود شبکه در دسترس نیست) قابل build و
 * اجرا باشد، مستقیماً از `pg` استفاده شده — منطق RLS دقیقاً یکسان است.
 */
/**
 * تاریخ‌های تقویمی (DATE) باید همان رشته‌ی 'YYYY-MM-DD' بمانند: پیش‌فرض node-pg آن را به Date در
 * منطقه‌ی زمانی «سرور» تبدیل می‌کند و JSON آن را یک روز جابه‌جا می‌کند (باگ سررسید).
 * NUMERIC (مبالغ تومان / متراژ) هم به number تبدیل می‌شود تا JSON عدد باشد نه رشته.
 */
types.setTypeParser(1082, (v: string) => v) // date
types.setTypeParser(1700, (v: string) => Number(v)) // numeric
types.setTypeParser(20, (v: string) => Number(v)) // int8 / count(*)

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // مهم: این Pool نباید با نقش دیتابیسی BYPASSRLS متصل شود —
      // کاربر دیتابیس اپلیکیشن (app_user) باید RLS برایش فعال باشد.
      max: 10,
    })
  }

  /**
   * اجرای یک تابع در محدوده یک تراکنش که ابتدا tenant جاری را با
   * `SET LOCAL` ست می‌کند — همه Query‌های داخل fn فقط به رکوردهای همان
   * tenant دسترسی دارند (به‌شرط فعال بودن Policy روی جدول مقصد).
   */
  async withTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId])
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /** برای عملیات سطح Super-Admin که باید cross-tenant بخوانند (پنل SaaS) — نقش دیتابیسی جدا با BYPASSRLS */
  async withPlatformAccess<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      return await fn(client)
    } finally {
      client.release()
    }
  }

  async pingHealthIndicator(): Promise<HealthIndicatorResult> {
    try {
      await this.pool.query('SELECT 1')
      return { database: { status: 'up' } }
    } catch {
      throw new HealthCheckError('اتصال دیتابیس برقرار نیست', { database: { status: 'down' } })
    }
  }

  async onModuleDestroy() {
    await this.pool.end()
  }
}
