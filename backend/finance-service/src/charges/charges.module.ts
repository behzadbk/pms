import { Module } from '@nestjs/common'
import { ChargesController } from './charges.controller'
import { EventsModule } from '../events/events.module'
import { BillingModule } from '../billing/billing.module'
import { PaymentsModule } from '../payments/payments.module'

@Module({
  imports: [EventsModule, BillingModule, PaymentsModule],
  controllers: [ChargesController],
})
export class ChargesModule {}
