import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'

/** مدیر، نگهبان، یا کارمند با دسترسی «لابی» یا «نگهبانی» (برای ترددِ خودرو فقط security) */
export function assertDesk(user: JwtPayload, perms: string[] = ['lobby', 'security']) {
  if (user.role === 'admin' || user.role === 'guard') return
  if (user.role === 'staff' && (user.perms ?? []).some((p) => perms.includes(p))) return
  throw new ForbiddenException('دسترسی به پنل نگهبانی را ندارید')
}

export async function myMembership(client: PoolClient, user: JwtPayload) {
  const q =
    user.kind === 'family' && user.mid
      ? await client.query<{ id: string; unit_id: string; user_id: string; role: string }>(
          `SELECT id, unit_id, user_id, role FROM residency.memberships WHERE id = $1 AND status = 'active'`, [user.mid])
      : await client.query<{ id: string; unit_id: string; user_id: string; role: string }>(
          `SELECT m.id, m.unit_id, m.user_id, m.role FROM residency.memberships m
            WHERE m.status = 'active' AND m.user_id = COALESCE($1::uuid, (SELECT person_id FROM identity.users WHERE id = $2))
            ORDER BY (m.role = 'head') DESC, m.created_at LIMIT 1`, [user.pid ?? null, user.sub])
  if (!q.rows[0]) throw new ForbiddenException('عضویت فعالی در این ساختمان ندارید')
  return q.rows[0]
}

/** کودک: دسترسی ماژول (۰ پنهان، ۱ با تأیید، ۲ آزاد) — اینجا فقط «آزاد» مجاز است */
export async function assertChildModule(client: PoolClient, m: { id: string; role: string }, module: string) {
  if (m.role !== 'child') return
  const lv = (await client.query<{ lv: number }>(`SELECT residency.child_module_level($1, $2) AS lv`, [m.id, module])).rows[0]?.lv ?? 0
  if (lv < 1) throw new ForbiddenException('این بخش برای تو فعال نیست')
  if ((await client.query<{ q: boolean }>(`SELECT residency.in_quiet_hours($1) AS q`, [m.id])).rows[0].q) {
    throw new HttpException({ statusCode: 423, code: 'quiet_hours', message: 'در ساعت سکوت بسته است' }, 423)
  }
  if (lv < 2) throw new ForbiddenException('این کار برای این حساب نیاز به تأیید والدین دارد')
}

/** ساکنان فعال واحد که باید اعلان بگیرند (سرپرست، بزرگسال، سالمند) */
export async function unitRecipients(client: PoolClient, unitId: string) {
  const r = await client.query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM residency.memberships WHERE unit_id = $1 AND status = 'active' AND role IN ('head','adult','senior')`, [unitId])
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

/** نرمال‌سازی پلاک برای جستجو: ارقام فارسی/عربی → لاتین، حذف فاصله و خط‌تیره و «ایران» */
export function normPlate(raw: string): string {
  return String(raw ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/ایران/g, '')
    .replace(/[\s\-_.‌‏]/g, '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .toLowerCase()
}

export const bad = (m: string) => new BadRequestException(m)
