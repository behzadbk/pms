import { Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'

interface Target {
  name: string
  url: string
}

export interface ServiceHealth {
  name: string
  status: 'up' | 'down'
  latencyMs: number | null
  error?: string
}

const SERVICES: [string, number][] = [
  ['property', 3002],
  ['facility', 3003],
  ['finance', 3004],
  ['guard', 3005],
  ['notification', 3006],
  ['audit', 3007],
  ['fnb', 3008],
  ['integration', 3009],
]

/**
 * مانیتورینگ سلامت از دید سوپرادمین: وضعیت و تأخیر هر میکروسرویس (GET /health/ready)،
 * دیتابیس (حجم، اتصال‌ها) و چند شمارنده‌ی عملیاتی.
 *
 * آدرس سرویس‌ها: متغیر PLATFORM_HEALTH_TARGETS به‌شکل «property=http://property-svc:3002,facility=...»؛
 * اگر ست نشود در production از نام سرویس‌های docker-compose (<name>-svc) و در توسعه از localhost استفاده می‌شود.
 * این صفحه «وضعیت لحظه‌ای» است؛ نرخ خطا/هشدار خودکار نیاز به ابزار بیرونی (Sentry، Uptime Kuma، ...) دارد.
 */
@Injectable()
export class PlatformHealthService {
  constructor(private readonly db: DatabaseService) {}

  private targets(): Target[] {
    const env = process.env.PLATFORM_HEALTH_TARGETS?.trim()
    if (env) {
      return env.split(',').map((p) => {
        const i = p.indexOf('=')
        return { name: p.slice(0, i).trim(), url: p.slice(i + 1).trim().replace(/\/$/, '') }
      }).filter((t) => t.name && /^https?:\/\//.test(t.url))
    }
    const prod = process.env.NODE_ENV === 'production'
    return SERVICES.map(([name, port]) => ({ name, url: prod ? `http://${name}-svc:${port}` : `http://localhost:${port}` }))
  }

  private async ping(t: Target): Promise<ServiceHealth> {
    const t0 = Date.now()
    try {
      const res = await fetch(`${t.url}/health/ready`, { signal: AbortSignal.timeout(3000) })
      const latencyMs = Date.now() - t0
      if (!res.ok) return { name: t.name, status: 'down', latencyMs, error: `HTTP ${res.status}` }
      return { name: t.name, status: 'up', latencyMs }
    } catch (e) {
      return { name: t.name, status: 'down', latencyMs: null, error: (e as Error).name === 'TimeoutError' ? 'timeout' : 'unreachable' }
    }
  }

  async report() {
    const t0 = Date.now()
    const [services, dbStats] = await Promise.all([Promise.all(this.targets().map((t) => this.ping(t))), this.dbStats()])
    const identity: ServiceHealth = { name: 'identity', status: dbStats.reachable ? 'up' : 'down', latencyMs: dbStats.pingMs }
    const all = [identity, ...services]
    return {
      checkedAt: new Date().toISOString(),
      tookMs: Date.now() - t0,
      overall: all.every((s) => s.status === 'up') ? 'ok' : all.some((s) => s.name === 'identity' && s.status === 'down') ? 'critical' : 'degraded',
      services: all,
      database: dbStats,
    }
  }

  private async dbStats() {
    const t0 = Date.now()
    try {
      return await this.db.withPlatformAccess(async (c) => {
        const r = await c.query<{ size: string; conns: string; max: string; locked: string; failed_inv: string; overdue: string }>(
          `SELECT pg_database_size(current_database())::text AS size,
                  (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::text AS conns,
                  current_setting('max_connections') AS max,
                  (SELECT count(*) FROM identity.login_attempts WHERE locked_until > now())::text AS locked,
                  (SELECT count(*) FROM identity.platform_invoices WHERE status = 'failed')::text AS failed_inv,
                  (SELECT count(*) FROM identity.tenants WHERE billing_status = 'overdue')::text AS overdue`,
        )
        const x = r.rows[0]
        return {
          reachable: true,
          pingMs: Date.now() - t0,
          sizeBytes: Number(x.size),
          connections: Number(x.conns),
          maxConnections: Number(x.max),
          lockedLogins: Number(x.locked),
          failedInvoices: Number(x.failed_inv),
          overdueBuildings: Number(x.overdue),
        }
      })
    } catch {
      return { reachable: false, pingMs: null, sizeBytes: 0, connections: 0, maxConnections: 0, lockedLogins: 0, failedInvoices: 0, overdueBuildings: 0 }
    }
  }
}
