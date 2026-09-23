import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets'
import { Injectable, Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { jwtSecret } from '../auth/jwt-secret'

/**
 * پیاده‌سازی واقعی «به‌روزرسانی آنی» توضیح‌داده‌شده در docs/FEATURES-DEEP-DIVE.md بخش ۷.۲/۷.۳ —
 * هر اتصال Socket.io بر اساس tenant_id موجود در JWT به یک Room اختصاصی همان مجتمع می‌پیوندد
 * (room:tenant:{tenantId})، تا رویدادهای یک مجتمع هرگز به مجتمع دیگر broadcast نشود.
 *
 * برای مقیاس‌پذیری افقی (چند Pod)، این Gateway باید با Redis Adapter (@socket.io/redis-adapter)
 * پیکربندی شود تا broadcast بین Podهای مختلف هم همگام بماند — این بخش برای اختصار در این
 * تحویل پیاده‌سازی نشده؛ نصب adapter تنها تغییر لازم برای Production چند-Pod است.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : true }, namespace: '/guard-live' })
export class GuardGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server
  private readonly logger = new Logger(GuardGateway.name)

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token ?? client.handshake.query?.token
      const payload = this.jwt.verify(token as string, { secret: jwtSecret() })
      if (payload.typ === 'refresh') throw new Error('refresh token')
      client.join(`tenant:${payload.tenant_id}`)
      this.logger.log(`اتصال جدید به پنل زنده نگهبانی — tenant ${payload.tenant_id}`)
    } catch {
      client.disconnect(true)
    }
  }

  broadcastGuardEvent(tenantId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, data)
  }
}
