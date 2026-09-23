import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'

export interface LogSearchFilters {
  from?: string
  to?: string
  level?: string
  userId?: string
  action?: string
  source?: string
  statusCode?: number
  deviceOs?: string
  deviceBrowser?: string
  q?: string
  page?: number
  limit?: number
}

@Injectable()
export class LogQueryService {
  constructor(private readonly db: DatabaseService) {}

  async search(tenantId: string, f: LogSearchFilters) {
    const page = Math.max(1, f.page ?? 1)
    const limit = Math.min(200, Math.max(1, f.limit ?? 50))
    const offset = (page - 1) * limit

    const where: string[] = []
    const params: unknown[] = []
    const add = (sqlTemplate: string, ...values: unknown[]) => {
      let sql = sqlTemplate
      for (const v of values) {
        params.push(v)
        sql = sql.replace('?', `$${params.length}`)
      }
      where.push(sql)
    }

    if (f.from) add('occurred_at >= ?', f.from)
    if (f.to) add('occurred_at <= ?', f.to)
    if (f.level) add('level = ?', f.level)
    if (f.userId) add('user_id = ?', f.userId)
    if (f.action) add('action = ?', f.action)
    if (f.source) add('source = ?', f.source)
    if (f.statusCode) add('status_code = ?', f.statusCode)
    if (f.deviceOs) add("device->>'os' = ?", f.deviceOs)
    if (f.deviceBrowser) add("device->>'browser' = ?", f.deviceBrowser)
    if (f.q) add('(action ILIKE ? OR http_path ILIKE ?)', `%${f.q}%`, `%${f.q}%`)

    const finalWhere = where.length ? `WHERE ${where.join(' AND ')}` : ''

    return this.db.withTenant(tenantId, async (client) => {
      const rows = await client.query(
        `SELECT * FROM audit.event_logs ${finalWhere}
         ORDER BY occurred_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params,
      )
      const count = await client.query(
        `SELECT count(*)::int AS total FROM audit.event_logs ${finalWhere}`,
        params,
      )
      return { data: rows.rows, meta: { total: count.rows[0].total, page, limit } }
    })
  }

  async findOne(tenantId: string, id: string) {
    return this.db.withTenant(tenantId, async (client) => {
      const res = await client.query('SELECT * FROM audit.event_logs WHERE id = $1', [id])
      if (!res.rows[0]) throw new NotFoundException('لاگ یافت نشد')
      return res.rows[0]
    })
  }

  /**
   * ★ Event Chaining — بخش ۳.۱ سند UPDATE-V2.
   * زنجیره رویدادهای همان نشست، قبل و بعد از لاگ هدف. این همان چیزی است که
   * اشکال‌زدایی «واکنش زنجیره‌ای» را ممکن می‌کند: دیدن ۵۰ تا ۱۰۰ اقدام کاربر
   * که به باگ منجر شده‌اند، نه فقط خود خطا.
   *
   * از ایندکس (session_id, occurred_at) استفاده می‌کند، پس هزینه‌اش مستقل از
   * حجم کل جدول است.
   */
  async getContext(tenantId: string, id: string, before = 50, after = 20) {
    const target = await this.findOne(tenantId, id)
    const b = Math.min(100, Math.max(0, before))
    const a = Math.min(100, Math.max(0, after))

    return this.db.withTenant(tenantId, async (client) => {
      const beforeRows = await client.query(
        `SELECT * FROM audit.event_logs
         WHERE session_id = $1 AND (occurred_at, id) < ($2, $3)
         ORDER BY occurred_at DESC, id DESC LIMIT ${b}`,
        [target.session_id, target.occurred_at, target.id],
      )
      const afterRows = await client.query(
        `SELECT * FROM audit.event_logs
         WHERE session_id = $1 AND (occurred_at, id) > ($2, $3)
         ORDER BY occurred_at ASC, id ASC LIMIT ${a}`,
        [target.session_id, target.occurred_at, target.id],
      )
      return {
        session_id: target.session_id,
        target,
        before: beforeRows.rows.reverse(), // به ترتیب زمانی صعودی برای نمایش Timeline
        after: afterRows.rows,
      }
    })
  }

  async getSession(tenantId: string, sessionId: string) {
    return this.db.withTenant(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM audit.event_logs WHERE session_id = $1 ORDER BY occurred_at ASC LIMIT 1000`,
        [sessionId],
      )
      return res.rows
    })
  }

  async getStats(tenantId: string, from?: string, to?: string) {
    return this.db.withTenant(tenantId, async (client) => {
      const params = [from ?? new Date(Date.now() - 86400000).toISOString(), to ?? new Date().toISOString()]
      const byLevel = await client.query(
        `SELECT level, count(*)::int AS count FROM audit.event_logs
         WHERE occurred_at BETWEEN $1 AND $2 GROUP BY level`,
        params,
      )
      const topErrors = await client.query(
        `SELECT action, count(*)::int AS count FROM audit.event_logs
         WHERE occurred_at BETWEEN $1 AND $2 AND level = 'error'
         GROUP BY action ORDER BY count DESC LIMIT 10`,
        params,
      )
      const byDevice = await client.query(
        `SELECT device->>'browser' AS browser, device->>'os' AS os, count(*)::int AS count
         FROM audit.event_logs WHERE occurred_at BETWEEN $1 AND $2
         GROUP BY 1, 2 ORDER BY count DESC LIMIT 10`,
        params,
      )
      return { byLevel: byLevel.rows, topErrors: topErrors.rows, byDevice: byDevice.rows }
    })
  }
}
