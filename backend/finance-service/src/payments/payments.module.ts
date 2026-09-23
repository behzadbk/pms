import { Module } from '@nestjs/common'
import { PaymentsController } from './payments.controller'
import { EventsModule } from '../events/events.module'

@Module({
  imports: [EventsModule],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
