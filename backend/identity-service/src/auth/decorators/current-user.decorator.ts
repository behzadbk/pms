import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export interface JwtPayload {
  sub: string // user id
  tenant_id: string | null // null فقط برای super_admin
  role: string
  email: string
  /** 'access' | 'refresh' — توکن‌های قدیمی بدون این فیلد access در نظر گرفته می‌شوند */
  typ?: 'access' | 'refresh'
  /** شناسه‌ی شخص (residency.users) — برای ساکن و کودک */
  pid?: string
  /** 'family' = نشست کودک که با کد/QR خانواده ساخته شده (sub همان pid است) */
  kind?: 'family'
  /** عضویت کودک در نشست خانواده */
  mid?: string
  /** دسترسی‌های مؤثر کارمند (برای بررسی در سرویس‌های دیگر بدون تماس با identity) */
  perms?: string[]
  /** سطح سرویس ساختمان در زمان صدور توکن (simple | economic | professional) — ماتریس: platform/tiers.ts */
  tier?: 'simple' | 'economic' | 'professional'
  /** نقش داخل تیم پلتفرم (فقط super_admin) — توسط JwtStrategy از دیتابیس خوانده می‌شود، نه از توکن */
  prole?: 'owner' | 'support' | 'sales'
  /** فقط نشست «ورود به‌جای مدیر»: نام کاربری سوپرادمینی که وارد شده (در لاگ فعالیت ثبت می‌شود) */
  imp?: string
  iat?: number
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest()
  return request.user
})
