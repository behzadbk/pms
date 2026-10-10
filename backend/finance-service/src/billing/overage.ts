import type { PoolClient } from 'pg'
import type { OverageItem, OverageSummary } from './charge-calc'
import { periodOfIso, tehranToday } from '../common/jalali'

export interface PendingOverageRow {
  unit_id: string
  /** شناسه‌ی رویداد مصرف (kind='service') یا سفارش (kind='fnb') */
  event_id: string
  kind?: 'service' | 'fnb'
  service: string
  variant: string | null
  period: string
  overage_qty: number
  unit_label: string
  amount: number
}

export interface UnitOverage extends OverageSummary { event_ids: string[]; order_ids: string[] }

/** گروه‌بندی ردیف‌های مازاد هر واحد به «خدمت × نوع × دوره» (برای نمایش در ریز شارژ) — تابع خالص */
export function groupOverage(rows: PendingOverageRow[]): Map<string, UnitOverage> {
  const out = new Map<string, UnitOverage>()
  const index = new Map<string, OverageItem>()
  for (const r of rows) {
    if (!(r.amount > 0)) continue
    let u = out.get(r.unit_id)
    if (!u) { u = { total: 0, items: [], event_ids: [], order_ids: [] }; out.set(r.unit_id, u) }
    const kind = r.kind ?? 'service'
    const key = `${r.unit_id}|${kind}|${r.service}|${r.variant ?? ''}|${r.period}`
    let it = index.get(key)
    if (!it) {
      it = { ...(kind === 'fnb' ? { kind } : {}), service: r.service, variant: r.variant, period: r.period, quantity: 0, unit_label: r.unit_label, amount: 0 }
      index.set(key, it)
      u.items.push(it)
    }
    it.quantity = Math.round((it.quantity + r.overage_qty) * 100) / 100
    it.amount += r.amount
    u.total += r.amount
    ;(kind === 'fnb' ? u.order_ids : u.event_ids).push(r.event_id)
  }
  return out
}

/**
 * مازادِ هنوز-به-شارژ-نرفته‌ی همه‌ی واحدها برای دوره‌های «قبل از» beforePeriod
 * (مصرف ماه P روی شارژ ماه P+1 می‌نشیند؛ ماه‌های جاافتاده هم جمع می‌شوند).
 */
export async function pendingOverage(client: PoolClient, beforePeriod: string): Promise<Map<string, UnitOverage>> {
  const r = await client.query<PendingOverageRow>(
    `SELECT e.unit_id, e.id AS event_id, s.title AS service, t.title AS variant, e.period,
            e.overage_qty AS overage_qty, s.unit_label, e.amount AS amount
       FROM entitlement.usage_events e
       JOIN entitlement.services s ON s.id = e.service_id
       LEFT JOIN entitlement.tariffs t ON t.id = e.tariff_id
      WHERE e.status = 'active' AND e.billed_charge_id IS NULL AND e.amount > 0 AND e.period < $1
      ORDER BY e.unit_id, e.period, e.occurred_at`,
    [beforePeriod],
  )
  const service: PendingOverageRow[] = r.rows.map((x) => ({ ...x, overage_qty: Number(x.overage_qty), amount: Number(x.amount) }))

  // سفارش‌های تحویل‌شده‌ی کافه/رستوران که هنوز به شارژی نرفته‌اند (سفارش ماه P روی شارژ ماه P+1 می‌نشیند).
  // دوره از زمان «تحویل» به وقت تهران می‌آید؛ سفارش‌های قبل از راه‌اندازی صورتحساب (bill_exempt) شمرده نمی‌شوند.
  const f = await client.query<{ unit_id: string; event_id: string; service: string; delivered_at: string; amount: string }>(
    `SELECT o.unit_id, o.id AS event_id, v.name AS service, o.delivered_at, o.total AS amount
       FROM fnb.orders o JOIN fnb.venues v ON v.id = o.venue_id
      WHERE o.status = 'delivered' AND o.billed_charge_id IS NULL AND NOT o.bill_exempt
        AND o.total > 0 AND o.delivered_at IS NOT NULL
      ORDER BY o.unit_id, o.delivered_at`,
  )
  const fnb: PendingOverageRow[] = f.rows
    .map((x) => ({ unit_id: x.unit_id, event_id: x.event_id, kind: 'fnb' as const, service: x.service, variant: null, period: periodOfIso(tehranToday(new Date(x.delivered_at))), overage_qty: 1, unit_label: 'سفارش', amount: Number(x.amount) }))
    .filter((x) => x.period < beforePeriod)
  return groupOverage([...service, ...fnb])
}

/**
 * مصرف‌ها و سفارش‌های داخل شارژ صادرشده را «به شارژ رفته» علامت می‌زند؛ فریز می‌شوند (نه ابطال، نه محاسبه‌ی مجدد).
 * orderIds = سفارش‌های کافه/رستوران (fnb.orders)
 */
export async function markOverageBilled(client: PoolClient, chargeId: string, eventIds: string[], orderIds: string[] = []): Promise<void> {
  if (eventIds.length) {
    await client.query(
      `UPDATE entitlement.usage_events SET billed_charge_id = $1, billed_at = now()
        WHERE id = ANY($2::uuid[]) AND billed_charge_id IS NULL`,
      [chargeId, eventIds],
    )
  }
  if (orderIds.length) {
    await client.query(
      `UPDATE fnb.orders SET billed_charge_id = $1, billed_at = now()
        WHERE id = ANY($2::uuid[]) AND billed_charge_id IS NULL`,
      [chargeId, orderIds],
    )
  }
}
