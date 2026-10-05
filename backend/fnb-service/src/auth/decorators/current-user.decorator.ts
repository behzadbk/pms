import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export interface JwtPayload {
  sub: string // user id
  tenant_id: string | null // null فقط برای super_admin
  role: string
  email: string
  /** 'access' | 'refresh' — توکن‌های قدیمی بدون این فیلد access در نظر گرفته می‌شوند */
  typ?: 'access' | 'refresh'
  /** شخص (residency.users) — ساکن و کودک */
  pid?: string
  /** 'family' = نشست کودک با کد خانواده */
  kind?: 'family'
  /** عضویت کودک در نشست خانواده */
  mid?: string
  /** دسترسی‌های مؤثر کارمند */
  perms?: string[]
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest()
  return request.user
})
