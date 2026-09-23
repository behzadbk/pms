import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { NotificationsProcessor } from './notifications.processor'
import { NotificationEventsConsumer } from './notification-events.consumer'

@Module({
  providers: [NotificationsService, NotificationsProcessor, NotificationEventsConsumer],
})
export class NotificationsModule {}
