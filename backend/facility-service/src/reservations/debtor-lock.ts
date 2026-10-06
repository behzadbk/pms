import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'

/**
 * قفل بدهکاری (قوانین برج): واحد وقتی بدهکار است که شارژ پرداخت‌نشده‌اش بیش از «مهلت» که مدیر
 * تعیین کرده از سررسید گذشته باشد؛ و مشاع/بخشی که مدیر برای واحد بدهکار بسته، رزرو نمی‌شود.
 * منطق در توابع SQL (residency.unit_restricted …) است تا identity/guard/fnb هم همین را بخوانند.
 */

/** واحد ساکن/کودک؛ برای مدیر و کارکنان null (آن‌ها تابع قفل نیستند) */
export async function unitOfResident(client: PoolClient, user: JwtPayload): Promise<string | null> {
  if (user.role !== 'resident' && user.role !== 'child') return null
  // انتخاب واحد ساکن: نشست خانوادگی با شناسه‌ی عضویت (mid)، نشست عادی با person_id؛ اگر چند واحد دارد اول سرپرست،
  // بعد قدیمی‌ترین عضویت. (همان منطق myMembership در guard-service/fnb-service است.)
  const q =
    user.kind === 'family' && user.mid
      ? await client.query<{ unit_id: string }>(`SELECT unit_id FROM residency.memberships WHERE id = $1 AND status = 'active'`, [user.mid])
      : await client.query<{ unit_id: string }>(
          `SELECT m.unit_id FROM residency.memberships m
            WHERE m.status = 'active' AND m.user_id = COALESCE($1::uuid, (SELECT person_id FROM identity.users WHERE id = $2))
            ORDER BY (m.role = 'head') DESC, m.created_at LIMIT 1`,
          [user.pid ?? null, user.sub],
        )
  return q.rows[0]?.unit_id ?? null
}

export interface AmenityLock {
  locked: boolean
  overdue_days: number
  message: string | null
}

export async function amenityLock(client: PoolClient, unitId: string, amenityId: string, amenityName: string): Promise<AmenityLock> {
  const r = (
    await client.query<{ locked: boolean; days: number }>(
      `SELECT (residency.unit_restricted($1, 'module:amenity') OR residency.unit_restricted($1, 'amenity:' || $2::text)) AS locked,
              residency.unit_overdue_days($1) AS days`,
      [unitId, amenityId],
    )
  ).rows[0]
  return {
    locked: !!r?.locked,
    overdue_days: Number(r?.days ?? 0),
    message: r?.locked ? `رزرو «${amenityName}» برای واحد شما به‌علت معوقه‌ی شارژ (${r.days} روز تأخیر) بسته است؛ پس از تسویه باز می‌شود.` : null,
  }
}
