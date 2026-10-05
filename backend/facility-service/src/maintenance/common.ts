import { ForbiddenException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s)

/** کارمند نگهداری: نقش staff با دسترسی maintenance */
export const isMaint = (u: JwtPayload) => u.role === 'staff' && (u.perms ?? []).includes('maintenance')
export const isAdmin = (u: JwtPayload) => u.role === 'admin'
export const canManage = (u: JwtPayload) => isAdmin(u) || isMaint(u)

export function requireManage(u: JwtPayload) {
  if (!canManage(u)) throw new ForbiddenException('فقط مدیر یا کارمند نگهداری')
}
export function requireAdmin(u: JwtPayload) {
  if (!isAdmin(u)) throw new ForbiddenException('فقط مدیر ساختمان')
}

export interface Target { person?: string | null; login?: string | null; role?: string | null }

/** نوشتن در صندوق اعلان — trigger دیتابیس و push-listener خودکار push می‌فرستند */
export async function notify(
  client: PoolClient, tenantId: string, to: Target[],
  n: { kind: string; title: string; body?: string | null; link?: string | null; ref?: string | null },
) {
  const seen = new Set<string>()
  for (const r of to) {
    if (!r.person && !r.login && !r.role) continue
    const key = `${r.person ?? ''}|${r.login ?? ''}|${r.role ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    await client.query(
      `INSERT INTO notification.inbox (tenant_id, recipient_person, recipient_login, recipient_role, kind, title, body, link, ref_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tenantId, r.person ?? null, r.login ?? null, r.role ?? null, n.kind, n.title, n.body ?? null, n.link ?? null, n.ref ?? null],
    )
  }
}

export async function audit(client: PoolClient, tenantId: string, user: JwtPayload | null, action: string, body: Record<string, unknown>) {
  await client.query(
    `INSERT INTO audit.event_logs (tenant_id, session_id, user_id, actor_role, source, level, action, request_body)
     VALUES ($1, $2, $3, $4, 'facility-svc', 'info', $5, $6)`,
    [tenantId, randomUUID(), user && isUuid(user.sub) ? user.sub : null, user?.role ?? 'system', action, JSON.stringify(body)],
  )
}

/** نام نمایشی کاربر جاری (حساب ورود یا شخص) */
export async function actorName(client: PoolClient, user: JwtPayload): Promise<string> {
  if (isUuid(user.sub)) {
    const r = await client.query<{ full_name: string }>(`SELECT full_name FROM identity.users WHERE id = $1`, [user.sub])
    if (r.rows[0]) return r.rows[0].full_name
  }
  if (user.pid) {
    const r = await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [user.pid])
    if (r.rows[0]) return r.rows[0].name
  }
  return user.email || 'کاربر'
}

export const fa = (s: string | number) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

export const TICKET_STATUS_FA: Record<string, string> = {
  open: 'باز', assigned: 'ارجاع‌شده', in_progress: 'در حال انجام', resolved: 'حل‌شده', closed: 'بسته',
}
export const PRIORITY_FA: Record<string, string> = { low: 'کم', normal: 'عادی', high: 'مهم', urgent: 'فوری' }
