import { ForbiddenException, HttpException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'

export type VenueKind = 'restaurant' | 'cafe'
export const KINDS: VenueKind[] = ['restaurant', 'cafe']
export const permForKind = (k: VenueKind) => (k === 'restaurant' ? 'kitchen' : 'cafe')

/** انواعی که این کاربر می‌تواند مدیریت کند: مدیر همه، کارمند فقط بر اساس دسترسی kitchen / cafe */
export function manageKinds(user: JwtPayload): VenueKind[] {
  if (user.role === 'admin') return [...KINDS]
  if (user.role === 'staff') return KINDS.filter((k) => (user.perms ?? []).includes(permForKind(k)))
  return []
}

export function assertCanManage(user: JwtPayload, kind: VenueKind) {
  if (!manageKinds(user).includes(kind)) throw new ForbiddenException('دسترسی مدیریت این بخش را ندارید')
}

/** اعلان درون‌برنامه‌ای — درج در notification.inbox (تریگر دیتابیس + notification-service پوش را می‌فرستند) */
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

/** واحد فعال ساکن (یا عضو خانواده) + سطح دسترسی کودک به ماژول غذا */
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

export function quietHours(): never {
  throw new HttpException({ statusCode: 423, code: 'quiet_hours', message: 'سفارش در ساعت سکوت بسته است' }, 423)
}

/** SQL: آیا مجموعه الان (به وقت تهران) باز است؟ is_open = کلید دستی مدیر، ساعت کاری = برنامه */
export const OPEN_NOW_SQL = `(v.is_active AND v.is_open AND (
  v.opens_at IS NULL OR v.closes_at IS NULL OR
  CASE WHEN v.opens_at <= v.closes_at
       THEN (now() AT TIME ZONE 'Asia/Tehran')::time >= v.opens_at AND (now() AT TIME ZONE 'Asia/Tehran')::time < v.closes_at
       ELSE (now() AT TIME ZONE 'Asia/Tehran')::time >= v.opens_at OR (now() AT TIME ZONE 'Asia/Tehran')::time < v.closes_at END))`

export const VENUE_COLS = `v.id, v.name, v.kind, v.description, v.is_active, v.is_open, v.accepts_delivery, v.min_order,
  v.prep_time_minutes, to_char(v.opens_at, 'HH24:MI') AS opens_at, to_char(v.closes_at, 'HH24:MI') AS closes_at,
  ${OPEN_NOW_SQL} AS open_now`

// ───── اعتبارسنجی ورودی ─────
import { BadRequestException } from '@nestjs/common'
export const bad = (m: string) => new BadRequestException(m)
export function str(v: unknown, label: string, { min = 1, max = 120, optional = false } = {}): string | null {
  if (v === undefined || v === null || v === '') {
    if (optional) return null
    throw bad(`${label} الزامی است`)
  }
  if (typeof v !== 'string') throw bad(`${label} نامعتبر است`)
  const t = v.trim()
  if (t.length < min || t.length > max) throw bad(`${label} باید بین ${min} تا ${max} نویسه باشد`)
  return t
}
export function int(v: unknown, label: string, { min = 0, max = 1_000_000_000, optional = false } = {}): number | null {
  if (v === undefined || v === null || v === '') {
    if (optional) return null
    throw bad(`${label} الزامی است`)
  }
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} باید عدد صحیح بین ${min} و ${max} باشد`)
  return n
}
export function hhmm(v: unknown, label: string): string | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad(`${label} باید به‌صورت HH:MM باشد`)
  return v
}
