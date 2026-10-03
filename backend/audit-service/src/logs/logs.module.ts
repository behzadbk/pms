import { Module } from '@nestjs/common'
import { LogsController } from './logs.controller'
import { LogIngestService } from './log-ingest.service'
import { LogQueryService } from './log-query.service'
import { ServiceEventsConsumer } from './service-events.consumer'
import { PartitionMaintenanceService } from './partition-maintenance.service'

@Module({
  controllers: [LogsController],
  providers: [LogIngestService, LogQueryService, ServiceEventsConsumer, PartitionMaintenanceService],
})
export class LogsModule {}
