import { Module } from '@nestjs/common'
import { ChargesController } from './charges.controller'
import { FormulasController } from './formulas.controller'
import { PropertyClientModule } from '../property-client/property-client.module'
import { EventsModule } from '../events/events.module'

@Module({
  imports: [PropertyClientModule, EventsModule],
  controllers: [ChargesController, FormulasController],
})
export class ChargesModule {}
