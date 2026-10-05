import { Module } from '@nestjs/common'
import { MenuController } from './menu.controller'
import { VenuesController } from './venues.controller'
import { EventsModule } from '../events/events.module'
import { RealtimeModule } from '../realtime/realtime.module'

@Module({
  imports: [EventsModule, RealtimeModule],
  controllers: [MenuController, VenuesController],
})
export class MenuModule {}
