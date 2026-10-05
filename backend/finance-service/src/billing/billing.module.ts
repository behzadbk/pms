import { Module } from '@nestjs/common'
import { SettingsService } from './settings.service'
import { ChargeEngine } from './charge-engine.service'
import { OverdueService } from './overdue.service'
import { SettingsController } from './settings.controller'
import { FormulasController } from './formulas.controller'

@Module({
  controllers: [SettingsController, FormulasController],
  providers: [SettingsService, ChargeEngine, OverdueService],
  exports: [SettingsService, ChargeEngine, OverdueService],
})
export class BillingModule {}
