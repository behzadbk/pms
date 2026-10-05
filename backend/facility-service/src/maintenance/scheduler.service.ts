import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { audit, fa, notify } from './common'

/**
 * job روزانه‌ی سرویس دوره‌ای: برای هر برنامه‌ی فعال که سررسیدش (منهای lead_days) رسیده و دستور کار
 * باز ندارد، یک دستور کار می‌سازد و به کارمند مسئول (یا همه‌ی کارکنان دارای دسترسی نگهداری) اعلان می‌دهد.
 * ایندکس یکتای wo_one_open_per_schedule جلوی ساخت دوباره را در دیتابیس تضمین می‌کند، پس اجرای تکراری/هم‌زمان بی‌خطر است.
 */
@Injectable()
export class MaintenanceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MaintenanceScheduler.name)
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    if (process.env.MAINTENANCE_JOB === 'off') return
    setTimeout(() => void this.runAll(), 5_000).unref()
    this.timer = setInterval(() => void this.runAll(), 60 * 60 * 1000)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async runAll(): Promise<number> {
    let total = 0
    try {
      const tenants = await this.db.withPlatformAccess(async (c) => (await c.query<{ id: string }>(`SELECT id FROM identity.tenants`)).rows)
      for (const t of tenants) {
        try { total += await this.runTenant(t.id) } catch (e) { this.log.warn(`tenant ${t.id}: ${(e as Error).message}`) }
      }
      if (total) this.log.log(`${total} دستور کار دوره‌ای ساخته شد`)
    } catch (e) {
      this.log.warn(`job سرویس دوره‌ای: ${(e as Error).message}`)
    }
    return total
  }

  async runTenant(tenantId: string): Promise<number> {
    return this.db.withTenant(tenantId, async (client) => {
      const due = (await client.query<{
        id: string; asset_id: string; title: string; next_due: string; assignee_login: string | null; priority: string; asset_name: string; assignee_name: string | null
      }>(
        `SELECT s.id, s.asset_id, s.title, s.next_due::text, s.assignee_login, s.priority, a.name AS asset_name, u.full_name AS assignee_name
           FROM facility.maintenance_schedules s
           JOIN facility.assets a ON a.id = s.asset_id AND a.is_active
           LEFT JOIN identity.users u ON u.id = s.assignee_login
          WHERE s.is_active AND s.next_due - s.lead_days <= (now() AT TIME ZONE 'Asia/Tehran')::date
            AND NOT EXISTS (SELECT 1 FROM facility.work_orders w WHERE w.schedule_id = s.id AND w.status IN ('open','in_progress'))`)).rows
      let n = 0
      for (const s of due) {
        const r = await client.query<{ id: string }>(
          `INSERT INTO facility.work_orders (tenant_id, title, description, asset_id, schedule_id, priority, assignee_login, assignee_name, due_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date) ON CONFLICT DO NOTHING RETURNING id`,
          [tenantId, `${s.title} — ${s.asset_name}`, 'سرویس دوره‌ای (ساخته‌شده خودکار)', s.asset_id, s.id, s.priority, s.assignee_login, s.assignee_name, s.next_due])
        if (!r.rows[0]) continue
        n++
        await notify(client, tenantId, s.assignee_login ? [{ login: s.assignee_login }] : [{ role: 'perm:maintenance' }], {
          kind: 'workorder', title: `سرویس دوره‌ای: ${s.title} — ${s.asset_name}`, body: `سررسید ${s.next_due}`, link: '/staff/work-orders', ref: r.rows[0].id,
        })
        await audit(client, tenantId, null, 'schedule.generate', { schedule: s.id, work_order: r.rows[0].id })
      }
      return n
    })
  }
}
void fa
