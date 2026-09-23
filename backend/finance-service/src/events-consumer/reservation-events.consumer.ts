import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import * as amqp from 'amqp-connection-manager'
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager'
import type { ConfirmChannel, ConsumeMessage } from 'amqplib'
import { EventEnvelope } from './event-envelope.interface'

const EXCHANGE = 'pms.events'
const QUEUE = 'finance_svc_reservation_events'

interface ReservationPayload {
  reservationId: string
  unitId: string
  amenityId: string
  startAt: string
}

/**
 * مصرف‌کننده واقعی رویدادهای facility-svc — بخش ۲ سند ARCHITECTURE-SAAS.md.
 * این صف فقط با الگوی 'reservation.*' به Topic Exchange مشترک bind می‌شود، پس
 * finance-svc هرگز رویدادهای دامنه‌های دیگر (guest.*, parcel.*, ...) را دریافت
 * نمی‌کند — نمونه واقعی مزیت اصلی Topic Exchange نسبت به صف مشترک همه‌رویدادها.
 *
 * پیاده‌سازی مستقیم با amqp-connection-manager (نه @nestjs/microservices RMQ)
 * چون آن ترانسپورت در نسخه نصب‌شده امکان bind به Exchange/routingKey دلخواه را ندارد
 * (فقط consume از یک صف ساده) — همان محدودیتی که در events.service.ts (سمت انتشار) مستند شده.
 */
@Injectable()
export class ReservationEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationEventsConsumer.name)
  private connection: AmqpConnectionManager
  private channel: ChannelWrapper

  onModuleInit() {
    this.connection = amqp.connect([process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'])
    this.connection.on('connect', () => this.logger.log('مصرف‌کننده رویداد رزرو به RabbitMQ متصل شد'))

    this.channel = this.connection.createChannel({
      json: true,
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true })
        await ch.assertQueue(QUEUE, { durable: true })
        await ch.bindQueue(QUEUE, EXCHANGE, 'reservation.*')
        await ch.prefetch(10)
        await ch.consume(QUEUE, (msg) => this.onMessage(ch, msg), { noAck: false })
      },
    })
  }

  private onMessage(ch: ConfirmChannel, msg: ConsumeMessage | null) {
    if (!msg) return
    try {
      const envelope: EventEnvelope<ReservationPayload> = JSON.parse(msg.content.toString())
      const routingKey = msg.fields.routingKey

      if (routingKey === 'reservation.created') {
        this.logger.log(
          `رویداد دریافت شد: reservation.created — واحد ${envelope.payload.unitId}، مشاع ${envelope.payload.amenityId}`,
        )
        // TODO Production: اگر amenity بیعانه دارد، اینجا یک finance.payments با purpose='deposit' ساخته می‌شود
      } else if (routingKey === 'reservation.pending_approval') {
        this.logger.log(`رویداد دریافت شد: reservation.pending_approval — رزرو ${envelope.payload.reservationId}`)
      } else {
        this.logger.log(`رویداد دریافت شد (بدون Handler اختصاصی): ${routingKey}`)
      }

      ch.ack(msg) // تایید دستی — جلوگیری از پردازش دوباره در صورت crash میان‌کار
    } catch (err) {
      this.logger.error(`پردازش رویداد ناموفق بود: ${(err as Error).message}`)
      ch.nack(msg, false, false) // پیام خراب را dead-letter می‌کند (drop) نه requeue بی‌نهایت
    }
  }

  async onModuleDestroy() {
    await this.channel?.close()
    await this.connection?.close()
  }
}
