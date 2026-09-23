import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Worker, Job } from 'bullmq'
import type { NotificationJob } from './notifications.service'
import { DatabaseService } from '../database/database.service'

/**
 * Worker واقعی BullMQ که صف `notifications` را مصرف می‌کند و بسته به کانال،
 * به ارائه‌دهنده مربوطه وصل می‌شود. چون این تحویل فاقد اعتبارنامه واقعی
 * SMS/Push/Email (Kavenegar/FCM/SMTP) است، هر کانال یک شبیه‌سازی مستند‌شده
 * انجام می‌دهد؛ نقطه اتصال واقعی دقیقاً همین‌جا (متدهای send*) قرار می‌گیرد.
 */
@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProcessor.name)
  private worker: Worker<NotificationJob>

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    this.worker = new Worker<NotificationJob>(
      'notifications',
      async (job: Job<NotificationJob>) => this.handle(job.data),
      {
        connection: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
        concurrency: 5,
      },
    )

    this.worker.on('completed', (job) => this.logger.log(`اعلان ارسال شد: ${job.id} (${job.data.channel})`))
    this.worker.on('failed', (job, err) => this.logger.error(`ارسال اعلان ناموفق: ${job?.id} — ${err.message}`))
  }

  private async handle(job: NotificationJob) {
    switch (job.channel) {
      case 'sms':
        await this.sendSms(job)
        break
      case 'push':
        await this.sendPush(job)
        break
      case 'email':
        await this.sendEmail(job)
        break
    }

    // ثبت در delivery_log برای گزارش‌گیری و رفع اشکال (بدون RLS چون notification-svc
    // برای گزارش‌گیری داخلی خودش نیاز به cross-tenant scan هم دارد — اینجا با tenant واقعی ثبت می‌شود)
    if (job.tenantId) {
      await this.db.withTenant(job.tenantId, async (client) => {
        await client.query(
          `INSERT INTO notification.delivery_log (tenant_id, channel, recipient_ref, title, source_event, sent_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [job.tenantId, job.channel, job.recipientRef, job.title, job.sourceEvent],
        )
      })
    }
  }

  // نقطه اتصال واقعی: جایگزینی با SDK کاوه‌نگار/قاصدک (ایران) یا Twilio
  private async sendSms(job: NotificationJob) {
    this.logger.log(`[شبیه‌سازی SMS] به ${job.recipientRef}: ${job.body}`)
  }

  // نقطه اتصال واقعی: web-push (VAPID) برای PWA + FCM برای اپ موبایل در صورت وجود
  private async sendPush(job: NotificationJob) {
    this.logger.log(`[شبیه‌سازی Push] به ${job.recipientRef}: ${job.title} — ${job.body}`)
  }

  // نقطه اتصال واقعی: SMTP/SES
  private async sendEmail(job: NotificationJob) {
    this.logger.log(`[شبیه‌سازی Email] به ${job.recipientRef}: ${job.title}`)
  }

  async onModuleDestroy() {
    await this.worker?.close()
  }
}
