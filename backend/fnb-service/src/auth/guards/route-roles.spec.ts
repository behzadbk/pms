import 'reflect-metadata'

// @nestjs/jwt ESM است و برای خواندن متادیتای Routeها لازم نیست
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))

import { OrdersController } from '../../orders/orders.controller'
import { MenuController } from '../../menu/menu.controller'
import { HealthController } from '../../health/health.controller'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/**
 * تست ماتریس RBAC: RolesGuard مسیرِ بدون @Roles را برای هر کاربر واردشده باز میگذارد،
 * پس هر Route باید صریحاً @Roles یا @Public داشته باشد (یا در لیست استثناء بیاید).
 * با افزودن Route جدید بدون تصمیم دسترسی، این تست میشکند.
 */
const controllers = [OrdersController, MenuController, HealthController]

// مسیرهایی که عمداً برای هر کاربر احراز هویتشده (بدون محدودیت نقش) بازند؛ با دلیل
const ANY_AUTHENTICATED_ALLOWLIST = new Set<string>([
  // کاتالوگ منو/مکانها/مناطق تحویل: خواندنی برای همهی نقشهای واردشده (ساکن و کودک هم سفارش میدهند)
  'MenuController.venues',
  'MenuController.menu',
  'MenuController.zones',
])

describe('fnb RBAC route metadata', () => {
  for (const ctrl of controllers) {
    const proto = ctrl.prototype
    const names = Object.getOwnPropertyNames(proto).filter(
      (n) => n !== 'constructor' && typeof proto[n] === 'function' && Reflect.getMetadata('path', proto[n]) !== undefined,
    )
    it(`${ctrl.name} has route handlers`, () => {
      expect(names.length).toBeGreaterThan(0)
    })
    for (const name of names) {
      const id = `${ctrl.name}.${name}`
      it(`${id} declares @Roles or @Public`, () => {
        const handler = proto[name]
        const roles: string[] | undefined = Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, ctrl)
        const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, ctrl)
        if (ANY_AUTHENTICATED_ALLOWLIST.has(id)) return
        expect(isPublic === true || (Array.isArray(roles) && roles.length > 0)).toBe(true)
      })
      it(`${id} does not mix child with management roles`, () => {
        // کودک سفارش میدهد (parent-mode) اما هیچ Routeی نباید همزمان کودک و admin/staff را مدیریتی کند، مگر فقط-خواندنی
        const handler = proto[name]
        const roles: string[] = Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, ctrl) ?? []
        const method = Reflect.getMetadata('method', handler) // 0 = GET
        const mgmt = roles.includes('admin') || roles.includes('staff')
        if (mgmt && method !== 0) expect(roles).not.toContain('child')
      })
    }
  }
})
