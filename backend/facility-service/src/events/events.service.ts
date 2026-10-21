import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import * as amqp from 'amqp-connection-manager'
import type { ChannelWrapper, AmqpConnectionManager } from 'amqp-connection-manager'
import type { ConfirmChannel } from 'amqplib'
import { randomUUID } from 'crypto'

const EXCHANGE = 'pms.events'

/**
 * انتشار رویداد دامنه روی یک Topic Exchange واقعی RabbitMQ — بخش ۲ سند
 * docs/ARCHITECTURE-SAAS.md («قرارداد Event مشترک»). routingKey همان eventType
 * است (مثلاً 'guest.checked_in')، تا مصرف‌کننده‌ها بتوانند با الگو (مثل 'guest.*')
 * فقط رویدادهای مدنظر خودشان را bind کنند.
 *
 * نکته پیاده‌سازی: از amqp-connection-manager مستقیم استفاده شده، نه انتزاع
 * ClientProxy در @nestjs/microservices — چون آن ماژول در نسخه فعلی فقط از
 * sendToQueue روی صف مقصد پشتیبانی می‌کند و امکان publish روی یک Exchange
 * دلخواه (topic) را نمی‌دهد؛ برای معماری «یک ناشر، چند مصرف‌کننده مستقل»،
 * دسترسی مستقیم به Exchange ضروری است.
 */
@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name)
  private readonly connection: AmqpConnectionManager
  private readonly channel: ChannelWrapper

  constructor() {
    this.connection = amqp.connect([process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'])
    this.connection.on('connect', () => this.logger.log('اتصال به RabbitMQ برقرار شد'))
    this.connection.on('disconnect', (params) => this.logger.warn(`اتصال RabbitMQ قطع شد: ${params.err?.message}`))

    this.channel = this.connection.createChannel({
      json: true,
      setup: (ch: ConfirmChannel) => ch.assertExchange(EXCHANGE, 'topic', { durable: true }),
    })
  }

  publish(eventType: string, payload: Record<string, unknown>, tenantId?: string | null) {
    const envelope = {
      event_id: randomUUID(),
      event_type: eventType,
      tenant_id: tenantId ?? (payload.tenantId as string | undefined) ?? null,
      occurred_at: new Date().toISOString(),
      payload,
      trace_id: randomUUID(),
    }
    this.logger.log(`انتشار رویداد: ${eventType}`)
    this.channel
      .publish(EXCHANGE, eventType, envelope)
      .catch((err: Error) => this.logger.error(`انتشار رویداد ${eventType} ناموفق بود: ${err.message}`))
  }

  async onModuleDestroy() {
    await this.channel.close()
    await this.connection.close()
  }
}
