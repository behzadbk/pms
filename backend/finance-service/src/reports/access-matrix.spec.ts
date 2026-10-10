import 'reflect-metadata'
import { ROLES_KEY } from '../auth/decorators/roles.decorator'
import { ChargesController } from '../charges/charges.controller'
import { InvoicesController } from '../invoices/invoices.controller'
import { ImportsController } from '../imports/imports.controller'
import { FormulasController } from '../billing/formulas.controller'
import { SettingsController } from '../billing/settings.controller'
import { ReportsController } from './reports.controller'
import { MeController } from './me.controller'

/**
 * ماتریس دسترسی مالی — بدهی/ریزگزارش واحدها فقط برای مدیر (و حسابدار برای عملیات)،
 * هرگز برای ساکنِ دیگر، کارمند، نگهبان یا کودک. ساکن فقط صورتحساب واحد خودش را می‌بیند.
 * اگر endpoint تازه‌ای بدون @Roles یا با نقش نامجاز اضافه شود، این تست می‌شکند.
 */
type Ctrl = { prototype: Record<string, unknown> }
const PATH_METADATA = 'path'

function handlers(ctrl: Ctrl): { name: string; roles: string[] | undefined }[] {
  return Object.getOwnPropertyNames(ctrl.prototype)
    .filter((n) => n !== 'constructor' && typeof ctrl.prototype[n] === 'function' && Reflect.getMetadata(PATH_METADATA, ctrl.prototype[n] as object) !== undefined)
    .map((name) => ({
      name,
      roles: (Reflect.getMetadata(ROLES_KEY, ctrl.prototype[name] as object) ?? Reflect.getMetadata(ROLES_KEY, ctrl)) as string[] | undefined,
    }))
}

const FINANCE_STAFF_ROLES = ['admin', 'accountant']

describe('ماتریس دسترسی مالی', () => {
  const financeControllers: [string, Ctrl][] = [
    ['ChargesController', ChargesController as unknown as Ctrl],
    ['InvoicesController', InvoicesController as unknown as Ctrl],
    ['ImportsController', ImportsController as unknown as Ctrl],
    ['FormulasController', FormulasController as unknown as Ctrl],
    ['SettingsController', SettingsController as unknown as Ctrl],
    ['ReportsController', ReportsController as unknown as Ctrl],
  ]

  it.each(financeControllers)('%s: هر endpoint نقش صریح دارد و فقط مدیر/حسابدار', (_n, ctrl) => {
    const hs = handlers(ctrl)
    expect(hs.length).toBeGreaterThan(0)
    for (const h of hs) {
      expect(h.roles).toBeDefined()
      expect(h.roles!.length).toBeGreaterThan(0)
      for (const r of h.roles!) expect(FINANCE_STAFF_ROLES).toContain(r)
    }
  })

  it('ریز مصرف واحدها (شارژ متغیر) فقط مدیر', () => {
    const h = handlers(ReportsController as unknown as Ctrl).find((x) => x.name === 'variableCharges')
    expect(h?.roles).toEqual(['admin'])
  })

  it('MeController (صورتحساب ساکن) فقط نقش resident است و ریز واحدِ دیگران را برنمی‌گرداند', () => {
    const hs = handlers(MeController as unknown as Ctrl)
    expect(hs.map((h) => h.name)).toEqual(expect.arrayContaining(['charges', 'receipts', 'fnbBills']))
    for (const h of hs) expect(h.roles).toEqual(['resident'])
  })
})
