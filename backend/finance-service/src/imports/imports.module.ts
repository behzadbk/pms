import { Module } from '@nestjs/common'
import { ImportsController } from './imports.controller'
import { BillingModule } from '../billing/billing.module'
import { EventsModule } from '../events/events.module'

@Module({ imports: [BillingModule, EventsModule], controllers: [ImportsController] })
export class ImportsModule {}
