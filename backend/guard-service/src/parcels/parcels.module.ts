import { Module } from '@nestjs/common'
import { ParcelsController } from './parcels.controller'
import { EventsModule } from '../events/events.module'
import { RealtimeModule } from '../realtime/realtime.module'

@Module({
  imports: [EventsModule, RealtimeModule],
  controllers: [ParcelsController],
})
export class ParcelsModule {}
