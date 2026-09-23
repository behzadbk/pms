import { Module } from '@nestjs/common'
import { GuestPassesController } from './guest-passes.controller'
import { EventsModule } from '../events/events.module'
import { RealtimeModule } from '../realtime/realtime.module'

@Module({
  imports: [EventsModule, RealtimeModule],
  controllers: [GuestPassesController],
})
export class GuestPassesModule {}
