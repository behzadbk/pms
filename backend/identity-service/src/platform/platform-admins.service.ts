import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { DatabaseService } from '../database/database.service'
import { generateTempPassword, passwordPolicyError } from '../auth/password.util'
import { PlatformAdminRole } from '../auth/platform-roles'
import { LoginThrottleService } from '../auth/login-throttle.service'
import { decryptSecret, encryptSecret, generateTotpSecret, otpauthUrl, verifyTotp } from './totp.util'

interface AdminRow {
  id: string
  username: string
  full_name: string
  role: PlatformAdminRole
  is_active: boolean
  totp_enabled: boolean
  last_login_at: Date | null
  created_at: Date
}

const COLS = 'id, username, full_name, role, is_active, totp_enabled, last_login_at, created_at'

function map(r: AdminRow) {
  return {
    id: r.id,
    username: r.username,
    fullName: r.full_name,
    role: r.role,
    isActive: r.is_active,
    totpEnabled: r.totp_enabled,
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  }
}

/** مدیریت اعضای تیم پلتفرم (سوپرادمین‌ها): نقش‌ها، فعال/غیرفعال، بازنشانی رمز و ورود دومرحله‌ای */
@Injectable()
export class PlatformAdminsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly throttle: LoginThrottleService,
  ) {}

  async list() {
    const rows = await this.db.withPlatformAccess(async (c) => (await c.query<AdminRow>(`SELECT ${COLS} FROM identity.platform_admins ORDER BY created_at`)).rows)
    return { admins: rows.map(map) }
  }

  async create(dto: { username: string; fullName: string; role: PlatformAdminRole; password?: string }) {
    const username = dto.username.trim().toLowerCase()
    const password = dto.password ?? generateTempPassword()
    const bad = passwordPolicyError(password, [username])
    if (bad) throw new BadRequestException(bad)
    const hash = await bcrypt.hash(password, 10)
    const row = await this.db.withPlatformAccess(async (c) => {
      const exists = await c.query('SELECT 1 FROM identity.platform_admins WHERE username = $1', [username])
      if (exists.rowCount) throw new ConflictException('این نام کاربری قبلاً ثبت شده است')
      const r = await c.query<AdminRow>(
        `INSERT INTO identity.platform_admins (username, full_name, password_hash, role, must_change_password)
         VALUES ($1, $2, $3, $4, true) RETURNING ${COLS}`,
        [username, dto.fullName.trim(), hash, dto.role],
      )
      return r.rows[0]
    })
    return { ...map(row), credentials: { username, password, mustChangePassword: true as const, note: 'این رمز دیگر نمایش داده نمی‌شود؛ کاربر در اولین ورود باید رمز را عوض کند.' } }
  }

  /** تغییر نقش/وضعیت. جلوی قفل‌شدن تیم را می‌گیرد: خود را نمی‌شود غیرفعال/تنزل داد و باید همیشه یک owner فعال بماند. */
  async update(id: string, selfId: string, dto: { role?: PlatformAdminRole; isActive?: boolean; fullName?: string }) {
    return this.db.withPlatformAccess(async (c) => {
      const cur = await c.query<AdminRow>(`SELECT ${COLS} FROM identity.platform_admins WHERE id = $1 FOR UPDATE`, [id])
      const a = cur.rows[0]
      if (!a) throw new NotFoundException('کاربر یافت نشد')
      const nextRole = dto.role ?? a.role
      const nextActive = dto.isActive ?? a.is_active
      if (id === selfId && (!nextActive || nextRole !== a.role)) throw new BadRequestException('نقش یا وضعیت حساب خودتان را نمی‌توانید تغییر دهید')
      if (a.role === 'owner' && a.is_active && (nextRole !== 'owner' || !nextActive)) {
        const others = await c.query('SELECT count(*)::int AS n FROM identity.platform_admins WHERE role = $1 AND is_active AND id <> $2', ['owner', id])
        if (others.rows[0].n === 0) throw new BadRequestException('باید دست‌کم یک مالک (owner) فعال بماند')
      }
      const r = await c.query<AdminRow>(
        `UPDATE identity.platform_admins
            SET role = $2, is_active = $3, full_name = COALESCE($4, full_name),
                -- غیرفعال‌شدن یا تغییر نقش: نشست‌های باز همین لحظه باطل می‌شوند
                sessions_valid_after = CASE WHEN $3 = false OR $2 <> role THEN now() ELSE sessions_valid_after END
          WHERE id = $1 RETURNING ${COLS}`,
        [id, nextRole, nextActive, dto.fullName?.trim() || null],
      )
      return map(r.rows[0])
    })
  }

  async resetPassword(id: string) {
    const password = generateTempPassword()
    const hash = await bcrypt.hash(password, 10)
    const row = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query<AdminRow>(
        `UPDATE identity.platform_admins SET password_hash = $2, must_change_password = true, sessions_valid_after = now()
          WHERE id = $1 RETURNING ${COLS}`,
        [id, hash],
      )
      return r.rows[0]
    })
    if (!row) throw new NotFoundException('کاربر یافت نشد')
    return { username: row.username, password, mustChangePassword: true as const, note: 'این رمز فقط همین یک‌بار نمایش داده می‌شود.' }
  }

  /* ───────────── ۲FA ───────────── */

  /** راز تازه می‌سازد ولی هنوز فعال نمی‌کند؛ تا تأیید با یک کد درست، ورود بدون کد ادامه دارد */
  async setupTotp(id: string) {
    const secret = generateTotpSecret()
    const row = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query<{ username: string; totp_enabled: boolean }>('SELECT username, totp_enabled FROM identity.platform_admins WHERE id = $1', [id])
      if (!r.rows[0]) throw new NotFoundException('کاربر یافت نشد')
      if (r.rows[0].totp_enabled) throw new BadRequestException('ورود دومرحله‌ای از قبل روشن است؛ ابتدا خاموشش کنید')
      await c.query('UPDATE identity.platform_admins SET totp_secret_enc = $2 WHERE id = $1', [id, encryptSecret(secret)])
      return r.rows[0]
    })
    return { secret, otpauthUrl: otpauthUrl(row.username, secret) }
  }

  async enableTotp(id: string, code: string) {
    await this.db.withPlatformAccess(async (c) => {
      const r = await c.query<{ totp_secret_enc: string | null; totp_enabled: boolean }>('SELECT totp_secret_enc, totp_enabled FROM identity.platform_admins WHERE id = $1', [id])
      const a = r.rows[0]
      if (!a?.totp_secret_enc) throw new BadRequestException('ابتدا راه‌اندازی ۲FA را شروع کنید')
      if (a.totp_enabled) throw new BadRequestException('ورود دومرحله‌ای از قبل روشن است')
      if (!verifyTotp(decryptSecret(a.totp_secret_enc), code)) throw new BadRequestException('کد نادرست است')
      await c.query('UPDATE identity.platform_admins SET totp_enabled = true WHERE id = $1', [id])
    })
    return { ok: true }
  }

  /** خاموش‌کردن توسط خود کاربر: هم رمز و هم کد فعلی لازم است */
  async disableTotp(id: string, password: string, code: string, ip: string) {
    await this.throttle.assertAllowed('platform-2fa', id, ip)
    const ok = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query<{ password_hash: string; totp_secret_enc: string | null; totp_enabled: boolean }>('SELECT password_hash, totp_secret_enc, totp_enabled FROM identity.platform_admins WHERE id = $1', [id])
      const a = r.rows[0]
      if (!a) throw new NotFoundException('کاربر یافت نشد')
      if (!a.totp_enabled || !a.totp_secret_enc) throw new BadRequestException('ورود دومرحله‌ای روشن نیست')
      const good = (await bcrypt.compare(password, a.password_hash)) && verifyTotp(decryptSecret(a.totp_secret_enc), code)
      if (good) await c.query('UPDATE identity.platform_admins SET totp_enabled = false, totp_secret_enc = NULL WHERE id = $1', [id])
      return good
    })
    if (!ok) {
      await this.throttle.recordFailure('platform-2fa', id, ip)
      throw new UnauthorizedException('رمز یا کد نادرست است')
    }
    await this.throttle.recordSuccess('platform-2fa', id, ip)
    return { ok: true }
  }

  /** بازنشانی ۲FA یک عضو دیگر توسط owner (مثلاً گوشی گم شده) */
  async resetTotp(id: string) {
    const n = await this.db.withPlatformAccess(async (c) => {
      const r = await c.query('UPDATE identity.platform_admins SET totp_enabled = false, totp_secret_enc = NULL, sessions_valid_after = now() WHERE id = $1', [id])
      return r.rowCount ?? 0
    })
    if (!n) throw new NotFoundException('کاربر یافت نشد')
    return { ok: true }
  }
}
