import 'reflect-metadata'

// @nestjs/jwt ESM است و برای خواندن متادیتای Routeها لازم نیست
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))

import { UsersController } from './users.controller'
import { ROLES_KEY } from '../auth/decorators/roles.decorator'
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator'

/**
 * ماتریس RBAC برای UsersController: هر Route باید @Roles داشته باشد، و سه Route دسترسی موقت
 * (grants) فقط برای admin باشند (نه staff و نه super_admin).
 */
const proto = UsersController.prototype
const handlers = Object.getOwnPropertyNames(proto).filter(
  (n) => n !== 'constructor' && typeof proto[n] === 'function' && Reflect.getMetadata('path', proto[n]) !== undefined,
)

describe('UsersController RBAC route metadata', () => {
  it('has route handlers', () => expect(handlers.length).toBeGreaterThan(0))

  for (const name of handlers) {
    it(`${name} declares @Roles or @Public`, () => {
      const roles = Reflect.getMetadata(ROLES_KEY, proto[name]) ?? Reflect.getMetadata(ROLES_KEY, UsersController)
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, proto[name])
      expect(isPublic === true || (Array.isArray(roles) && roles.length > 0)).toBe(true)
    })
  }

  for (const name of ['listGrants', 'createGrant', 'revokeGrant']) {
    it(`${name} is admin-only`, () => {
      expect(Reflect.getMetadata(ROLES_KEY, proto[name])).toEqual(['admin'])
    })
  }
})
