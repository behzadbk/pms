import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { NotificationsProcessor } from './notifications.processor'
import { NotificationEventsConsumer } from './notification-events.consumer'
import { PushService } from '../push/push.service'
import { PushController } from '../push/push.controller'

@Module({
  controllers: [PushController],
  providers: [NotificationsService, NotificationsProcessor, NotificationEventsConsumer, PushService],
})
export class NotificationsModule {}
