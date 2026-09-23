import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import * as amqp from 'amqp-connection-manager'
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager'
import type { ConfirmChannel, ConsumeMessage } from 'amqplib'
import { NotificationsService } from './notifications.service'
import { EventEnvelope } from './event-envelope.interface'

const EXCHANGE = 'pms.events'
const QUEUE = 'notification_svc_queue'

// الگوهای Topic Exchange — notification-svc تقریباً به همه رویدادها علاقه‌مند است،
// اما bind صریح روی هر دامنه (به‌جای '#') مستندسازی بهتری از قصد سرویس می‌دهد
// و اگر بعداً دامنه‌ای اضافه شد، فراموش نشدن bind آن در Code Review راحت‌تر دیده می‌شود.
const BINDING_PATTERNS = ['guest.*', 'parcel.*', 'payment.*', 'charge.*', 'reservation.*', 'poll.*', 'user.*', 'order.*']

/**
 * مصرف‌کننده اصلی notification-svc — بخش ۲ سند ARCHITECTURE-SAAS.md
 * («notification-svc: subscribe همه رویدادهای بالا»). هر پیام را به یک
 * NotificationJob ترجمه و در صف BullMQ (notifications.service.ts) قرار می‌دهد؛
 * ارسال واقعی SMS/Push/Email در notifications.processor.ts (Worker جدا) انجام
 * می‌شود تا Ack کردن پیام RabbitMQ منتظر تماس با ارائه‌دهنده بیرونی نماند.
 */
@Injectable()
export class NotificationEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationEventsConsumer.name)
  private connection: AmqpConnectionManager
  private channel: ChannelWrapper

  constructor(private readonly notifications: NotificationsService) {}

  onModuleInit() {
    this.connection = amqp.connect([process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'])
    this.connection.on('connect', () => this.logger.log('مصرف‌کننده اعلان به RabbitMQ متصل شد'))
    this.connection.on('disconnect', (p) => this.logger.warn(`اتصال RabbitMQ قطع شد: ${p.err?.message}`))

    this.channel = this.connection.createChannel({
      json: true,
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true })
        await ch.assertQueue(QUEUE, { durable: true })
        await Promise.all(BINDING_PATTERNS.map((pattern) => ch.bindQueue(QUEUE, EXCHANGE, pattern)))
        await ch.prefetch(20)
        await ch.consume(QUEUE, (msg) => this.onMessage(ch, msg), { noAck: false })
        this.logger.log(`صف ${QUEUE} با الگوهای [${BINDING_PATTERNS.join(', ')}] به Exchange متصل شد`)
      },
    })
  }

  private async onMessage(ch: ConfirmChannel, msg: ConsumeMessage | null) {
    if (!msg) return
    try {
      const envelope: EventEnvelope = JSON.parse(msg.content.toString())
      await this.dispatch(envelope)
      ch.ack(msg)
    } catch (err) {
      this.logger.error(`پردازش رویداد ناموفق بود: ${(err as Error).message}`)
      ch.nack(msg, false, false)
    }
  }

  private async dispatch(env: EventEnvelope) {
    switch (env.event_type) {
      case 'guest.checked_in': {
        const p = env.payload as { unitId: string; guestName: string }
        await this.notifications.enqueue({
          tenantId: env.tenant_id,
          channel: 'push',
          recipientRef: p.unitId,
          title: 'ورود مهمان',
          body: `مهمان شما ${p.guestName} وارد ساختمان شد`,
          sourceEvent: env.event_type,
        })
        break
      }
      case 'parcel.received': {
        const p = env.payload as { unitId: string }
        await this.notifications.enqueue({
          tenantId: env.tenant_id,
          channel: 'push',
          recipientRef: p.unitId,
          title: 'مرسوله جدید',
          body: 'یک مرسوله جدید در نگهبانی منتظر شماست',
          sourceEvent: env.event_type,
        })
        break
      }
      case 'payment.succeeded': {
        const p = env.payload as { unitId: string }
        await this.notifications.enqueue({
          tenantId: env.tenant_id,
          channel: 'sms',
          recipientRef: p.unitId,
          title: 'پرداخت موفق',
          body: 'پرداخت شارژ شما با موفقیت ثبت شد',
          sourceEvent: env.event_type,
        })
        break
      }
      case 'charge.overdue': {
        const p = env.payload as { unitId: string; dueDate: string }
        await this.notifications.enqueue({
          tenantId: env.tenant_id,
          channel: 'sms',
          recipientRef: p.unitId,
          title: 'یادآوری شارژ معوق',
          body: `شارژ واحد شما از تاریخ ${p.dueDate} پرداخت نشده است`,
          sourceEvent: env.event_type,
        })
        break
      }
      case 'reservation.approved': {
        const p = env.payload as { unitId: string; amenityName: string }
        await this.notifications.enqueue({
          tenantId: env.tenant_id,
          channel: 'push',
          recipientRef: p.unitId,
          title: 'تایید رزرو',
          body: `رزرو شما برای ${p.amenityName} تایید شد`,
          sourceEvent: env.event_type,
        })
        break
      }
      case 'poll.opened': {
        const p = env.payload as { title: string }
        await this.notifications.enqueue({
          tenantId: env.tenant_id,
          channel: 'push',
          recipientRef: 'building-broadcast',
          title: 'نظرسنجی جدید',
          body: p.title,
          sourceEvent: env.event_type,
        })
        break
      }
      // ---- سفارش غذا (fnb-svc) — بخش ۱.۴ سند UPDATE-V2 ----
      case 'order.accepted':
      case 'order.preparing':
      case 'order.ready':
      case 'order.out_for_delivery':
      case 'order.delivered':
      case 'order.rejected': {
        const p = env.payload as { orderId: string; unitId: string }
        const statusText: Record<string, string> = {
          'order.accepted': 'سفارش شما پذیرفته شد',
          'order.preparing': 'سفارش شما در حال آماده‌سازی است',
          'order.ready': 'سفارش شما آماده است',
          'order.out_for_delivery': 'سفارش شما در مسیر تحویل است',
          'order.delivered': 'سفارش شما تحویل داده شد',
          'order.rejected': 'متأسفانه سفارش شما پذیرفته نشد',
        }
        await this.notifications.enqueue({
          tenantId: env.tenant_id,
          channel: 'push',
          recipientRef: p.unitId,
          title: 'وضعیت سفارش',
          body: statusText[env.event_type],
          sourceEvent: env.event_type,
        })
        break
      }
      default:
        this.logger.log(`رویداد بدون Handler اختصاصی دریافت شد و نادیده گرفته شد: ${env.event_type}`)
    }
  }

  async onModuleDestroy() {
    await this.channel?.close()
    await this.connection?.close()
  }
}
