import { ForbiddenException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'

export const UNIT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * واحدهایی که این کاربر حق دیدن/پرداخت شارژشان را دارد.
 * مدیر و حسابدار: همه‌ی واحدهای ساختمان (null = بدون محدودیت). ساکن: فقط واحدِ عضویت فعال خودش.
 * (پیش‌تر هر ساکنی بدهی و شارژ تک‌تک واحدهای دیگر را می‌خواند و می‌توانست برایشان پرداخت شروع کند.)
 */
export async function allowedUnitIds(client: PoolClient, user: JwtPayload): Promise<string[] | null> {
  if (user.role === 'admin' || user.role === 'accountant' || user.role === 'super_admin') return null
  if (user.role !== 'resident') throw new ForbiddenException('دسترسی به شارژ برای این نقش مجاز نیست')
  // دو مدل عضویت در پروژه هست (مثل guard-service): پیوند قدیمی user_unit_links و عضویت فعال در مدل ساکنین
  const q = await client.query<{ unit_id: string }>(
    `SELECT unit_id FROM property.user_unit_links WHERE user_id = $2
     UNION
     SELECT m.unit_id FROM residency.memberships m
      WHERE m.status = 'active'
        AND m.user_id = COALESCE($1::uuid, (SELECT person_id FROM identity.users WHERE id = $2))`,
    [user.pid ?? null, user.sub],
  )
  return q.rows.map((r) => r.unit_id)
}

export async function assertUnitAccess(client: PoolClient, user: JwtPayload, unitId: string): Promise<void> {
  const allowed = await allowedUnitIds(client, user)
  if (allowed && !allowed.includes(unitId)) throw new ForbiddenException('این واحد متعلق به شما نیست')
}
