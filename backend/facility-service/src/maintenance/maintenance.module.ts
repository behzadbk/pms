import { Module } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { TicketsController } from './tickets.controller'
import { AssetsController } from './assets.controller'

@Module({ imports: [EventsModule], controllers: [TicketsController, AssetsController] })
export class MaintenanceModule {}
