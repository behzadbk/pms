import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'

const EVERY_MS = 6 * 3600 * 1000
const MONTHS_AHEAD = 6

/**
 * پارتیشن ماهانه‌ی audit.event_logs را از قبل می‌سازد تا با عوض شدن ماه، درج لاگ به
 * «no partition found» نخورد. هنگام بالا آمدن سرویس و سپس هر ۶ ساعت اجرا می‌شود
 * (idempotent؛ وابسته به هیچ کرون بیرونی نیست).
 */
@Injectable()
export class PartitionMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartitionMaintenanceService.name)
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
      await this.db.withPlatformAccess((c) => c.query('SELECT audit.ensure_upcoming_partitions($1)', [MONTHS_AHEAD]))
    } catch (err) {
      // مایگریشن 002 هنوز اجرا نشده یا دسترسی نیست — لاگ می‌شود ولی سرویس بالا می‌آید
      this.logger.error(`ساخت پارتیشن‌های audit ناموفق بود: ${(err as Error).message}`)
    }
  }
}
