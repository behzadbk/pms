import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/roles.decorator'

/**
 * RBAC در سطح Route — مکمل RLS در سطح دیتابیس (بخش ۳ سند ARCHITECTURE-SAAS.md).
 * RLS تضمین می‌کند کاربر tenant دیگری را نمی‌بیند؛ این Guard تضمین می‌کند
 * حتی داخل همان tenant، فقط نقش مجاز به یک Endpoint حساس دسترسی دارد.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles || requiredRoles.length === 0) return true

    const { user } = context.switchToHttp().getRequest()
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('نقش شما اجازه دسترسی به این عملیات را ندارد')
    }
    return true
  }
}
