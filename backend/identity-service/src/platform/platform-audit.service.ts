import { Injectable, Logger } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { JwtPayload } from '../auth/decorators/current-user.decorator'

/** چه کسی کار را کرد: سوپرادمین واردشده یا «system» (زمان‌بند) */
export interface AuditActor {
  adminId: string | null
  username: string
  ip?: string
}

export function actorOf(user: JwtPayload, ip = ''): AuditActor {
  return { adminId: user.sub, username: user.email ?? 'unknown', ip }
}

export const SYSTEM_ACTOR: AuditActor = { adminId: null, username: 'system' }

/**
 * لاگ فعالیت سطح پلتفرم (append-only؛ نقش platform_admin حتی UPDATE/DELETE ندارد).
 * ثبت لاگ هرگز نباید کار اصلی را بشکند: خطا فقط در لاگ سرویس می‌آید.
 * ولی برای کارهای حساس (impersonation) متد logStrict خطا را بالا می‌دهد تا بدون ثبت، عملیات انجام نشود.
 */
@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name)

  constructor(private readonly db: DatabaseService) {}

  async log(actor: AuditActor, action: string, opts: { buildingId?: string | null; target?: string; detail?: Record<string, unknown> } = {}) {
    try {
      await this.logStrict(actor, action, opts)
    } catch (e) {
      this.logger.error(`ثبت لاگ فعالیت ناموفق بود (${action}): ${(e as Error).message}`)
    }
  }

  async logStrict(actor: AuditActor, action: string, opts: { buildingId?: string | null; target?: string; detail?: Record<string, unknown> } = {}) {
    await this.db.withPlatformAccess((c) =>
      c.query(
        `INSERT INTO identity.platform_audit_log (admin_id, admin_username, action, building_id, target, detail, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [actor.adminId, actor.username, action, opts.buildingId ?? null, opts.target ?? null, JSON.stringify(opts.detail ?? {}), actor.ip || null],
      ),
    )
  }

  async list(f: { buildingId?: string; admin?: string; action?: string; limit?: number; before?: number }) {
    const where: string[] = []
    const vals: unknown[] = []
    if (f.buildingId) { vals.push(f.buildingId); where.push(`l.building_id = $${vals.length}`) }
    if (f.admin) { vals.push(f.admin); where.push(`l.admin_username = $${vals.length}`) }
    if (f.action) { vals.push(`${f.action}%`); where.push(`l.action LIKE $${vals.length}`) }
    if (f.before) { vals.push(f.before); where.push(`l.id < $${vals.length}`) }
    const limit = Math.min(Math.max(f.limit ?? 100, 1), 500)
    vals.push(limit)
    const rows = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query(
        `SELECT l.id, l.at, l.admin_username, l.action, l.building_id, t.name AS building_name, l.target, l.detail, l.ip
           FROM identity.platform_audit_log l LEFT JOIN identity.tenants t ON t.id = l.building_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY l.id DESC LIMIT $${vals.length}`,
        vals,
      )
      return r.rows
    })
    return {
      entries: rows.map((r) => ({
        id: Number(r.id),
        at: new Date(r.at).toISOString(),
        admin: r.admin_username as string,
        action: r.action as string,
        buildingId: r.building_id as string | null,
        buildingName: r.building_name as string | null,
        target: r.target as string | null,
        detail: r.detail as Record<string, unknown>,
        ip: r.ip as string | null,
      })),
    }
  }
}
