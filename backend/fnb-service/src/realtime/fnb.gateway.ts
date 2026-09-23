import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets'
import { Injectable, Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { jwtSecret } from '../auth/jwt-secret'

/**
 * پخش زنده تغییرات منو و وضعیت سفارش — بخش ۱.۵ سند UPDATE-V2.
 * هر اتصال بر اساس tenant_id در JWT به Room مجتمع خودش می‌پیوندد، تا تغییر
 * موجودی یک رستوران هرگز به مجتمع دیگری نشت نکند.
 *
 * برای چند-Pod در Production، افزودن @socket.io/redis-adapter لازم است
 * (همان نکته‌ای که در guard.gateway.ts هم ذکر شده).
 */
@Injectable()
@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : true }, namespace: '/fnb-live' })
export class FnbGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server
  private readonly logger = new Logger(FnbGateway.name)

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token ?? client.handshake.query?.token
      const payload = this.jwt.verify(token as string, { secret: jwtSecret() })
      if (payload.typ === 'refresh') throw new Error('refresh token')
      client.join(`tenant:${payload.tenant_id}`)
    } catch {
      client.disconnect(true)
    }
  }

  broadcast(tenantId: string, event: string, data: unknown) {
    this.server?.to(`tenant:${tenantId}`).emit(event, data)
  }
}
