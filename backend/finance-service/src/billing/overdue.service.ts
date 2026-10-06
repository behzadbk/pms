import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { computeLateFee } from './charge-calc'
import { SettingsService, lateFeeRuleOf } from './settings.service'
import { notify, payersByUnit } from './notify'
import { formatJalali, periodLabel, periodOfIso, tehranToday } from '../common/jalali'

export interface OverdueResult { marked: number; feesUpdated: number; notified: number }

/**
 * کار روزانه‌ی مالی (داخل خود finance-service؛ بدون وابستگی بیرونی):
 *  ۱) شارژهای پرداخت‌نشده‌ی گذشته از سررسید ⇒ status = overdue (و یک اعلان به ساکن، فقط یک‌بار)
 *  ۲) اگر مدیر جریمه را فعال کرده باشد: late_fee_amount = جریمه‌ی تجمعی تا «امروزِ تهران» (تابع خالص ⇒
 *     اجرای چندباره در یک روز هیچ‌وقت دوباره‌شارژ نمی‌کند)
 * قفل advisory دیتابیس جلوی اجرای هم‌زمان چند نمونه‌ی سرویس را می‌گیرد.
 */
@Injectable()
export class OverdueService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OverdueService.name)
  private timer?: NodeJS.Timeout
  private lastRunDate: string | null = null

  constructor(private readonly db: DatabaseService, private readonly settings: SettingsService) {}

  async onModuleInit() {
    if (process.env.FINANCE_JOBS === 'off') return
    // اول: تبدیل دوره‌های میلادی قدیمی به شمسی (یک‌بار؛ idempotent)
    await this.normalizeLegacyPeriods().catch((e) => this.log.error(`تبدیل دوره‌های قدیمی ناموفق: ${e.message}`))
    // هر ۱۰ دقیقه بررسی می‌کند؛ بعد از ۰۰:۱۰ تهران روزی یک‌بار اجرا می‌شود (و در استارت هم اگر امروز اجرا نشده)
    this.timer = setInterval(() => void this.tick(), 10 * 60_000)
    this.timer.unref?.()
    setTimeout(() => void this.tick(), 15_000).unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private async tick() {
    const today = tehranToday()
    if (this.lastRunDate === today) return
    try {
      await this.runAll(today)
      this.lastRunDate = today
    } catch (e) {
      this.log.error(`اجرای job مالی ناموفق: ${(e as Error).message}`)
    }
  }

  /** همه‌ی ساختمان‌های فعال — با قفل advisory */
  async runAll(today = tehranToday()) {
    await this.db.withPlatformAccess(async (lock) => {
      // قفل advisory با کلید ثابت (۷۴۰۰۴۲) بین همه‌ی نمونه‌های سرویس مشترک است. «try» یعنی منتظر نمی‌ماند: اگر نمونه‌ی
      // دیگری همین حالا job را اجرا می‌کند، این اجرا کنار می‌رود. قفل در سطح اتصال است؛ پس باید با همین اتصال (lock) آزاد شود (finally).
      const got = await lock.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(740042) AS ok`)
      if (!got.rows[0].ok) return
      try {
        const tenants = await lock.query<{ id: string }>(`SELECT id FROM identity.tenants WHERE status IN ('active', 'trial')`)
        for (const t of tenants.rows) {
          try {
            const r = await this.db.withTenant(t.id, (c) => this.runForTenant(c, t.id, today))
            if (r.marked || r.feesUpdated) this.log.log(`tenant ${t.id}: ${r.marked} معوق، ${r.feesUpdated} جریمه به‌روز شد`)
          } catch (e) {
            this.log.error(`tenant ${t.id}: ${(e as Error).message}`)
          }
        }
      } finally {
        await lock.query(`SELECT pg_advisory_unlock(740042)`)
      }
    })
  }

  async runForTenant(client: PoolClient, tenantId: string, today = tehranToday()): Promise<OverdueResult> {
    const rule = lateFeeRuleOf(await this.settings.get(client, tenantId))
    // شارژهای گذشته از سررسید و هنوز پرداخت‌نشده. FOR UPDATE ردیف‌ها را قفل می‌کند تا هم‌زمان با ثبت یک پرداخت،
    // جمع کل (total_amount) نادرست بازنویسی نشود.
    const due = await client.query<{ id: string; unit_id: string; period: string; status: string; due_date: string; base_amount: number; late_fee_amount: number; late_fee_waived: boolean; overdue_notified_at: string | null; total_amount: number }>(
      `SELECT id, unit_id, period, status, due_date, base_amount, late_fee_amount, late_fee_waived, overdue_notified_at, total_amount
         FROM finance.monthly_charges
        WHERE status IN ('pending', 'overdue') AND due_date IS NOT NULL AND due_date < $1::date
        FOR UPDATE`,
      [today],
    )
    const res: OverdueResult = { marked: 0, feesUpdated: 0, notified: 0 }
    const toNotify: typeof due.rows = []
    for (const c of due.rows) {
      // سه حالت جریمه: ۱) مدیر جریمه را بخشیده ⇒ مقدار فعلی ثابت می‌ماند؛ ۲) قاعده فعال است ⇒ جریمه‌ی تجمعی تا امروز
      // دوباره از صفر حساب می‌شود (تابع خالص، نه افزایشی)؛ ۳) قاعده خاموش است ⇒ مقدار فعلی بدون تغییر.
      const fee = c.late_fee_waived ? c.late_fee_amount : rule.enabled ? computeLateFee(c.base_amount, c.due_date, today, rule) : c.late_fee_amount
      const feeChanged = fee !== c.late_fee_amount
      const statusChanged = c.status !== 'overdue'
      // اگر هیچ‌چیز عوض نشده ننویس: اجرای چندباره‌ی job در یک روز هیچ UPDATE/اعلان اضافه‌ای نمی‌سازد (idempotent).
      if (!feeChanged && !statusChanged) continue
      await client.query(
        `UPDATE finance.monthly_charges
            SET status = 'overdue', late_fee_amount = $2, total_amount = base_amount + $2,
                late_fee_through = CASE WHEN $3 THEN $4::date ELSE late_fee_through END, updated_at = now()
          WHERE id = $1`,
        [c.id, fee, feeChanged, today],
      )
      if (statusChanged) res.marked++
      if (feeChanged) res.feesUpdated++
      // اعلان «سررسید گذشته» برای هر شارژ فقط یک‌بار در عمرش ارسال می‌شود (overdue_notified_at بعد از ارسال پر می‌شود).
      if (!c.overdue_notified_at) toNotify.push({ ...c, late_fee_amount: fee })
    }

    const payers = await payersByUnit(client, toNotify.map((c) => c.unit_id))
    for (const c of toNotify) {
      const persons = payers.get(c.unit_id) ?? []
      if (persons.length) res.notified++
      await notify(client, tenantId, persons.map((p) => ({ person: p })), {
        kind: 'charge_overdue',
        title: `شارژ ${periodLabel(c.period)} سررسید گذشته است`,
        body: `مبلغ ${(c.base_amount + c.late_fee_amount).toLocaleString('fa-IR')} تومان — سررسید ${formatJalali(c.due_date)}`,
        link: '/resident/charges',
        ref: c.id,
      })
      await client.query(`UPDATE finance.monthly_charges SET overdue_notified_at = now() WHERE id = $1`, [c.id])
    }
    return res
  }

  /**
   * seed/دادهٔ قدیمی دوره را میلادی ('2026-10') ذخیره کرده بود؛ اکنون دوره همیشه شمسی است.
   * هر دوره‌ی میلادی به ماه شمسیِ میانه‌ی آن ماه تبدیل می‌شود (اگر معادل شمسی از قبل نبود).
   */
  async normalizeLegacyPeriods() {
    await this.db.withPlatformAccess(async (c) => {
      const tenants = await c.query<{ id: string }>(`SELECT id FROM identity.tenants`)
      for (const t of tenants.rows) {
        await this.db.withTenant(t.id, async (client) => {
          // دوره‌های شمسی با 13xx/14xx شروع می‌شوند و میلادی با 19xx/20xx؛ این regex فقط میلادی‌های قدیمی را می‌گیرد.
          const legacy = await client.query<{ period: string }>(`SELECT DISTINCT period FROM finance.monthly_charges WHERE period ~ '^(19|2[0-9])[0-9]{2}-'`)
          for (const { period } of legacy.rows) {
            const [gy, gm] = period.split('-').map(Number)
            const target = periodOfIso(`${gy}-${String(gm).padStart(2, '0')}-15`)
            await client.query(
              `UPDATE finance.monthly_charges c SET period = $2
                WHERE c.period = $1 AND NOT EXISTS (SELECT 1 FROM finance.monthly_charges x WHERE x.unit_id = c.unit_id AND x.period = $2)`,
              [period, target],
            )
          }
        })
      }
    })
  }
}
