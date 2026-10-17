import { randomUUID } from 'crypto'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'

export interface InboxTarget {
  /** residency.users.id (ساکن) */
  person?: string | null
  /** identity.users.id (مدیر / کارمند مشخص) */
  login?: string | null
  /** 'admin' | 'perm:service_desk' | … */
  role?: string | null
}
export interface InboxMessage {
  kind: string
  title: string
  body?: string | null
  link?: string | null
  ref?: string | null
}

/** اعلان درون‌برنامه‌ای — درج در notification.inbox (push را notification-service می‌فرستد) */
export async function notifyInbox(client: PoolClient, tenantId: string, to: InboxTarget[], n: InboxMessage) {
  for (const r of to) {
    if (!r.person && !r.login && !r.role) continue
    await client.query(
      `INSERT INTO notification.inbox (tenant_id, recipient_person, recipient_login, recipient_role, kind, title, body, link, ref_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tenantId, r.person ?? null, r.login ?? null, r.role ?? null, n.kind, n.title, n.body ?? null, n.link ?? null, n.ref ?? null],
    )
  }
}

/** ثبت در لاگ مرکزی (audit.event_logs) */
export async function auditLog(client: PoolClient, tenantId: string, user: JwtPayload, action: string, body: Record<string, unknown>) {
  await client.query(
    `INSERT INTO audit.event_logs (tenant_id, session_id, user_id, actor_role, source, level, action, request_body)
     VALUES ($1, $2, $3, $4, 'facility-svc', 'info', $5, $6)`,
    [tenantId, randomUUID(), /^[0-9a-f-]{36}$/i.test(user.sub) ? user.sub : null, user.role, action, JSON.stringify(body)],
  )
}

export const faDigits = (s: string | number) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

/** ارقام فارسی/عربی → انگلیسی (برای جستجوی شماره‌ی واحد) */
export const enDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

/** escape کاراکترهای ویژه‌ی LIKE */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
