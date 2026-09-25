import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { CreateStaffDto, UpdateStaffDto } from './dto/staff.dto'
import { effectivePermissions } from './staff.constants'

interface StaffRow {
  id: string
  full_name: string
  username: string | null
  email: string | null
  phone: string | null
  national_id: string | null
  department: string | null
  permissions: string[]
  profile: Record<string, unknown>
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

const COLUMNS = `id, full_name, username, email, phone, national_id, department, permissions, profile,
  is_active, last_login_at, created_at`

function toDto(r: StaffRow) {
  return {
    id: r.id,
    fullName: r.full_name,
    username: r.username,
    email: r.email,
    phone: r.phone,
    nationalId: r.national_id,
    department: r.department,
    permissions: r.permissions ?? [],
    effectivePermissions: effectivePermissions(r.department, r.permissions),
    profile: r.profile ?? {},
    isActive: r.is_active,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
  }
}

/** Postgres unique_violation روی نام کاربری/ایمیل → 409 با پیام قابل فهم */
function mapUnique(err: unknown): never {
  const e = err as { code?: string; constraint?: string }
  if (e?.code === '23505') {
    if (e.constraint?.includes('username')) throw new ConflictException('این نام کاربری قبلاً استفاده شده است')
    if (e.constraint?.includes('email')) throw new ConflictException('این ایمیل قبلاً استفاده شده است')
    throw new ConflictException('این رکورد قبلاً ثبت شده است')
  }
  throw err
}

/**
 * مدیریت کارکنان مجتمع توسط مدیر ساختمان.
 * همه‌ی queryها داخل withTenant اجرا می‌شوند؛ RLS تضمین می‌کند مدیر یک مجتمع
 * هرگز کارمند مجتمع دیگری را نبیند یا تغییر ندهد. فقط ردیف‌های role='staff' لمس می‌شوند
 * تا این API راهی برای تغییر مدیر/ساکن/حسابدار نباشد.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  list(tenantId: string) {
    return this.db.withTenant(tenantId, async (client) => {
      const res = await client.query<StaffRow>(
        `SELECT ${COLUMNS} FROM identity.users WHERE role = 'staff' ORDER BY is_active DESC, full_name`,
      )
      return res.rows.map(toDto)
    })
  }

  async create(tenantId: string, dto: CreateStaffDto, actorId: string) {
    const hash = await bcrypt.hash(dto.password, 10)
    const row = await this.db
      .withTenant(tenantId, async (client) => {
        const res = await client.query<StaffRow>(
          `INSERT INTO identity.users
             (tenant_id, full_name, username, email, password_hash, role, phone, national_id,
              department, permissions, profile, is_active)
           VALUES ($1, $2, $3, $4, $5, 'staff', $6, $7, $8, $9, $10, $11)
           RETURNING ${COLUMNS}`,
          [
            tenantId,
            dto.fullName.trim(),
            dto.username.trim().toLowerCase(),
            dto.email?.trim().toLowerCase() || null,
            hash,
            dto.phone || null,
            dto.nationalId || null,
            dto.department,
            dto.permissions ?? [],
            JSON.stringify(dto.profile ?? {}),
            dto.isActive ?? true,
          ],
        )
        return res.rows[0]
      })
      .catch(mapUnique)
    this.events.publish('staff.created', { tenantId, userId: row.id, by: actorId, department: row.department })
    return toDto(row)
  }

  async update(tenantId: string, id: string, dto: UpdateStaffDto, actorId: string) {
    const sets: string[] = []
    const vals: unknown[] = []
    const set = (col: string, v: unknown) => {
      vals.push(v)
      sets.push(`${col} = $${vals.length}`)
    }
    if (dto.fullName !== undefined) set('full_name', dto.fullName.trim())
    if (dto.username !== undefined) set('username', dto.username.trim().toLowerCase())
    if (dto.email !== undefined) set('email', dto.email ? dto.email.trim().toLowerCase() : null)
    if (dto.phone !== undefined) set('phone', dto.phone || null)
    if (dto.nationalId !== undefined) set('national_id', dto.nationalId || null)
    if (dto.department !== undefined) set('department', dto.department)
    if (dto.permissions !== undefined) set('permissions', dto.permissions)
    if (dto.profile !== undefined) set('profile', JSON.stringify(dto.profile))
    if (dto.isActive !== undefined) set('is_active', dto.isActive)
    if (dto.password) set('password_hash', await bcrypt.hash(dto.password, 10))

    const row = await this.db
      .withTenant(tenantId, async (client) => {
        if (sets.length === 0) {
          const r = await client.query<StaffRow>(`SELECT ${COLUMNS} FROM identity.users WHERE id = $1 AND role = 'staff'`, [id])
          return r.rows[0]
        }
        vals.push(id)
        const r = await client.query<StaffRow>(
          `UPDATE identity.users SET ${sets.join(', ')}, updated_at = now()
            WHERE id = $${vals.length} AND role = 'staff'
            RETURNING ${COLUMNS}`,
          vals,
        )
        // غیرفعال‌سازی: auth.service در refresh و /auth/me ستون is_active را چک می‌کند،
        // پس نشست کارمند غیرفعال حداکثر تا انقضای accessToken (۱۵ دقیقه) باقی می‌ماند.
        return r.rows[0]
      })
      .catch(mapUnique)
    if (!row) throw new NotFoundException('کارمند یافت نشد')
    this.events.publish('staff.updated', { tenantId, userId: id, by: actorId, fields: Object.keys(dto) })
    return toDto(row)
  }

  async remove(tenantId: string, id: string, actorId: string) {
    const deleted = await this.db.withTenant(tenantId, async (client) => {
      const r = await client.query(`DELETE FROM identity.users WHERE id = $1 AND role = 'staff' RETURNING id`, [id])
      return r.rowCount
    })
    if (!deleted) throw new NotFoundException('کارمند یافت نشد')
    this.events.publish('staff.deleted', { tenantId, userId: id, by: actorId })
    return { ok: true }
  }
}
