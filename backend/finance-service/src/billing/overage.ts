import type { PoolClient } from 'pg'
import type { OverageItem, OverageSummary } from './charge-calc'

export interface PendingOverageRow {
  unit_id: string
  event_id: string
  service: string
  variant: string | null
  period: string
  overage_qty: number
  unit_label: string
  amount: number
}

export interface UnitOverage extends OverageSummary { event_ids: string[] }

/** گروه‌بندی ردیف‌های مازاد هر واحد به «خدمت × نوع × دوره» (برای نمایش در ریز شارژ) — تابع خالص */
export function groupOverage(rows: PendingOverageRow[]): Map<string, UnitOverage> {
  const out = new Map<string, UnitOverage>()
  const index = new Map<string, OverageItem>()
  for (const r of rows) {
    if (!(r.amount > 0)) continue
    let u = out.get(r.unit_id)
    if (!u) { u = { total: 0, items: [], event_ids: [] }; out.set(r.unit_id, u) }
    const key = `${r.unit_id}|${r.service}|${r.variant ?? ''}|${r.period}`
    let it = index.get(key)
    if (!it) {
      it = { service: r.service, variant: r.variant, period: r.period, quantity: 0, unit_label: r.unit_label, amount: 0 }
      index.set(key, it)
      u.items.push(it)
    }
    it.quantity = Math.round((it.quantity + r.overage_qty) * 100) / 100
    it.amount += r.amount
    u.total += r.amount
    u.event_ids.push(r.event_id)
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
  return groupOverage(r.rows.map((x) => ({ ...x, overage_qty: Number(x.overage_qty), amount: Number(x.amount) })))
}

/** مصرف‌های داخل شارژ صادرشده را «به شارژ رفته» علامت می‌زند؛ فریز می‌شوند (نه ابطال، نه محاسبه‌ی مجدد) */
export async function markOverageBilled(client: PoolClient, chargeId: string, eventIds: string[]): Promise<void> {
  if (!eventIds.length) return
  await client.query(
    `UPDATE entitlement.usage_events SET billed_charge_id = $1, billed_at = now()
      WHERE id = ANY($2::uuid[]) AND billed_charge_id IS NULL`,
    [chargeId, eventIds],
  )
}
