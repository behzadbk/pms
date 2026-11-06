import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { AuditActor, PlatformAuditService, SYSTEM_ACTOR } from './platform-audit.service'
import { PlatformSettingsService } from './platform-settings.service'

/** قفل مشورتی: وقتی چند نمونه‌ی سرویس بالا باشند فقط یکی زمان‌بند را اجرا می‌کند */
const SCHEDULER_LOCK = 727_001
const TICK_MS = 60 * 60 * 1000

export type LifecycleAction = 'suspend' | 'reactivate' | 'cancel'

interface LifecycleRow {
  id: string
  name: string
  status: string
  suspended_at: Date | null
  suspend_reason: string | null
}

/**
 * چرخه‌ی عمر ساختمان: تعلیق / فعال‌سازی مجدد / لغو، به‌علاوه‌ی زمان‌بند ساعتی برای
 * معوقات و پایان دوره‌ی آزمایشی.
 *
 * تعلیق چه می‌کند: ورود و تمدید توکن همه‌ی کاربران آن ساختمان رد می‌شود (auth.service + jwt.strategy)،
 * و sessions_valid_after کاربران ساختمان «الان» می‌شود تا نشست‌های باز در identity-svc فوراً باطل شوند.
 * سرویس‌های دیگر accessToken را خودشان اعتبارسنجی می‌کنند؛ آن‌ها حداکثر تا انقضای ۱۵ دقیقه‌ای توکن جاری باز می‌مانند.
 * داده‌ی ساختمان به‌هیچ‌وجه پاک نمی‌شود؛ فعال‌سازی مجدد همه‌چیز را برمی‌گرداند.
 */
@Injectable()
export class PlatformLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformLifecycleService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly audit: PlatformAuditService,
    private readonly settings: PlatformSettingsService,
  ) {}

  onModuleInit() {
    if (process.env.PLATFORM_SCHEDULER === 'off') return
    // اولین اجرا کمی بعد از بالا آمدن؛ بعد هر ساعت
    const first = setTimeout(() => void this.safeTick(), 60_000)
    first.unref()
    this.timer = setInterval(() => void this.safeTick(), TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async apply(id: string, action: LifecycleAction, reason: string | undefined, actor: AuditActor) {
    if (action !== 'reactivate' && !reason?.trim()) throw new BadRequestException('دلیل تعلیق/لغو الزامی است')
    const row = await this.transition(id, action, reason?.trim() ?? null)
    if (action !== 'reactivate') await this.revokeSessions(id)
    await this.audit.log(actor, `building.${action}`, { buildingId: id, target: row.name, detail: { reason: reason ?? null, status: row.status } })
    this.events.publish(`tenant.${action === 'reactivate' ? 'reactivated' : action === 'suspend' ? 'suspended' : 'cancelled'}`, { tenantId: id, reason: reason ?? null }, id)
    return { id: row.id, status: row.status, suspendedAt: row.suspended_at ? new Date(row.suspended_at).toISOString() : null, suspendReason: row.suspend_reason }
  }

  private async transition(id: string, action: LifecycleAction, reason: string | null): Promise<LifecycleRow> {
    const target = action === 'suspend' ? 'suspended' : action === 'cancel' ? 'cancelled' : 'active'
    const row = await this.db.withPlatformAccess(async (c) => {
      const cur = await c.query<LifecycleRow>('SELECT id, name, status, suspended_at, suspend_reason FROM identity.tenants WHERE id = $1 FOR UPDATE', [id])
      const t = cur.rows[0]
      if (!t) throw new NotFoundException('ساختمان یافت نشد')
      if (action === 'reactivate' && !['suspended', 'cancelled'].includes(t.status)) throw new BadRequestException('این ساختمان تعلیق یا لغو نشده است')
      if (action === 'suspend' && t.status === 'suspended') throw new BadRequestException('این ساختمان از قبل تعلیق است')
      if (action === 'suspend' && t.status === 'cancelled') throw new BadRequestException('ساختمان لغوشده را باید ابتدا فعال کنید')
      if (action === 'cancel' && t.status === 'cancelled') throw new BadRequestException('این ساختمان از قبل لغو شده است')
      const r = await c.query<LifecycleRow>(
        `UPDATE identity.tenants
            SET status = $2,
                suspended_at = CASE WHEN $2 = 'active' THEN NULL ELSE now() END,
                suspend_reason = CASE WHEN $2 = 'active' THEN NULL ELSE $3 END
          WHERE id = $1
        RETURNING id, name, status, suspended_at, suspend_reason`,
        [id, target, reason],
      )
      return r.rows[0]
    })
    return row
  }

  /** نشست‌های باز کاربران ساختمان را همین لحظه باطل می‌کند (RLS: با context همان ساختمان) */
  private async revokeSessions(tenantId: string) {
    await this.db.withTenant(tenantId, (c) => c.query('UPDATE identity.users SET sessions_valid_after = now()'))
  }

  /* ───────────── زمان‌بند ───────────── */

  /**
   * مراحل پس از commit تعلیق خودکار: ثبت audit، ابطال نشست‌ها، انتشار رویداد.
   * وضعیت tenant قبلاً commit شده و tick بعدی آن را دیگر نمی‌بیند، پس خطای یک مرحله
   * نباید بقیه‌ی مراحل یا بقیه‌ی ساختمان‌ها را از بین ببرد (issue #84).
   */
  private afterAutoSuspend(t: { id: string; name: string }, eventReason: string, auditReason: string, extra: Record<string, unknown> = {}) {
    return this.afterCommit(t.id, 'building.suspend', [
      () => this.audit.log(SYSTEM_ACTOR, 'building.suspend', { buildingId: t.id, target: t.name, detail: { auto: true, reason: auditReason, ...extra } }),
      () => this.revokeSessions(t.id),
      () => this.events.publish('tenant.suspended', { tenantId: t.id, reason: eventReason }, t.id),
    ])
  }

  /** هر مرحله جداگانه اجرا می‌شود؛ خطا فقط لاگ می‌شود و مراحل بعدی ادامه می‌یابند */
  private async afterCommit(tenantId: string, what: string, steps: Array<() => unknown>) {
    for (const step of steps) {
      try {
        await step()
      } catch (e) {
        this.logger.error(`مرحله‌ی پس از ${what} برای ساختمان ${tenantId} ناموفق بود: ${(e as Error).message}`)
      }
    }
  }

  private async safeTick() {
    try {
      await this.tick()
    } catch (e) {
      this.logger.error(`اجرای زمان‌بند پلتفرم ناموفق بود: ${(e as Error).message}`)
    }
  }

  /** معوقات را علامت می‌زند و (اگر در تنظیمات روشن باشد) ساختمان‌های بدهکار/پایان‌آزمایشی را تعلیق می‌کند */
  async tick(): Promise<{ ran: boolean; newlyOverdue: number; suspendedForDebt: number; suspendedTrialEnded: number }> {
    const s = await this.settings.get()
    const out = await this.db.withPlatformAccess(async (c) => {
      const lock = await c.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [SCHEDULER_LOCK])
      if (!lock.rows[0]?.ok) return null
      try {
        // ۱) due → overdue وقتی فاکتور بازِ سررسیدگذشته دارد
        const overdue = await c.query<{ id: string; name: string }>(
          `UPDATE identity.tenants t SET billing_status = 'overdue'
            WHERE t.billing_status = 'due'
              AND EXISTS (SELECT 1 FROM identity.platform_invoices i
                           WHERE i.tenant_id = t.id AND i.status IN ('pending','failed') AND i.due_at < CURRENT_DATE)
          RETURNING t.id, t.name`,
        )
        // ۲) تعلیق بابت بدهی (فقط اگر روشن باشد)
        let debt: { id: string; name: string; days: number }[] = []
        if (s.autoSuspend) {
          const r = await c.query<{ id: string; name: string; days: number }>(
            `WITH late AS (
               SELECT t.id, t.name, (CURRENT_DATE - min(i.due_at))::int AS days
                 FROM identity.tenants t JOIN identity.platform_invoices i ON i.tenant_id = t.id
                WHERE t.status = 'active' AND i.status IN ('pending','failed') AND i.due_at < CURRENT_DATE - $1::int
                GROUP BY t.id, t.name)
             UPDATE identity.tenants t
                SET status = 'suspended', suspended_at = now(),
                    suspend_reason = 'خودکار: ' || late.days || ' روز معوق'
               FROM late WHERE t.id = late.id
             RETURNING t.id, t.name, late.days`,
            [s.graceDays],
          )
          debt = r.rows
        }
        // ۳) پایان دوره‌ی آزمایشی (فقط اگر روشن باشد)
        let trial: { id: string; name: string }[] = []
        if (s.autoSuspendTrial) {
          const r = await c.query<{ id: string; name: string }>(
            `UPDATE identity.tenants SET status = 'suspended', suspended_at = now(), suspend_reason = 'خودکار: پایان دوره‌ی آزمایشی'
              WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < CURRENT_DATE
          RETURNING id, name`,
          )
          trial = r.rows
        }
        return { overdue: overdue.rows, debt, trial }
      } finally {
        await c.query('SELECT pg_advisory_unlock($1)', [SCHEDULER_LOCK])
      }
    })
    if (!out) return { ran: false, newlyOverdue: 0, suspendedForDebt: 0, suspendedTrialEnded: 0 }

    for (const t of out.overdue) {
      await this.afterCommit(t.id, 'billing.overdue', [
        () => this.events.publish('platform.tenant_overdue', { tenantId: t.id, name: t.name }, t.id),
        () => this.audit.log(SYSTEM_ACTOR, 'billing.overdue', { buildingId: t.id, target: t.name }),
      ])
    }
    for (const t of out.debt) {
      await this.afterAutoSuspend(t, 'overdue', `${t.days} روز معوق`, { graceDays: s.graceDays })
    }
    for (const t of out.trial) {
      await this.afterAutoSuspend(t, 'trial_ended', 'پایان دوره‌ی آزمایشی')
    }
    return { ran: true, newlyOverdue: out.overdue.length, suspendedForDebt: out.debt.length, suspendedTrialEnded: out.trial.length }
  }
}
