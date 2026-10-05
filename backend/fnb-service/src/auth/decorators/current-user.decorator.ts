import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export interface JwtPayload {
  sub: string // user id
  tenant_id: string | null // null فقط برای super_admin
  role: string
  email: string
  /** 'access' | 'refresh' — توکن‌های قدیمی بدون این فیلد access در نظر گرفته می‌شوند */
  typ?: 'access' | 'refresh'
  /** شخص (residency.users.id) — برای ساکن */
  pid?: string
  /** دسترسی‌های کارمند: kitchen | cafe | … */
  perms?: string[]
  /** 'family' برای ورود عضو خانواده (کودک) */
  kind?: string
  mid?: string
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest()
  return request.user
})
