import { Module } from '@nestjs/common'
import { InvoicesController } from './invoices.controller'
import { EventsModule } from '../events/events.module'

@Module({ imports: [EventsModule], controllers: [InvoicesController] })
export class InvoicesModule {}
