import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets'
import { Injectable, Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { JWT_ALGORITHMS, jwtSecret } from '../auth/jwt-secret'

/**
 * پخش زنده تغییرات منو و وضعیت سفارش — بخش ۱.۵ سند UPDATE-V2.
 * هر اتصال بر اساس tenant_id در JWT به Room مجتمع خودش می‌پیوندد، تا تغییر
 * موجودی یک رستوران هرگز به مجتمع دیگری نشت نکند.
 *
 * برای چند-Pod در Production، افزودن @socket.io/redis-adapter لازم است
 * (همان نکته‌ای که در guard.gateway.ts هم ذکر شده).
 */
@Injectable()
@WebSocketGateway({
  // CORS fail-closed: در production بدون CORS_ORIGIN هیچ مبدأ cross-origin مجاز نیست
  cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : process.env.NODE_ENV !== 'production' },
  namespace: '/fnb-live',
})
export class FnbGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server
  private readonly logger = new Logger(FnbGateway.name)

  constructor(private readonly jwt: JwtService) {}

  /**
   * رویدادهای این کانال (موجودی منو، وضعیت سفارش) فقط شناسه و وضعیت دارند و برای همه‌ی اعضای همان ساختمان مجازند؛
   * ولی اتصال باید توکن access معتبر با tenant داشته باشد و هم‌زمان با انقضای توکن بسته شود (کاربر مسدود/خارج‌شده
   * برای همیشه متصل نماند). توکن فقط از handshake.auth خوانده می‌شود، نه query.
   */
  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token
      if (typeof token !== 'string' || !token) throw new Error('no token')
      const payload = this.jwt.verify(token, { secret: jwtSecret(), algorithms: JWT_ALGORITHMS })
      if (payload.typ === 'refresh' || !payload.tenant_id) throw new Error('invalid token')
      const ttl = typeof payload.exp === 'number' ? payload.exp * 1000 - Date.now() : 0
      if (ttl <= 0) throw new Error('expired')
      client.join(`tenant:${payload.tenant_id}`)
      const timer = setTimeout(() => client.disconnect(true), ttl)
      client.on('disconnect', () => clearTimeout(timer))
    } catch {
      client.disconnect(true)
    }
  }

  broadcast(tenantId: string, event: string, data: unknown) {
    this.server?.to(`tenant:${tenantId}`).emit(event, data)
  }
}
