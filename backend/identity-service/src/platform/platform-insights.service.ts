import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { toJalali } from '../residents/jalali'
import { getTier } from './tiers'

export type InvoiceStatus = 'pending' | 'paid' | 'failed' | 'void'

/** ماه شمسی جاری به‌صورت «1405-07» (ASCII، قابل مرتب‌سازی) */
export function currentJalaliPeriod(now = new Date()): string {
  const { jy, jm } = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return `${jy}-${String(jm).padStart(2, '0')}`
}

interface TenantStatRow {
  id: string
  name: string
  subdomain: string
  status: string
  tier: string
  unit_count: number
  monthly_fee: string
  outstanding_amount: string
  billing_status: string
  created_at: Date
}

/**
 * خواندنی‌ها و فاکتورهای سطح پلتفرم. شمارش واحد/ساکن از جدول‌های RLS-دار هر ساختمان با
 * withTenant همان ساختمان انجام می‌شود (بدون دور زدن RLS و بدون نیاز به نقش BYPASSRLS).
 */
@Injectable()
export class PlatformInsightsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  private async allTenants(): Promise<TenantStatRow[]> {
    return this.db.withPlatformAccess(async (c) => {
      const r = await c.query<TenantStatRow>(
        `SELECT id, name, subdomain, status, tier, unit_count, monthly_fee, outstanding_amount, billing_status, created_at
           FROM identity.tenants ORDER BY created_at DESC`,
      )
      return r.rows
    })
  }

  /** شمارنده‌های واقعی هر ساختمان: واحدهای ثبت‌شده، ساکنان فعال، کاربران ورود */
  private async usage(tenantId: string) {
    return this.db.withTenant(tenantId, async (c: PoolClient) => {
      const r = await c.query<{ units: string; residents: string; admins: string; staff: string }>(
        `SELECT (SELECT count(*) FROM property.units) AS units,
                (SELECT count(DISTINCT user_id) FROM residency.memberships WHERE status = 'active' AND role <> 'owner_absent') AS residents,
                (SELECT count(*) FROM identity.users WHERE role = 'admin' AND is_active) AS admins,
                (SELECT count(*) FROM identity.users WHERE role IN ('staff','guard','accountant') AND is_active) AS staff`,
      )
      const x = r.rows[0]
      return { units: Number(x.units), residents: Number(x.residents), admins: Number(x.admins), staff: Number(x.staff) }
    })
  }

  async listTenants() {
    const rows = await this.allTenants()
    const out = []
    // به‌صورت دسته‌های کوچک تا اتصال‌های Pool تمام نشود
    for (let i = 0; i < rows.length; i += 5) {
      const chunk = rows.slice(i, i + 5)
      const usages = await Promise.all(chunk.map((t) => this.usage(t.id)))
      chunk.forEach((t, j) => {
        const u = usages[j]
        out.push({
          id: t.id,
          name: t.name,
          subdomain: t.subdomain,
          status: t.status,
          tier: t.tier,
          plan: getTier(t.tier as never).label,
          /** سقف قراردادی واحد (در قرارداد) و مصرف واقعی ثبت‌شده در سامانه */
          unitLimit: Number(t.unit_count),
          unitCount: u.units,
          residentCount: u.residents,
          adminCount: u.admins,
          staffCount: u.staff,
          monthlyFee: Number(t.monthly_fee),
          outstandingAmount: Number(t.outstanding_amount),
          billingStatus: t.billing_status,
          joinedAt: new Date(t.created_at).toISOString(),
        })
      })
    }
    return { tenants: out }
  }

  /** KPIهای داشبورد — همگی از DB محاسبه می‌شوند */
  async summary() {
    const { tenants } = await this.listTenants()
    const active = tenants.filter((t) => t.status === 'active')
    const period = currentJalaliPeriod()
    const inv = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query<{ k: string; n: string; s: string }>(
        `SELECT status AS k, count(*) AS n, COALESCE(sum(amount), 0) AS s FROM identity.platform_invoices WHERE period = $1 GROUP BY status
         UNION ALL
         SELECT 'paid_30d', count(*), COALESCE(sum(amount), 0) FROM identity.platform_invoices WHERE status = 'paid' AND paid_at > now() - interval '30 days'`,
        [period],
      )
      return r.rows
    })
    const get = (k: string) => inv.find((x) => x.k === k)
    return {
      period,
      totalTenants: tenants.length,
      activeTenants: active.length,
      trialTenants: tenants.filter((t) => t.status === 'trial').length,
      suspendedTenants: tenants.filter((t) => t.status === 'suspended').length,
      totalMrr: active.reduce((s, t) => s + t.monthlyFee, 0),
      totalUnitsManaged: tenants.reduce((s, t) => s + t.unitCount, 0),
      totalResidents: tenants.reduce((s, t) => s + t.residentCount, 0),
      totalOutstanding: tenants.reduce((s, t) => s + t.outstandingAmount, 0),
      overdueTenants: tenants.filter((t) => t.billingStatus === 'overdue').length,
      invoices: {
        thisPeriod: ['pending', 'paid', 'failed', 'void'].reduce((s, k) => s + Number(get(k)?.n ?? 0), 0),
        pending: Number(get('pending')?.n ?? 0),
        paid: Number(get('paid')?.n ?? 0),
        failed: Number(get('failed')?.n ?? 0),
        paidAmountLast30Days: Number(get('paid_30d')?.s ?? 0),
      },
      recentTenants: tenants.slice(0, 5),
    }
  }

  /* ───────────── فاکتورهای اشتراک ───────────── */

  async listInvoices(filter: { tenantId?: string; status?: string; period?: string }) {
    const where: string[] = []
    const vals: unknown[] = []
    if (filter.tenantId) { vals.push(filter.tenantId); where.push(`i.tenant_id = $${vals.length}`) }
    if (filter.status) { vals.push(filter.status); where.push(`i.status = $${vals.length}`) }
    if (filter.period) { vals.push(filter.period); where.push(`i.period = $${vals.length}`) }
    const rows = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query(
        `SELECT i.id, i.tenant_id, t.name AS tenant_name, i.period, i.amount, i.status, i.issued_at, i.due_at, i.paid_at, i.note
           FROM identity.platform_invoices i JOIN identity.tenants t ON t.id = i.tenant_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY i.period DESC, t.name LIMIT 500`,
        vals,
      )
      return r.rows
    })
    return {
      invoices: rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        period: r.period as string,
        amount: Number(r.amount),
        status: r.status as InvoiceStatus,
        issuedAt: toDate(r.issued_at),
        dueAt: toDate(r.due_at),
        paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
        note: r.note as string | null,
      })),
    }
  }

  /** صدور فاکتور یک ساختمان؛ مبلغ پیش‌فرض = اشتراک ماهانه‌ی قرارداد. مانده‌ی بدهی ساختمان بالا می‌رود. */
  async createInvoice(dto: { tenantId: string; period?: string; amount?: number; dueInDays?: number; note?: string }) {
    const period = dto.period ?? currentJalaliPeriod()
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new BadRequestException('دوره باید به‌صورت 1405-07 باشد')
    const id = await this.db.withPlatformAccess(async (c) => {
      const t = await c.query<{ monthly_fee: string }>('SELECT monthly_fee FROM identity.tenants WHERE id = $1', [dto.tenantId])
      if (!t.rows[0]) throw new NotFoundException('ساختمان یافت نشد')
      const amount = dto.amount ?? Number(t.rows[0].monthly_fee)
      const r = await c.query<{ id: string }>(
        `INSERT INTO identity.platform_invoices (tenant_id, period, amount, due_at, note)
         VALUES ($1, $2, $3, CURRENT_DATE + $4::int, $5)
         ON CONFLICT (tenant_id, period) DO NOTHING RETURNING id`,
        [dto.tenantId, period, amount, dto.dueInDays ?? 10, dto.note ?? null],
      )
      if (!r.rows[0]) throw new BadRequestException(`برای دوره‌ی ${period} قبلاً فاکتور صادر شده است`)
      await this.syncOutstanding(c, dto.tenantId)
      return r.rows[0].id
    })
    this.events.publish('platform.invoice_created', { invoiceId: id, tenantId: dto.tenantId, period })
    return (await this.listInvoices({ tenantId: dto.tenantId, period })).invoices.find((i) => i.id === id)
  }

  /** صدور گروهی فاکتور دوره‌ی جاری برای همه‌ی مجتمع‌های فعال (idempotent) */
  async generateInvoices(period = currentJalaliPeriod()) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new BadRequestException('دوره باید به‌صورت 1405-07 باشد')
    return this.db.withPlatformAccess(async (c) => {
      const r = await c.query<{ tenant_id: string }>(
        `INSERT INTO identity.platform_invoices (tenant_id, period, amount, due_at)
         SELECT id, $1, monthly_fee, CURRENT_DATE + 10 FROM identity.tenants WHERE status = 'active' AND monthly_fee > 0
         ON CONFLICT (tenant_id, period) DO NOTHING RETURNING tenant_id`,
        [period],
      )
      for (const row of r.rows) await this.syncOutstanding(c, row.tenant_id)
      return { period, created: r.rowCount ?? 0 }
    })
  }

  async setInvoiceStatus(id: string, status: Exclude<InvoiceStatus, 'pending'> | 'pending') {
    const tenantId = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query<{ tenant_id: string }>(
        `UPDATE identity.platform_invoices
            SET status = $2, paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE NULL END
          WHERE id = $1 RETURNING tenant_id`,
        [id, status],
      )
      if (!r.rows[0]) throw new NotFoundException('فاکتور یافت نشد')
      await this.syncOutstanding(c, r.rows[0].tenant_id)
      return r.rows[0].tenant_id
    })
    this.events.publish('platform.invoice_updated', { invoiceId: id, tenantId, status })
    return { ok: true, status }
  }

  /**
   * مانده‌ی بدهی و وضعیت تسویه‌ی ساختمان را از روی فاکتورها بازمحاسبه می‌کند
   * (فقط وقتی ساختمان فاکتور دارد؛ ساختمان بدون فاکتور مقدار دستی خودش را حفظ می‌کند).
   */
  private async syncOutstanding(c: PoolClient, tenantId: string) {
    await c.query(
      `WITH s AS (
         SELECT COALESCE(sum(amount) FILTER (WHERE status IN ('pending','failed')), 0) AS owed,
                bool_or(status IN ('pending','failed') AND due_at < CURRENT_DATE) AS late,
                max(paid_at) FILTER (WHERE status = 'paid') AS last_paid,
                count(*) AS n
           FROM identity.platform_invoices WHERE tenant_id = $1 AND status <> 'void')
       UPDATE identity.tenants t SET
              outstanding_amount = s.owed,
              billing_status = CASE WHEN s.owed = 0 THEN 'settled' WHEN s.late THEN 'overdue' ELSE 'due' END,
              last_payment_at = COALESCE(s.last_paid::date, t.last_payment_at)
         FROM s WHERE t.id = $1 AND s.n > 0`,
      [tenantId],
    )
  }

  /* ───────────── خروجی کامل داده‌ی یک ساختمان (پشتیبان‌گیری/انتقال) ───────────── */

  /**
   * همه‌ی جدول‌های دارای tenant_id (به‌جز پارتیشن‌ها، توکن‌ها و هش رمز) برای یک ساختمان، در یک
   * تراکنش با RLS همان ساختمان. معادل HTTP اسکریپت scripts/export-tenant.sh.
   */
  async exportTenant(tenantId: string) {
    const tenant = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query('SELECT * FROM identity.tenants WHERE id = $1', [tenantId])
      return r.rows[0]
    })
    if (!tenant) throw new NotFoundException('ساختمان یافت نشد')
    const data = await this.db.withTenant(tenantId, async (c) => {
      const tables = await c.query<{ s: string; t: string }>(
        `SELECT n.nspname AS s, cl.relname AS t
           FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
           JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
          WHERE cl.relkind IN ('r','p') AND NOT cl.relispartition
            AND n.nspname IN ('identity','property','residency','facility','finance','guard','notification','audit','fnb')
            AND NOT (n.nspname = 'identity' AND cl.relname IN ('refresh_tokens','platform_invoices'))
          ORDER BY 1, 2`,
      )
      const out: Record<string, unknown[]> = {}
      for (const { s, t } of tables.rows) {
        const cols = await c.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2
              AND column_name NOT IN ('password_hash', 'exit_pin_hash', 'token_hash', 'token') ORDER BY ordinal_position`,
          [s, t],
        )
        const list = cols.rows.map((x) => `"${x.column_name}"`).join(', ')
        const rows = await c.query(`SELECT ${list} FROM "${s}"."${t}"`)
        out[`${s}.${t}`] = rows.rows
      }
      return out
    })
    this.events.publish('platform.tenant_exported', { tenantId })
    return {
      exportedAt: new Date().toISOString(),
      format: 'hamin-tenant-export/1',
      tenant: { id: tenant.id, name: tenant.name, subdomain: tenant.subdomain, tier: tenant.tier, status: tenant.status },
      counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
      tables: data,
    }
  }
}

/** ستون DATE را pg به‌صورت نیمه‌شب «محلی» می‌خواند؛ پس با getterهای محلی فرمت می‌کنیم نه toISOString */
function toDate(v: Date | string | null): string | null {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
}
