import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'
import { EventsModule } from '../events/events.module'
import { RealtimeModule } from '../realtime/realtime.module'

@Module({
  imports: [EventsModule, RealtimeModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
