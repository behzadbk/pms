import { Module } from '@nestjs/common'
import { LedgerController } from './ledger.controller'
import { InternalUnitSource } from './internal-unit.source'
import { DemoStaffSource, NoStaffSource } from './staff.sources'
import { STAFF_SOURCE, UNIT_SOURCE } from './provider'

/** انتخاب منبع حقوق: ACCOUNTING_STAFF_SOURCE = none (پیش‌فرض) | demo (فقط خارج از production) */
export function pickStaffSource(env: NodeJS.ProcessEnv = process.env) {
  const want = (env.ACCOUNTING_STAFF_SOURCE ?? 'none').toLowerCase()
  if (want === 'demo' && env.NODE_ENV !== 'production') return new DemoStaffSource()
  return new NoStaffSource()
}

@Module({
  controllers: [LedgerController],
  providers: [
    { provide: UNIT_SOURCE, useClass: InternalUnitSource },
    { provide: STAFF_SOURCE, useFactory: () => pickStaffSource() },
  ],
})
export class LedgerModule {}
