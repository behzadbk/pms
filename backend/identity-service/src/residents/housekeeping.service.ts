import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { notify, writeAudit } from './context'
import { executeMoveOut } from './manager.service'
import { revokeSessions } from './residency.repo'
import { currentJalaliYear, fa } from './residents.constants'

/**
 * کارهای زمان‌دار ماژول ساکنین — هم هر ۵ دقیقه روی همه‌ی ساختمان‌ها، هم «تنبل» پیش از
 * خواندن‌های مهم همان ساختمان (با فاصله‌ی حداقل ۳۰ ثانیه؛ RESIDENTS_HOUSEKEEPING_THROTTLE_MS)، تا حتی بدون cron درست کار کند:
 *   • تخلیه‌های زمان‌بندی‌شده‌ای که تاریخشان رسیده (قاعده ۶)
 *   • پایان خودکار دسترسی پرستار/کمک‌کار در end_date (قاعده ۹)
 *   • انقضای درخواست کودک بعد از ۳۰ دقیقه (قاعده ۸)
 *   • پیشنهاد تبدیل حساب کودک ۱۸ ساله به بزرگسال (قاعده ۱۰)
 */
@Injectable()
export class HousekeepingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HousekeepingService.name)
  private timer: NodeJS.Timeout | null = null
  private readonly last = new Map<string, number>()

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    if (process.env.RESIDENTS_HOUSEKEEPING === 'off') return
    this.timer = setInterval(() => void this.runAll(), 5 * 60_000)
    this.timer.unref()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async runAll() {
    try {
      const tenants = await this.db.withPlatformAccess(async (c) => (await c.query<{ id: string }>(`SELECT id FROM identity.tenants`)).rows)
      for (const t of tenants) await this.run(t.id, true)
    } catch (e) {
      this.logger.error(`housekeeping ناموفق بود: ${(e as Error).message}`)
    }
  }

  /** پیش از خواندن‌های مهم صدا زده می‌شود؛ خطایش هرگز درخواست کاربر را خراب نمی‌کند */
  async touch(tenantId: string | null | undefined) {
    if (!tenantId) return
    try {
      await this.run(tenantId)
    } catch (e) {
      this.logger.warn(`housekeeping ${tenantId}: ${(e as Error).message}`)
    }
  }

  async run(tenantId: string, force = false) {
    const now = Date.now()
    const throttle = Number(process.env.RESIDENTS_HOUSEKEEPING_THROTTLE_MS ?? 30_000)
    if (!force && now - (this.last.get(tenantId) ?? 0) < throttle) return
    this.last.set(tenantId, now)

    await this.db.withTenant(tenantId, async (client) => {
      // ۱) تخلیه‌های رسیده
      const due = await client.query<{ id: string }>(
        `SELECT id FROM residency.move_outs WHERE status = 'scheduled' AND move_out_date <= (now() AT TIME ZONE 'Asia/Tehran')::date`,
      )
      for (const mo of due.rows) await executeMoveOut(client, tenantId, mo.id, null)

      // ۲) پایان دسترسی پرستار (و هر عضویت موقتی که end_date اجباری دارد)
      const expired = await client.query<{ id: string; user_id: string; unit_id: string }>(
        `UPDATE residency.memberships SET status = 'ended', ended_at = now(), updated_at = now()
          WHERE role = 'caregiver' AND status IN ('invited', 'active') AND end_date < (now() AT TIME ZONE 'Asia/Tehran')::date
          RETURNING id, user_id, unit_id`,
      )
      if (expired.rowCount) {
        await revokeSessions(client, expired.rows.map((r) => r.user_id))
        for (const r of expired.rows) {
          await writeAudit(client, tenantId, null, 'membership.expired', {
            summary: 'دسترسی پرستار در تاریخ پایان خودکار قطع شد',
            member_user_id: r.user_id,
            membership_id: r.id,
            unit_id: r.unit_id,
          })
        }
      }

      // ۳) درخواست‌های منقضی‌شده‌ی کودک
      const stale = await client.query<{ id: string; user_id: string }>(
        `UPDATE residency.child_requests r SET status = 'expired'
           FROM residency.memberships m
          WHERE m.id = r.child_membership_id AND r.status = 'pending' AND r.expires_at <= now()
          RETURNING r.id, m.user_id`,
      )
      for (const r of stale.rows) {
        await notify(client, tenantId, { person: r.user_id }, {
          kind: 'child_request_expired',
          title: 'درخواستت لغو شد',
          body: 'در ۳۰ دقیقه پاسخی نیامد',
          ref: r.id,
        })
      }

      // ۴) کودکی که ۱۸ ساله شده → پیشنهاد تبدیل به بزرگسال به سرپرست (یک بار)
      const grown = await client.query<{ id: string; unit_id: string; name: string }>(
        `SELECT m.id, m.unit_id, p.name FROM residency.memberships m JOIN residency.users p ON p.id = m.user_id
          WHERE m.role = 'child' AND m.status = 'active' AND p.birth_year IS NOT NULL
            AND $1 - p.birth_year >= 18 AND NOT (m.settings ? 'adult_suggested_at')`,
        [currentJalaliYear()],
      )
      for (const g of grown.rows) {
        const head = (await client.query<{ user_id: string }>(
          `SELECT user_id FROM residency.memberships WHERE unit_id = $1 AND role = 'head' AND status = 'active'`, [g.unit_id])).rows[0]
        if (head) {
          await notify(client, tenantId, { person: head.user_id }, {
            kind: 'child_turned_adult',
            title: `${g.name} ${fa(18)} ساله شد`,
            body: 'پیشنهاد می‌شود حساب او به بزرگسال تبدیل شود',
            link: '/resident/family',
            ref: g.id,
          })
        }
        await client.query(`UPDATE residency.memberships SET settings = settings || jsonb_build_object('adult_suggested_at', now()) WHERE id = $1`, [g.id])
      }
    })
  }
}
