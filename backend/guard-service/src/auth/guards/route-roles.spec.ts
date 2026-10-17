import 'reflect-metadata'

// @nestjs/jwt ESM است و برای خواندن متادیتای Routeها لازم نیست
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))

import { DeskController } from '../../desk/desk.controller'
import { GuestPassesController } from '../../guest-passes/guest-passes.controller'
import { ParcelsController } from '../../parcels/parcels.controller'
import { HealthController } from '../../health/health.controller'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/**
 * تست ماتریس RBAC: RolesGuard مسیرِ بدون @Roles را برای هر کاربر واردشده باز میگذارد،
 * پس هر Route باید صریحاً @Roles یا @Public داشته باشد. با افزودن Route بدون تصمیم دسترسی، این تست میشکند.
 */
const controllers = [DeskController, GuestPassesController, ParcelsController, HealthController]

// Routeهای نگهبانی/مدیریتی نباید برای ساکن/کودک باز باشند، مگر در لیست استثناء (با دلیل)
const GATE_PREFIXES = ['DeskController.', 'ParcelsController.']
const RESIDENT_ALLOWED = new Set<string>([
  'ParcelsController.mine', // ساکن بستههای خودش را میبیند (فیلتر سمت سرور)
])

describe('guard-service RBAC route metadata', () => {
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
      const handler = proto[name]
      const roles: string[] = Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, ctrl) ?? []
      it(`${id} declares @Roles or @Public`, () => {
        const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, ctrl)
        expect(isPublic === true || roles.length > 0).toBe(true)
      })
      if (GATE_PREFIXES.some((p) => id.startsWith(p)) && !RESIDENT_ALLOWED.has(id)) {
        it(`${id} is not open to resident/child`, () => {
          expect(roles).not.toContain('resident')
          expect(roles).not.toContain('child')
        })
      }
    }
  }
})
