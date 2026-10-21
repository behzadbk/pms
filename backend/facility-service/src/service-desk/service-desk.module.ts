import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ServiceTypesController } from './service-types.controller';
import { ServiceRequestsController } from './service-requests.controller';

@Module({
  imports: [EventsModule],
  controllers: [ServiceTypesController, ServiceRequestsController],
})
export class ServiceDeskModule {}
