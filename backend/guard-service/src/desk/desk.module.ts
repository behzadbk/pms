import { Module } from '@nestjs/common'
import { DeskController } from './desk.controller'
import { RealtimeModule } from '../realtime/realtime.module'

@Module({
  imports: [RealtimeModule],
  controllers: [DeskController],
})
export class DeskModule {}
