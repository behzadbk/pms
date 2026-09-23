import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { LogEntry } from './log-entry.interface'
import { redact } from './redact'

const FLUSH_INTERVAL_MS = 1000
const FLUSH_SIZE = 500

/**
 * درج دسته‌ای لاگ — بخش ۱.۲ سند UPDATE-V2 («لاگ‌گیری غیرمسدودکننده»).
 *
 * enqueue() هرگز await نمی‌شود و هرگز throw نمی‌کند: لاگ در یک بافر حافظه‌ای
 * می‌نشیند و یک تایمر هر ۱ ثانیه (یا وقتی بافر به ۵۰۰ رکورد رسید) آن را با یک
 * INSERT چندردیفی می‌نویسد. بنابراین کندی یا قطعی دیتابیس هرگز مسیر درخواست
 * کاربر را مسدود نمی‌کند — بدترین حالت، از دست رفتن چند لاگ است، نه خطای کاربر.
 */
@Injectable()
export class LogIngestService implements OnModuleDestroy {
  private readonly logger = new Logger(LogIngestService.name)
  private buffer: LogEntry[] = []
  private timer: NodeJS.Timeout

  constructor(private readonly db: DatabaseService) {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS)
  }

  enqueue(entries: LogEntry[]) {
    for (const e of entries) {
      this.buffer.push({
        ...e,
        occurred_at: e.occurred_at ?? new Date().toISOString(),
        request_body: redact(e.request_body),
        response_body: redact(e.response_body),
      })
    }
    if (this.buffer.length >= FLUSH_SIZE) void this.flush()
  }

  private async flush() {
    if (this.buffer.length === 0) return
    const batch = this.buffer
    this.buffer = []

    // گروه‌بندی بر اساس tenant — چون هر درج باید داخل تراکنش RLS همان tenant انجام شود
    const byTenant = new Map<string, LogEntry[]>()
    for (const e of batch) {
      const list = byTenant.get(e.tenant_id) ?? []
      list.push(e)
      byTenant.set(e.tenant_id, list)
    }

    for (const [tenantId, entries] of byTenant) {
      try {
        await this.db.withTenant(tenantId, async (client) => {
          const cols = [
            'tenant_id', 'occurred_at', 'session_id', 'trace_id', 'user_id', 'actor_role',
            'source', 'level', 'action', 'http_method', 'http_path', 'status_code',
            'duration_ms', 'device', 'request_body', 'response_body', 'error_stack',
          ]
          const values: unknown[] = []
          const rows = entries.map((e, i) => {
            const base = i * cols.length
            values.push(
              e.tenant_id, e.occurred_at, e.session_id, e.trace_id ?? null, e.user_id ?? null,
              e.actor_role ?? null, e.source, e.level, e.action, e.http_method ?? null,
              e.http_path ?? null, e.status_code ?? null, e.duration_ms ?? null,
              JSON.stringify(e.device ?? {}), JSON.stringify(e.request_body ?? null),
              JSON.stringify(e.response_body ?? null), e.error_stack ?? null,
            )
            return `(${cols.map((_, c) => `$${base + c + 1}`).join(',')})`
          })
          await client.query(
            `INSERT INTO audit.event_logs (${cols.join(',')}) VALUES ${rows.join(',')}`,
            values,
          )
        })
      } catch (err) {
        // شکست درج لاگ نباید هیچ اثری بیرون از این سرویس داشته باشد
        this.logger.error(`درج دسته‌ای ${entries.length} لاگ ناموفق بود: ${(err as Error).message}`)
      }
    }
  }

  async onModuleDestroy() {
    clearInterval(this.timer)
    await this.flush() // خالی‌کردن بافر پیش از خاموشی (graceful shutdown)
  }
}
