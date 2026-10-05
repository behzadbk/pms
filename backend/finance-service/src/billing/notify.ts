import type { PoolClient } from 'pg'

/**
 * نوشتن اعلان در notification.inbox (همان شکل facility-service) — notification-svc با NOTIFY روی
 * ردیف جدید، push را برای گیرنده می‌فرستد. باید داخل withTenant صدا زده شود.
 */
export interface InboxTarget { person?: string | null; login?: string | null; role?: string | null }
export interface InboxNote { kind: string; title: string; body?: string | null; link?: string | null; ref?: string | null }

export async function notify(client: PoolClient, tenantId: string, to: InboxTarget[], n: InboxNote) {
  for (const r of to) {
    if (!r.person && !r.login && !r.role) continue
    await client.query(
      `INSERT INTO notification.inbox (tenant_id, recipient_person, recipient_login, recipient_role, kind, title, body, link, ref_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tenantId, r.person ?? null, r.login ?? null, r.role ?? null, n.kind, n.title, n.body ?? null, n.link ?? null, n.ref ?? null],
    )
  }
}

/**
 * «پرداخت‌کننده‌های شارژ» هر واحد: اعضای فعالِ دارای دسترسی مالی
 * (pays_charge یا سرپرست یا finance_access) — کودک/مراقب هرگز.
 */
export const FINANCE_ACCESS_SQL = `m.status = 'active' AND m.role NOT IN ('child', 'caregiver')
  AND (m.pays_charge OR m.role = 'head' OR (m.settings->>'finance_access') = 'true')`

export async function payersByUnit(client: PoolClient, unitIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (!unitIds.length) return out
  const res = await client.query<{ unit_id: string; user_id: string }>(
    `SELECT DISTINCT m.unit_id, m.user_id FROM residency.memberships m
      WHERE m.unit_id = ANY($1::uuid[]) AND ${FINANCE_ACCESS_SQL}`,
    [unitIds],
  )
  for (const r of res.rows) out.set(r.unit_id, [...(out.get(r.unit_id) ?? []), r.user_id])
  return out
}
