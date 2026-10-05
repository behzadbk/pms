import { Module } from '@nestjs/common'
import { TicketsController } from './tickets.controller'
import { CmmsController } from './cmms.controller'
import { AssetsController } from './assets.controller'
import { MaintenanceScheduler } from './scheduler.service'

@Module({
  controllers: [TicketsController, CmmsController, AssetsController],
  providers: [MaintenanceScheduler],
})
export class MaintenanceModule {}
