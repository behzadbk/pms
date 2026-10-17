import 'reflect-metadata'

// @nestjs/jwt ESM است و برای خواندن متادیتای Routeها لازم نیست
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))

import { FormulasController } from '../../billing/formulas.controller'
import { SettingsController } from '../../billing/settings.controller'
import { ChargesController } from '../../charges/charges.controller'
import { HealthController } from '../../health/health.controller'
import { ImportsController } from '../../imports/imports.controller'
import { InvoicesController } from '../../invoices/invoices.controller'
import { PaymentsController } from '../../payments/payments.controller'
import { MeController } from '../../reports/me.controller'
import { ReportsController } from '../../reports/reports.controller'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

/**
 * تست ماتریس RBAC برای finance-service: RolesGuard مسیرِ بدون @Roles را برای هر کاربر واردشده
 * باز میگذارد، پس هر Route باید صریحاً @Roles یا @Public داشته باشد. با افزودن Route مالیِ جدید
 * بدون تصمیم دسترسی، این تست میشکند. مسیرهای تغییردهنده (غیر GET) نباید برای resident/guard باز باشند.
 */
const controllers = [
  FormulasController,
  SettingsController,
  ChargesController,
  HealthController,
  ImportsController,
  InvoicesController,
  PaymentsController,
  MeController,
  ReportsController,
]

// مسیرهایی که عمداً برای هر کاربر احراز هویتشده بازند؛ با دلیل
const ANY_AUTHENTICATED_ALLOWLIST = new Set<string>([
  // فقط میگوید درگاه آنلاین فعال است یا نه (برای نمایش دکمهی پرداخت)؛ دادهی حساسی برنمیگرداند
  'PaymentsController.gateway',
])

const GET = 0

describe('finance RBAC route metadata', () => {
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
      const rolesOf = (): string[] => Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, ctrl) ?? []
      const publicOf = (): boolean => (Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, ctrl)) === true

      it(`${id} declares @Roles or @Public`, () => {
        if (ANY_AUTHENTICATED_ALLOWLIST.has(id)) return
        expect(publicOf() || rolesOf().length > 0).toBe(true)
      })
      it(`${id} mutating routes are closed to resident/guard`, () => {
        const method = Reflect.getMetadata('method', handler)
        if (method === GET || publicOf()) return
        const roles = rolesOf()
        // تنها استثنا: ساکن میتواند پرداخت خودش را آغاز کند، فقط در PaymentsController.
        const residentPaymentAllowed = ctrl === PaymentsController
        if (!residentPaymentAllowed) expect(roles).not.toContain('resident')
        expect(roles).not.toContain('guard')
      })
    }
  }
})
