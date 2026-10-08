import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REQUIRE_MODULE_KEY } from '../decorators/require-module.decorator'
import { FeatureKey, isBuildingTier, tierHasFeature } from '../tiers'

/**
 * بررسی سطح سرویس ساختمان (claim «tier» در JWT) برای @RequireModule.
 *
 * - فقط وقتی ENFORCE_TIER_MODULES=true باشد اعمال می‌شود (پیش‌فرض خاموش): ستون tenants.tier پیش‌فرض «simple» دارد
 *   و روشن‌کردن بی‌مقدمه، ماژول‌های فعلیِ ساختمان‌های موجود را قطع می‌کند. پیش از روشن‌کردن، tier ساختمان‌ها را مرور کنید.
 * - super_admin و توکن‌های بدون claim «tier» (صادرشده پیش از انتشار) عبور می‌کنند؛ توکن دسترسی ≤ ۱۵ دقیقه عمر دارد.
 * - tier نامعتبر در توکن رد می‌شود.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (process.env.ENFORCE_TIER_MODULES !== 'true') return true
    const feature = this.reflector.getAllAndOverride<FeatureKey | undefined>(REQUIRE_MODULE_KEY, [context.getHandler(), context.getClass()])
    if (!feature) return true
    const user = context.switchToHttp().getRequest().user
    if (!user) return true // احراز هویت را JwtAuthGuard انجام می‌دهد (مسیرهای @Public)
    if (user.role === 'super_admin') return true
    if (user.tier === undefined || user.tier === null) return true
    if (!isBuildingTier(user.tier) || !tierHasFeature(user.tier, feature)) {
      throw new ForbiddenException('این قابلیت در سطح سرویس ساختمان شما فعال نیست')
    }
    return true
  }
}
