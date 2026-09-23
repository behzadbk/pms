import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { LoginDto } from './dto/login.dto'
import { PlatformLoginDto } from './dto/platform-login.dto'
import { JwtPayload } from './decorators/current-user.decorator'

interface UserRow {
  id: string
  full_name: string
  email: string
  role: string
}

interface PlatformAdminRow {
  id: string
  username: string
  full_name: string
  password_hash: string
  is_active: boolean
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
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  private issueTokens(payload: { sub: string; tenant_id: string | null; role: string; email: string }) {
    const accessToken = this.jwt.sign({ ...payload, typ: 'access' }, { expiresIn: '15m' })
    const refreshToken = this.jwt.sign({ ...payload, typ: 'refresh' }, { expiresIn: '30d' })
    return { accessToken, refreshToken }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
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

    // ۲) اکنون که tenant مشخص شد، جستجوی کاربر در محدوده همان tenant (از طریق RLS)
    const user = await this.db.withTenant(tenant.id, async (client) => {
      const res = await client.query(
        'SELECT id, full_name, email, password_hash, role FROM identity.users WHERE email = $1',
        [dto.email.trim().toLowerCase()],
      )
      return res.rows[0]
    })
    if (!user || !(await bcrypt.compare(dto.password, user.password_hash))) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است')
    }

    const payload = { sub: user.id, tenant_id: tenant.id, role: user.role, email: user.email }
    const { accessToken, refreshToken } = this.issueTokens(payload)

    this.events.publish('user.logged_in', { userId: user.id, tenantId: tenant.id })

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, fullName: user.full_name, role: user.role, tenantId: tenant.id },
    }
  }

  /**
   * ورود سوپرادمین (پنل پلتفرم) — کاربر از جدول identity.platform_admins خوانده
   * می‌شود که به هیچ tenant‌ای وابسته نیست؛ بنابراین توکن صادرشده tenant_id = null
   * دارد و نقش آن همیشه 'super_admin' است. این جدول RLS ندارد و جستجو با
   * withPlatformAccess انجام می‌شود (هیچ app.current_tenant_id‌ای در کار نیست).
   */
  async platformLogin(dto: PlatformLoginDto): Promise<AuthResult> {
    const admin = await this.db.withPlatformAccess(async (client) => {
      const res = await client.query<PlatformAdminRow>(
        'SELECT id, username, full_name, password_hash, is_active FROM identity.platform_admins WHERE username = $1',
        [dto.username.trim().toLowerCase()],
      )
      return res.rows[0]
    })

    // پیام خطا عمداً یکسان است تا نشود وجود/عدم وجود یک نام کاربری را حدس زد
    if (!admin || !admin.is_active || !(await bcrypt.compare(dto.password, admin.password_hash))) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است')
    }

    await this.db.withPlatformAccess(async (client) => {
      await client.query('UPDATE identity.platform_admins SET last_login_at = now() WHERE id = $1', [admin.id])
    })

    const payload = { sub: admin.id, tenant_id: null, role: 'super_admin', email: admin.username }
    const { accessToken, refreshToken } = this.issueTokens(payload)

    this.events.publish('platform_admin.logged_in', { userId: admin.id, username: admin.username })

    return {
      accessToken,
      refreshToken,
      user: { id: admin.id, fullName: admin.full_name, role: 'super_admin', tenantId: null },
    }
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
      const newPayload = { sub: admin.id, tenant_id: null, role: 'super_admin', email: admin.username }
      const tokens = this.issueTokens(newPayload)
      return {
        ...tokens,
        user: { id: admin.id, fullName: admin.full_name, role: 'super_admin', tenantId: null },
      }
    }

    const user = await this.fetchUser(payload.tenant_id, payload.sub)
    if (!user) {
      throw new UnauthorizedException('کاربر یافت نشد')
    }

    const newPayload = { sub: user.id, tenant_id: payload.tenant_id, role: user.role, email: user.email }
    const { accessToken, refreshToken: newRefreshToken } = this.issueTokens(newPayload)

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, fullName: user.full_name, role: user.role, tenantId: payload.tenant_id },
    }
  }

  /** پروفایل کاربر جاری — برای بازیابی نشست فرانت‌اند بعد از رفرش صفحه (GET /auth/me) */
  async me(current: JwtPayload) {
    if (current.role === 'super_admin' || !current.tenant_id) {
      const admin = await this.fetchPlatformAdmin(current.sub)
      if (!admin || !admin.is_active) {
        throw new UnauthorizedException('کاربر یافت نشد')
      }
      return { id: admin.id, fullName: admin.full_name, role: 'super_admin', tenantId: null }
    }
    const user = await this.fetchUser(current.tenant_id, current.sub)
    if (!user) {
      throw new UnauthorizedException('کاربر یافت نشد')
    }
    return { id: user.id, fullName: user.full_name, role: user.role, tenantId: current.tenant_id }
  }

  private fetchUser(tenantId: string, userId: string): Promise<UserRow | undefined> {
    return this.db.withTenant(tenantId, async (client) => {
      const res = await client.query('SELECT id, full_name, email, role FROM identity.users WHERE id = $1', [
        userId,
      ])
      return res.rows[0]
    })
  }

  private fetchPlatformAdmin(adminId: string): Promise<PlatformAdminRow | undefined> {
    return this.db.withPlatformAccess(async (client) => {
      const res = await client.query<PlatformAdminRow>(
        'SELECT id, username, full_name, password_hash, is_active FROM identity.platform_admins WHERE id = $1',
        [adminId],
      )
      return res.rows[0]
    })
  }
}
