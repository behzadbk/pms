import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { generateTempPassword, passwordPolicyError } from '../auth/password.util'

interface Row {
  id: string
  full_name: string
  email: string | null
  username: string | null
  phone: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

const COLS = `id, full_name, email, username, phone, is_active, last_login_at, created_at`
const dto = (r: Row) => ({ id: r.id, fullName: r.full_name, email: r.email, username: r.username, phone: r.phone, isActive: r.is_active, lastLoginAt: r.last_login_at, createdAt: r.created_at })

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
 * حساب حسابدار ساختمان — توسط مدیر ساخته/فهرست/غیرفعال می‌شود (فقط role='accountant' لمس می‌شود).
 * رمز اولیه موقت است (must_change_password)؛ اگر مدیر رمز ندهد، رمز تصادفی ساخته و فقط یک‌بار برمی‌گردد.
 */
@Injectable()
export class AccountantsService {
  constructor(private readonly db: DatabaseService, private readonly events: EventsService) {}

  list(tenantId: string) {
    return this.db.withTenant(tenantId, async (client) => {
      const r = await client.query<Row>(`SELECT ${COLS} FROM identity.users WHERE role = 'accountant' ORDER BY is_active DESC, full_name`)
      return r.rows.map(dto)
    })
  }

  async create(tenantId: string, actorId: string, b: { fullName: string; email: string; phone?: string; password?: string }) {
    const fullName = b.fullName?.trim()
    const email = b.email?.trim().toLowerCase()
    if (!fullName || fullName.length < 2 || fullName.length > 120) throw new BadRequestException('نام حسابدار را وارد کنید')
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('ایمیل نامعتبر است')
    if (b.phone && !/^0\d{10}$/.test(b.phone)) throw new BadRequestException('شماره موبایل باید ۱۱ رقم و با ۰ شروع شود')
    const generated = !b.password
    const password = b.password || generateTempPassword()
    const bad = passwordPolicyError(password, [email.split('@')[0], b.phone])
    if (bad) throw new BadRequestException(bad)
    const hash = await bcrypt.hash(password, 10)
    const row = await this.db
      .withTenant(tenantId, async (client) => {
        const r = await client.query<Row>(
          `INSERT INTO identity.users (tenant_id, full_name, email, password_hash, role, phone, is_active, must_change_password)
           VALUES ($1, $2, $3, $4, 'accountant', $5, true, true) RETURNING ${COLS}`,
          [tenantId, fullName, email, hash, b.phone || null],
        )
        return r.rows[0]
      })
      .catch(mapUnique)
    this.events.publish('accountant.created', { tenantId, userId: row.id, by: actorId })
    return { ...dto(row), ...(generated ? { tempPassword: password } : {}) }
  }

  async update(tenantId: string, id: string, actorId: string, b: { fullName?: string; phone?: string | null; isActive?: boolean }) {
    const sets: string[] = []
    const vals: unknown[] = []
    const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }
    if (b.fullName !== undefined) {
      if (b.fullName.trim().length < 2) throw new BadRequestException('نام نامعتبر است')
      set('full_name', b.fullName.trim())
    }
    if (b.phone !== undefined) {
      if (b.phone && !/^0\d{10}$/.test(b.phone)) throw new BadRequestException('شماره موبایل نامعتبر است')
      set('phone', b.phone || null)
    }
    if (b.isActive !== undefined) {
      set('is_active', !!b.isActive)
      if (!b.isActive) set('sessions_valid_after', new Date()) // نشست‌های فعلی حسابدار غیرفعال‌شده باطل شود
    }
    if (!sets.length) throw new BadRequestException('چیزی برای ویرایش ارسال نشده است')
    vals.push(id)
    const row = await this.db.withTenant(tenantId, async (client) => {
      const r = await client.query<Row>(`UPDATE identity.users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} AND role = 'accountant' RETURNING ${COLS}`, vals)
      return r.rows[0]
    })
    if (!row) throw new NotFoundException('حسابدار یافت نشد')
    this.events.publish('accountant.updated', { tenantId, userId: id, by: actorId, fields: Object.keys(b) })
    return dto(row)
  }
}
