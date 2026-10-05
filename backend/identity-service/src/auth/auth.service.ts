import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { LoginDto } from './dto/login.dto'
import { PlatformLoginDto } from './dto/platform-login.dto'
import { JwtPayload } from './decorators/current-user.decorator'
import { effectivePermissions } from '../users/staff.constants'
import { LoginThrottleService } from './login-throttle.service'
import { passwordPolicyError } from './password.util'
import { toLatinDigits } from '../residents/phone'

interface UserRow {
  person_id: string | null
  person_status: string | null
  tenant_name?: string | null
  sessions_valid_after: Date | null
  id: string
  full_name: string
  email: string | null
  username: string | null
  role: string
  department: string | null
  permissions: string[] | null
  is_active: boolean
  must_change_password: boolean
}

// person_status/sessions_valid_after از حساب شخص (ماژول ساکنین) می‌آید: مسدودی/خروج از همه‌ی دستگاه‌ها
const USER_COLUMNS = `id, full_name, email, username, role, department, permissions, is_active, person_id, must_change_password,
  (SELECT p.status FROM residency.users p WHERE p.id = identity.users.person_id) AS person_status,
  (SELECT t.name FROM identity.tenants t WHERE t.id = identity.users.tenant_id) AS tenant_name,
  must_change_password,
  GREATEST(sessions_valid_after,
           COALESCE((SELECT p.sessions_valid_after FROM residency.users p WHERE p.id = identity.users.person_id), '-infinity')) AS sessions_valid_after`

/** توکنی که قبل از «خروج از همه‌ی دستگاه‌ها»/تخلیه/مسدودی صادر شده دیگر تمدید نمی‌شود */
export function tokenRevoked(iat: number | undefined, validAfter: Date | null | undefined): boolean {
  if (!validAfter || !isFinite(new Date(validAfter).getTime())) return false
  return !iat || iat * 1000 < new Date(validAfter).getTime() - 999
}

/** خروجی کاربر برای فرانت — کارمند بخش و دسترسی‌های مؤثرش را هم می‌گیرد تا پنل خودش باز شود */
function publicUser(u: UserRow, tenantId: string) {
  return {
    id: u.id,
    fullName: u.full_name,
    role: u.role,
    tenantId,
    ...(u.tenant_name ? { tenantName: u.tenant_name } : {}),
    ...(u.must_change_password ? { mustChangePassword: true } : {}),
    ...(u.role === 'staff'
      ? { department: u.department, permissions: effectivePermissions(u.department, u.permissions) }
      : {}),
    ...(u.person_id ? { personId: u.person_id } : {}),
  }
}

/** ادعاهای اضافه‌ی توکن: شخص (برای ماژول ساکنین) و دسترسی کارمند (برای سرویس‌های دیگر) */
function extraClaims(u: UserRow) {
  return {
    ...(u.person_id ? { pid: u.person_id } : {}),
    ...(u.role === 'staff' ? { perms: effectivePermissions(u.department, u.permissions) } : {}),
  }
}

interface PlatformAdminRow {
  id: string
  username: string
  full_name: string
  password_hash: string
  is_active: boolean
  must_change_password: boolean
}

export interface AuthResult {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    fullName: string
    role: string
    /** برای سوپرادمین null است — این کاربر به هیچ مجتمعی تعلق ندارد */
    tenantId: string | null
    mustChangePassword?: boolean
    department?: string | null
    permissions?: string[]
  }
}

// هش bcrypt یک رمز تصادفی دور ریخته‌شده — فقط برای یکسان‌سازی زمان پاسخ
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.7xq9Y8t3tqK5G6bN1dX7p8vWQJ9a'

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly throttle: LoginThrottleService,
  ) {}

  private issueTokens(payload: { sub: string; tenant_id: string | null; role: string; email: string | null; pid?: string; perms?: string[] }) {
    const accessToken = this.jwt.sign({ ...payload, typ: 'access' }, { expiresIn: '15m' })
    const refreshToken = this.jwt.sign({ ...payload, typ: 'refresh' }, { expiresIn: '30d' })
    return { accessToken, refreshToken }
  }

  async login(dto: LoginDto, ip = ''): Promise<AuthResult> {
    // ۱) پیدا کردن tenant از روی subdomain — این یک query عمومی (cross-tenant) است
    //    و باید با نقش دیتابیسی platform (بدون RLS محدود به یک tenant) اجرا شود،
    //    چون در این لحظه هنوز نمی‌دانیم کاربر متعلق به کدام tenant است.
    const tenant = await this.db.withPlatformAccess(async (client) => {
      const res = await client.query('SELECT id, status FROM identity.tenants WHERE subdomain = $1', [
        dto.tenantSubdomain,
      ])
      return res.rows[0]
    })
    if (!tenant || tenant.status === 'suspended' || tenant.status === 'cancelled') {
      throw new UnauthorizedException('مجتمع یافت نشد یا غیرفعال است')
    }

    // ۲) اکنون که tenant مشخص شد، جستجوی کاربر در محدوده همان tenant (از طریق RLS).
    //    فیلد email هم ایمیل را می‌پذیرد و هم نام کاربری (کارکنانی که مدیر برایشان حساب ساخته).
    // ساکن با کیبورد فارسی هم می‌تواند وارد شود: ارقام فارسی/عربی نام کاربری (موبایل) به لاتین برمی‌گردد
    const identifier = toLatinDigits(dto.email.trim().toLowerCase())
    const scope = `t:${tenant.id}`
    await this.throttle.assertAllowed(scope, identifier, ip)
    const user = await this.db.withTenant(tenant.id, async (client) => {
      const res = await client.query(
        `SELECT ${USER_COLUMNS}, password_hash FROM identity.users
          WHERE ${identifier.includes('@') ? 'email' : 'username'} = $1`,
        [identifier],
      )
      return res.rows[0] as (UserRow & { password_hash: string }) | undefined
    })
    // برای کاربر ناموجود هم یک compare انجام می‌شود تا زمان پاسخ وجود حساب را لو ندهد
    // رمز اولیه‌ی ساکن = شماره واحد؛ اگر با ارقام فارسی تایپ شد هم پذیرفته می‌شود
    const latinPw = toLatinDigits(dto.password)
    const passwordOk = (await bcrypt.compare(dto.password, user?.password_hash ?? DUMMY_HASH)) ||
      (!!user && latinPw !== dto.password && (await bcrypt.compare(latinPw, user.password_hash)))
    if (!user || !user.is_active || !passwordOk) {
      await this.throttle.recordFailure(scope, identifier, ip)
      throw new UnauthorizedException('نام کاربری/ایمیل یا رمز عبور نادرست است')
    }
    await this.throttle.recordSuccess(scope, identifier, ip)
    if (user.person_status === 'blocked') {
      throw new UnauthorizedException('این حساب توسط پشتیبانی مسدود شده است')
    }

    await this.db.withTenant(tenant.id, async (client) => {
      await client.query('UPDATE identity.users SET last_login_at = now() WHERE id = $1', [user.id])
    })

    const payload = { sub: user.id, tenant_id: tenant.id, role: user.role, email: user.email ?? user.username, ...extraClaims(user) }
    const { accessToken, refreshToken } = this.issueTokens(payload)

    this.events.publish('user.logged_in', { userId: user.id, tenantId: tenant.id })

    return {
      accessToken,
      refreshToken,
      user: publicUser(user, tenant.id),
    }
  }

  /**
   * ورود سوپرادمین (پنل پلتفرم) — کاربر از جدول identity.platform_admins خوانده
   * می‌شود که به هیچ tenant‌ای وابسته نیست؛ بنابراین توکن صادرشده tenant_id = null
   * دارد و نقش آن همیشه 'super_admin' است. این جدول RLS ندارد و جستجو با
   * withPlatformAccess انجام می‌شود (هیچ app.current_tenant_id‌ای در کار نیست).
   */
  async platformLogin(dto: PlatformLoginDto, ip = ''): Promise<AuthResult> {
    const username = dto.username.trim().toLowerCase()
    await this.throttle.assertAllowed('platform', username, ip)
    const admin = await this.db.withPlatformAccess(async (client) => {
      const res = await client.query<PlatformAdminRow>(
        'SELECT id, username, full_name, password_hash, is_active, must_change_password FROM identity.platform_admins WHERE username = $1',
        [username],
      )
      return res.rows[0]
    })

    // پیام خطا عمداً یکسان است تا نشود وجود/عدم وجود یک نام کاربری را حدس زد
    const ok = await bcrypt.compare(dto.password, admin?.password_hash ?? DUMMY_HASH)
    if (!admin || !admin.is_active || !ok) {
      await this.throttle.recordFailure('platform', username, ip)
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است')
    }
    await this.throttle.recordSuccess('platform', username, ip)

    await this.db.withPlatformAccess(async (client) => {
      await client.query('UPDATE identity.platform_admins SET last_login_at = now() WHERE id = $1', [admin.id])
    })

    this.events.publish('platform_admin.logged_in', { userId: admin.id, username: admin.username })
    return this.platformLoginResult(admin)
  }

  /** صدور accessToken جدید از روی یک refreshToken معتبر (بدون نیاز به ایمیل/رمز عبور دوباره) */
  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: JwtPayload
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken)
    } catch {
      throw new UnauthorizedException('refresh token نامعتبر یا منقضی‌شده است')
    }
    // accessToken نباید بتواند نشست را تمدید کند
    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('refresh token نامعتبر یا منقضی‌شده است')
    }

    // مسیر سوپرادمین: توکن tenant_id ندارد
    if (payload.role === 'super_admin' || !payload.tenant_id) {
      const admin = await this.fetchPlatformAdmin(payload.sub)
      if (!admin || !admin.is_active) {
        throw new UnauthorizedException('کاربر یافت نشد')
      }
      return this.platformLoginResult(admin)
    }

    // نشست کودک (کد خانواده): عضویت باید هنوز فعال باشد
    if (payload.kind === 'family') {
      const child = await this.fetchFamilyMember(payload.tenant_id, payload.mid, payload.sub)
      if (!child || tokenRevoked(payload.iat, child.sessions_valid_after)) {
        throw new UnauthorizedException('دسترسی این حساب قطع شده است')
      }
      const p = { sub: child.id, pid: child.id, tenant_id: payload.tenant_id, role: 'child', email: null, kind: 'family' as const, mid: payload.mid }
      return {
        accessToken: this.jwt.sign({ ...p, typ: 'access' }, { expiresIn: '15m' }),
        refreshToken: this.jwt.sign({ ...p, typ: 'refresh' }, { expiresIn: '90d' }),
        user: { id: child.id, fullName: child.name, role: 'child', tenantId: payload.tenant_id, membershipId: payload.mid },
      } as AuthResult
    }

    const user = await this.fetchUser(payload.tenant_id, payload.sub)
    if (!user || !user.is_active || user.person_status === 'blocked') {
      throw new UnauthorizedException('کاربر یافت نشد')
    }
    if (tokenRevoked(payload.iat, user.sessions_valid_after)) {
      throw new UnauthorizedException('نشست شما باطل شده است؛ دوباره وارد شوید')
    }

    const newPayload = { sub: user.id, tenant_id: payload.tenant_id, role: user.role, email: user.email ?? user.username, ...extraClaims(user) }
    const { accessToken, refreshToken: newRefreshToken } = this.issueTokens(newPayload)

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: publicUser(user, payload.tenant_id),
    }
  }

  /**
   * تغییر رمز توسط خود کاربر (ورود با رمز موقت → تعویض اجباری). رمز فعلی لازم است؛ پس از تغییر،
   * نشست‌های قبلی باطل و توکن تازه صادر می‌شود.
   */
  async changePassword(current: JwtPayload, oldPassword: string, newPassword: string, ip = ''): Promise<AuthResult> {
    if (current.kind === 'family') throw new BadRequestException('این نشست رمز عبور ندارد')
    const scope = current.tenant_id ? `chg:${current.tenant_id}` : 'chg:platform'
    await this.throttle.assertAllowed(scope, current.sub, ip)
    if (oldPassword === newPassword) throw new BadRequestException('رمز جدید باید با رمز فعلی متفاوت باشد')

    if (!current.tenant_id) {
      const admin = await this.fetchPlatformAdmin(current.sub)
      if (!admin || !(await bcrypt.compare(oldPassword, admin.password_hash))) {
        await this.throttle.recordFailure(scope, current.sub, ip)
        throw new UnauthorizedException('رمز فعلی نادرست است')
      }
      const bad = passwordPolicyError(newPassword, [admin.username])
      if (bad) throw new BadRequestException(bad)
      const newHash = await bcrypt.hash(newPassword, 10)
      await this.db.withPlatformAccess((c) =>
        c.query('UPDATE identity.platform_admins SET password_hash = $2, must_change_password = false WHERE id = $1', [admin.id, newHash]),
      )
      return this.platformLoginResult({ ...admin, must_change_password: false })
    }

    const user = await this.db.withTenant(current.tenant_id, async (client) => {
      const res = await client.query<UserRow & { password_hash: string; phone: string | null }>(
        `SELECT ${USER_COLUMNS}, password_hash, phone FROM identity.users WHERE id = $1`, [current.sub])
      return res.rows[0]
    })
    if (!user || !user.is_active || !((await bcrypt.compare(oldPassword, user.password_hash)) || (await bcrypt.compare(toLatinDigits(oldPassword), user.password_hash)))) {
      await this.throttle.recordFailure(scope, current.sub, ip)
      throw new UnauthorizedException('رمز فعلی نادرست است')
    }
    const bad = passwordPolicyError(newPassword, [user.username, user.email?.split('@')[0], user.phone])
    if (bad) throw new BadRequestException(bad)
    const hash = await bcrypt.hash(newPassword, 10)
    await this.db.withTenant(current.tenant_id, async (client) => {
      await client.query(
        `UPDATE identity.users SET password_hash = $2, must_change_password = false, password_changed_at = now(),
                sessions_valid_after = now(), updated_at = now() WHERE id = $1`,
        [user.id, hash],
      )
    })
    await this.throttle.recordSuccess(scope, current.sub, ip)
    this.events.publish('user.password_changed', { userId: user.id, tenantId: current.tenant_id })
    const fresh = await this.fetchUser(current.tenant_id, user.id)
    const payload = { sub: user.id, tenant_id: current.tenant_id, role: user.role, email: user.email ?? user.username, ...extraClaims(fresh!) }
    return { ...this.issueTokens(payload), user: publicUser(fresh!, current.tenant_id) }
  }

  private platformLoginResult(admin: PlatformAdminRow): AuthResult {
    const payload = { sub: admin.id, tenant_id: null, role: 'super_admin', email: admin.username }
    return {
      ...this.issueTokens(payload),
      user: { id: admin.id, fullName: admin.full_name, role: 'super_admin', tenantId: null, ...(admin.must_change_password ? { mustChangePassword: true } : {}) },
    }
  }

  /** پروفایل کاربر جاری — برای بازیابی نشست فرانت‌اند بعد از رفرش صفحه (GET /auth/me) */
  async me(current: JwtPayload) {
    if (current.role === 'super_admin' || !current.tenant_id) {
      const admin = await this.fetchPlatformAdmin(current.sub)
      if (!admin || !admin.is_active) {
        throw new UnauthorizedException('کاربر یافت نشد')
      }
      return { id: admin.id, fullName: admin.full_name, role: 'super_admin', tenantId: null, ...(admin.must_change_password ? { mustChangePassword: true } : {}) }
    }
    if (current.kind === 'family') {
      const child = await this.fetchFamilyMember(current.tenant_id, current.mid, current.sub)
      if (!child) throw new UnauthorizedException('دسترسی این حساب قطع شده است')
      return { id: child.id, fullName: child.name, role: 'child', tenantId: current.tenant_id, membershipId: current.mid }
    }
    const user = await this.fetchUser(current.tenant_id, current.sub)
    if (!user || !user.is_active || user.person_status === 'blocked') {
      throw new UnauthorizedException('کاربر یافت نشد')
    }
    return publicUser(user, current.tenant_id)
  }

  /** کودکِ نشست خانواده — فقط اگر عضویتش فعال و حساب شخص فعال باشد */
  private fetchFamilyMember(tenantId: string, membershipId: string | undefined, personId: string) {
    if (!membershipId) return Promise.resolve(undefined)
    return this.db.withTenant(tenantId, async (client) => {
      const res = await client.query<{ id: string; name: string; sessions_valid_after: Date }>(
        `SELECT p.id, p.name, p.sessions_valid_after FROM residency.memberships m JOIN residency.users p ON p.id = m.user_id
          WHERE m.id = $1 AND m.user_id = $2 AND m.status = 'active' AND p.status = 'active'`,
        [membershipId, personId],
      )
      return res.rows[0]
    })
  }

  private fetchUser(tenantId: string, userId: string): Promise<UserRow | undefined> {
    return this.db.withTenant(tenantId, async (client) => {
      const res = await client.query<UserRow>(`SELECT ${USER_COLUMNS} FROM identity.users WHERE id = $1`, [userId])
      return res.rows[0]
    })
  }

  private fetchPlatformAdmin(adminId: string): Promise<PlatformAdminRow | undefined> {
    return this.db.withPlatformAccess(async (client) => {
      const res = await client.query<PlatformAdminRow>(
        'SELECT id, username, full_name, password_hash, is_active, must_change_password FROM identity.platform_admins WHERE id = $1',
        [adminId],
      )
      return res.rows[0]
    })
  }
}
