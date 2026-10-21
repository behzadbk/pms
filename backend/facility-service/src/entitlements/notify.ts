import type { PoolClient } from 'pg'

/** ساکنان فعال واحد که باید اعلان بگیرند (سرپرست، بزرگسال، سالمند) */
export async function unitRecipients(client: PoolClient, unitId: string) {
  const r = await client.query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM residency.memberships WHERE unit_id = $1 AND status = 'active' AND role IN ('head','adult','senior')`,
    [unitId],
  )
  return r.rows.map((x) => ({ person: x.user_id }))
}

/** اعلان درون‌برنامه‌ای — درج در notification.inbox (تریگر + notification-service پوش را می‌فرستند) */
export async function notify(
  client: PoolClient,
  tenantId: string,
  to: { person?: string | null; role?: string | null }[],
  n: { kind: string; title: string; body?: string | null; link?: string | null; ref?: string | null },
) {
  for (const r of to) {
    if (!r.person && !r.role) continue
    await client.query(
      `INSERT INTO notification.inbox (tenant_id, recipient_person, recipient_role, kind, title, body, link, ref_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, r.person ?? null, r.role ?? null, n.kind, n.title, n.body ?? null, n.link ?? null, n.ref ?? null],
    )
  }
}

export const faDigits = (s: string | number) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
export const faMoney = (n: number) => faDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬')
