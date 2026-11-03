import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { CreateGrantDto } from './dto/grant.dto'
import { MAX_GRANT_DAYS } from './staff.constants'

interface GrantRow {
  id: string
  user_id: string
  permission: string
  granted_by: string | null
  starts_at: Date
  expires_at: Date
  revoked_at: Date | null
  created_at: Date
}

const COLUMNS = `id, user_id, permission, granted_by, starts_at, expires_at, revoked_at, created_at`

function toDto(r: GrantRow, now = Date.now()) {
  const active = !r.revoked_at && r.starts_at.getTime() <= now && now < r.expires_at.getTime()
  return {
    id: r.id,
    userId: r.user_id,
    permission: r.permission,
    grantedBy: r.granted_by,
    startsAt: r.starts_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
    status: r.revoked_at ? 'revoked' : now >= r.expires_at.getTime() ? 'expired' : active ? 'active' : 'scheduled',
  }
}

/**
 * دسترسی موقت کارکنان (identity.user_permission_grants، مایگریشن 906).
 * ردیف‌ها هرگز DELETE نمی‌شوند: لغو = پر کردن revoked_at؛ انقضا هنگام خواندن چک می‌شود (auth.service).
 * همه‌ی queryها در withTenant و فقط برای کاربرانِ role='staff' همین ساختمان.
 * تغییر دسترسی در توکن‌های جاری حداکثر تا ۱۵ دقیقه (عمر accessToken) یا تا refresh بعدی اعمال می‌شود.
 */
@Injectable()
export class GrantsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  list(tenantId: string, staffId: string) {
    return this.db.withTenant(tenantId, async (client) => {
      await this.assertStaff(client, staffId)
      const r = await client.query<GrantRow>(
        `SELECT ${COLUMNS} FROM identity.user_permission_grants WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [staffId],
      )
      return r.rows.map((x) => toDto(x))
    })
  }

  async create(tenantId: string, staffId: string, dto: CreateGrantDto, actorId: string) {
    const now = Date.now()
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date(now)
    const expiresAt = new Date(dto.expiresAt)
    if (expiresAt.getTime() <= now) throw new BadRequestException('تاریخ پایان باید در آینده باشد')
    if (expiresAt.getTime() <= startsAt.getTime()) throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد')
    if (expiresAt.getTime() - startsAt.getTime() > MAX_GRANT_DAYS * 86_400_000) {
      throw new BadRequestException(`مدت دسترسی موقت حداکثر ${MAX_GRANT_DAYS} روز است`)
    }
    const row = await this.db.withTenant(tenantId, async (client) => {
      await this.assertStaff(client, staffId)
      const r = await client.query<GrantRow>(
        `INSERT INTO identity.user_permission_grants (tenant_id, user_id, permission, granted_by, starts_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
        [tenantId, staffId, dto.permission, actorId, startsAt, expiresAt],
      )
      return r.rows[0]
    })
    this.events.publish('staff.grant.created', {
      tenantId, userId: staffId, by: actorId, grantId: row.id, permission: row.permission, expiresAt: row.expires_at,
    })
    return toDto(row)
  }

  async revoke(tenantId: string, staffId: string, grantId: string, actorId: string) {
    const row = await this.db.withTenant(tenantId, async (client) => {
      const r = await client.query<GrantRow>(
        `UPDATE identity.user_permission_grants SET revoked_at = now()
          WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING ${COLUMNS}`,
        [grantId, staffId],
      )
      return r.rows[0]
    })
    if (!row) throw new NotFoundException('دسترسی موقت یافت نشد یا قبلاً لغو شده است')
    this.events.publish('staff.grant.revoked', { tenantId, userId: staffId, by: actorId, grantId, permission: row.permission })
    return toDto(row)
  }

  private async assertStaff(client: import('pg').PoolClient, staffId: string) {
    const r = await client.query(`SELECT 1 FROM identity.users WHERE id = $1 AND role = 'staff'`, [staffId])
    if (!r.rows[0]) throw new NotFoundException('کارمند یافت نشد')
  }
}
