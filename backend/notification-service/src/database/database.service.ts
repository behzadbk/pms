import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { Pool, PoolClient, types } from 'pg'
import { HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus'

/**
 * ستون DATE (oid 1082) را به‌صورت رشته‌ی ساده‌ی 'YYYY-MM-DD' برمی‌گردانیم، نه Date.
 * pg به‌طور پیش‌فرض آن را در منطقه‌ی زمانی سرور به Date تبدیل می‌کرد و due_date/تاریخ‌ها
 * روی سرورِ TZ=Asia/Tehran در JSON یک روز عقب (…T20:30:00.000Z) می‌رفت.
 */
types.setTypeParser(1082, (v: string) => v)

/**
 * پیاده‌سازی واقعیِ الگوی Row-Level Security توضیح‌داده‌شده در
 * docs/ARCHITECTURE-SAAS.md بخش ۳ («تزریق tenant_id در هر Request»).
 *
 * نکته: در Production واقعی این لایه معمولاً از طریق Prisma Client Extension
 * انجام می‌شود؛ اینجا برای اینکه این سرویس بدون وابستگی به دانلود Prisma
 * Engine binary (که در برخی محیط‌های محدود شبکه در دسترس نیست) قابل build و
 * اجرا باشد، مستقیماً از `pg` استفاده شده — منطق RLS دقیقاً یکسان است.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool
  /**
   * pool دوم و اختیاری با نقش platform_admin (BYPASSRLS) فقط برای withPlatformAccess.
   * اگر PLATFORM_DATABASE_URL ست نباشد undefined است و رفتار قبلی (همان pool عادی) حفظ می‌شود.
   */
  private readonly platformPool?: Pool

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // مهم: این Pool نباید با نقش دیتابیسی BYPASSRLS متصل شود —
      // کاربر دیتابیس اپلیکیشن (app_user) باید RLS برایش فعال باشد.
      // سقف اتصال هر سرویس؛ با DB_POOL_MAX قابل تنظیم (مجموع همه‌ی سرویس‌ها باید زیر max_connections پستگرس بماند)
      max: Number(process.env.DB_POOL_MAX) || 10,
      // اتصال بیکار را آزاد کن تا پستگرس با چند سرویس بی‌دلیل پر نشود
      idleTimeoutMillis: 30_000,
      // وقتی pool پر است درخواست تا ابد منتظر نماند؛ بعد از ۵ ثانیه خطا بده تا سرویس قفل نشود
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 5_000,
      // کوئری سنگین/گیرکرده بیش از این زمان اتصال را اشغال نکند
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 60_000,
    })
    // بدون این handler، خطای یک اتصال بیکار (مثلاً ری‌استارت پستگرس) یک 'error' مدیریت‌نشده است و کل پروسه را می‌اندازد
    this.pool.on('error', (err) => Logger.error(`خطای اتصال بیکار pool: ${err.message}`, 'DatabaseService'))

    if (process.env.PLATFORM_DATABASE_URL) {
      this.platformPool = new Pool({
        connectionString: process.env.PLATFORM_DATABASE_URL,
        // سقف کوچک: فقط کارهای سطح پلتفرم (پنل SaaS، زمان‌بندها) از این pool می‌گذرند
        max: Number(process.env.PLATFORM_DB_POOL_MAX) || 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 5_000,
        statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 60_000,
      })
      this.platformPool.on('error', (err) =>
        Logger.error(`خطای اتصال بیکار pool پلتفرم: ${err.message}`, 'DatabaseService'),
      )
    }
  }

  /**
   * اجرای یک تابع در محدوده یک تراکنش که ابتدا tenant جاری را با
   * `SET LOCAL` ست می‌کند — همه Query‌های داخل fn فقط به رکوردهای همان
   * tenant دسترسی دارند (به‌شرط فعال بودن Policy روی جدول مقصد).
   */
  async withTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    let broken: Error | undefined
    try {
      await client.query('BEGIN')
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId])
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      // اگر خود ROLLBACK هم شکست خورد، خطای اصلی پنهان نشود و اتصال خراب به pool برنگردد
      try {
        await client.query('ROLLBACK')
      } catch (rollbackErr) {
        broken = rollbackErr as Error
      }
      throw err
    } finally {
      client.release(broken)
    }
  }

  /**
   * برای عملیات سطح Super-Admin که باید cross-tenant بخوانند (پنل SaaS).
   * با PLATFORM_DATABASE_URL از نقش جدای platform_admin (BYPASSRLS) استفاده می‌کند؛
   * بدون آن همان pool عادی app_user (رفتار قبلی).
   */
  async withPlatformAccess<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await (this.platformPool ?? this.pool).connect()
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
    await Promise.all([this.pool.end(), this.platformPool?.end()])
  }
}
