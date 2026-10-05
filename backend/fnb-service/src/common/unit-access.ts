import { ForbiddenException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'

/** نقش‌هایی که به‌خاطر وظیفه (آشپزخانه، مدیریت، حسابداری) به سفارش همه‌ی واحدها دسترسی دارند */
const STAFFLIKE = ['admin', 'staff', 'accountant', 'super_admin', 'guard']

/**
 * ساکن/کودک فقط برای واحدِ عضویت فعال خودش سفارش ثبت یا مشاهده می‌کند. پیش‌تر هر کاربر واردشده‌ای
 * می‌توانست با شناسه‌ی واحد دیگران سفارش بدهد یا سفارش‌هایشان را بخواند.
 * دو مدل عضویت: عضویت فعال در مدل ساکنین (residency.memberships) و پیوند قدیمی property.user_unit_links.
 */
export async function assertUnitAccess(client: PoolClient, user: JwtPayload, unitId: string): Promise<void> {
  if (STAFFLIKE.includes(user.role)) return
  const q =
    user.kind === 'family' && user.mid
      ? await client.query(`SELECT 1 FROM residency.memberships WHERE id = $1 AND unit_id = $2 AND status = 'active'`, [user.mid, unitId])
      : await client.query(
          `SELECT 1 FROM residency.memberships m
            WHERE m.unit_id = $1 AND m.status = 'active'
              AND m.user_id = COALESCE($2::uuid, (SELECT person_id FROM identity.users WHERE id = $3))
           UNION
           SELECT 1 FROM property.user_unit_links WHERE unit_id = $1 AND user_id = $3
           LIMIT 1`,
          [unitId, user.pid ?? null, user.sub],
        )
  if (!q.rowCount) throw new ForbiddenException('این واحد متعلق به شما نیست')
}
