import { Module } from '@nestjs/common'
import { PlatformController } from './platform.controller'
import { PlatformService } from './platform.service'
import { PlatformInsightsService } from './platform-insights.service'
import { EventsModule } from '../events/events.module'

@Module({
  imports: [EventsModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformInsightsService],
  exports: [PlatformService],
})
export class PlatformModule {}
