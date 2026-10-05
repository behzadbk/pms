import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'

const EVERY_MS = 3 * 3600 * 1000

/**
 * وضعیت «دیرکرد» و جریمه را خودکار به‌روز می‌کند: هنگام بالا آمدن سرویس و سپس هر ۳ ساعت
 * برای همه‌ی ساختمان‌ها `finance.sweep_overdue(tenant)` را اجرا می‌کند (idempotent؛ وابسته به کرون بیرونی نیست).
 * فهرست tenantها از identity.tenants (بدون RLS) خوانده می‌شود و هر ساختمان در تراکنش و RLS خودش پردازش می‌شود.
 * نرخ جریمه از finance.settings همان ساختمان می‌آید (پیش‌فرض: بدون جریمه).
 */
@Injectable()
export class OverdueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OverdueService.name)
  private timer?: NodeJS.Timeout

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    void this.run()
    this.timer = setInterval(() => void this.run(), EVERY_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async run() {
    try {
      const tenants = await this.db.withPlatformAccess(async (c) => (await c.query<{ id: string }>(`SELECT id FROM identity.tenants WHERE status IN ('active', 'trial')`)).rows)
      let total = 0
      for (const t of tenants) {
        total += await this.db.withTenant(t.id, async (c) => Number((await c.query<{ n: number }>(`SELECT finance.sweep_overdue($1) AS n`, [t.id])).rows[0].n))
      }
      if (total) this.logger.log(`${total} شارژ به‌روز شد (دیرکرد/جریمه)`)
    } catch (err) {
      this.logger.error(`جارو دیرکرد ناموفق بود: ${(err as Error).message}`)
    }
  }
}
