import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import * as amqp from 'amqp-connection-manager'
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager'
import type { ConfirmChannel, ConsumeMessage } from 'amqplib'
import { LogIngestService } from './log-ingest.service'

const EXCHANGE = 'pms.events'
const QUEUE = 'audit_svc_queue'

/**
 * audit-svc همه رویدادهای دامنه را مصرف می‌کند تا یک ردپای کامل از اتفاقات
 * سیستم داشته باشد. برخلاف بقیه مصرف‌کننده‌ها که الگوی محدود bind می‌کنند،
 * اینجا '#' (همه‌چیز) منطقی است — دقیقاً چون هدف این سرویس ثبت کامل است.
 */
@Injectable()
export class ServiceEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServiceEventsConsumer.name)
  private connection: AmqpConnectionManager
  private channel: ChannelWrapper

  constructor(private readonly ingest: LogIngestService) {}

  onModuleInit() {
    this.connection = amqp.connect([process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'])
    this.connection.on('connect', () => this.logger.log('audit-svc به RabbitMQ متصل شد'))

    this.channel = this.connection.createChannel({
      json: true,
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true })
        await ch.assertQueue(QUEUE, { durable: true })
        await ch.bindQueue(QUEUE, EXCHANGE, '#')
        await ch.prefetch(500) // مصرف پرحجم — درج دسته‌ای در LogIngestService انجام می‌شود
        await ch.consume(QUEUE, (msg) => this.onMessage(ch, msg), { noAck: false })
      },
    })
  }

  private onMessage(ch: ConfirmChannel, msg: ConsumeMessage | null) {
    if (!msg) return
    try {
      const env = JSON.parse(msg.content.toString())
      if (env.tenant_id) {
        this.ingest.enqueue([
          {
            tenant_id: env.tenant_id,
            occurred_at: env.occurred_at,
            session_id: env.trace_id ?? env.event_id, // رویدادهای سرور نشست کاربری ندارند
            trace_id: env.trace_id,
            source: msg.fields.routingKey.split('.')[0] + '-svc',
            level: 'info',
            action: env.event_type,
            request_body: env.payload,
          },
        ])
      }
      ch.ack(msg)
    } catch (err) {
      this.logger.error(`پردازش رویداد برای لاگ ناموفق بود: ${(err as Error).message}`)
      ch.nack(msg, false, false)
    }
  }

  async onModuleDestroy() {
    await this.channel?.close()
    await this.connection?.close()
  }
}
