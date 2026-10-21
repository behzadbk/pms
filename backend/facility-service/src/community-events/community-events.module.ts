import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { CommunityEventsController } from './community-events.controller';

@Module({
  imports: [EventsModule],
  controllers: [CommunityEventsController],
})
export class CommunityEventsModule {}
