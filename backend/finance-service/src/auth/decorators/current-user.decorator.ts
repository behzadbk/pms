import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export interface JwtPayload {
  sub: string // user id
  tenant_id: string | null // null فقط برای super_admin
  role: string
  email: string
  /** 'access' | 'refresh' — توکن‌های قدیمی بدون این فیلد access در نظر گرفته می‌شوند */
  typ?: 'access' | 'refresh'
  /** شناسه‌ی شخص (residency.users.id) برای ساکنین */
  pid?: string
  perms?: string[]
  /** 'family' = نشست کودک با کد خانواده */
  kind?: string
  /** عضویت کودک در نشست خانواده */
  mid?: string
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest()
  return request.user
})
