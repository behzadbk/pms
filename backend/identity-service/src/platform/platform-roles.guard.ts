import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PlatformAdminRole } from '../auth/platform-roles'

const KEY = 'platform_roles'

/**
 * محدودسازی ریزتر داخل تیم پلتفرم. بدون این دکوراتور هر super_admin اجازه دارد (مثل قبل).
 * نقش (`prole`) را JwtStrategy از دیتابیس می‌خواند، پس تغییر نقش بلافاصله اثر می‌کند.
 */
export const PlatformRoles = (...roles: PlatformAdminRole[]) => SetMetadata(KEY, roles)

@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<PlatformAdminRole[] | undefined>(KEY, [ctx.getHandler(), ctx.getClass()])
    if (!roles?.length) return true
    const user = ctx.switchToHttp().getRequest().user
    if (!user?.prole || !roles.includes(user.prole)) {
      throw new ForbiddenException('نقش شما در تیم پلتفرم اجازه‌ی این عملیات را ندارد')
    }
    return true
  }
}
