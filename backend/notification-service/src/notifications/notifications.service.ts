import { Injectable, Logger } from '@nestjs/common'
import { Queue } from 'bullmq'

export type NotificationChannel = 'sms' | 'push' | 'email'

export interface NotificationJob {
  tenantId: string | null
  channel: NotificationChannel
  // در Production واقعی، شناسه کاربر/واحد به شماره موبایل یا Push Subscription
  // از طریق فراخوانی gRPC به identity-svc/property-svc نگاشت می‌شود (بخش ۲ سند
  // ARCHITECTURE-SAAS.md)؛ اینجا برای اختصار همان unitId/userId مستقیم لاگ می‌شود.
  recipientRef: string
  title: string
  body: string
  sourceEvent: string
}

/**
 * لایه صف‌بندی — بخش ۲ سند ARCHITECTURE-SAAS.md: «سرویس صف‌بندی (BullMQ/Redis) جهت
 * ارسال پیامک، Push Notification و ایمیل». مصرف‌کننده‌های RabbitMQ (events-consumer/)
 * فقط رویداد را به‌شکل یک NotificationJob در این صف قرار می‌دهند؛ Worker واقعی در
 * notifications.processor.ts روی صف مصرف می‌کند — این تفکیک باعث می‌شود اگر یک
 * ارائه‌دهنده SMS/Push کند یا موقتاً از دسترس خارج شود، مصرف رویداد RabbitMQ (که باید
 * سریع ack شود) بلاک نشود.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)
  private readonly queue: Queue<NotificationJob>

  constructor() {
    this.queue = new Queue<NotificationJob>('notifications', {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    })
  }

  async enqueue(job: NotificationJob) {
    this.logger.log(`صف‌بندی اعلان [${job.channel}] برای ${job.recipientRef} — منبع: ${job.sourceEvent}`)
    await this.queue.add(job.channel, job)
  }

  async onModuleDestroy() {
    await this.queue.close()
  }
}
