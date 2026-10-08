import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets'
import { Injectable, Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { JWT_ALGORITHMS, jwtSecret } from '../auth/jwt-secret'

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
@WebSocketGateway({
  // CORS fail-closed: در production بدون CORS_ORIGIN هیچ مبدأ cross-origin مجاز نیست
  cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : process.env.NODE_ENV !== 'production' },
  namespace: '/guard-live',
})
export class GuardGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server
  private readonly logger = new Logger(GuardGateway.name)

  constructor(private readonly jwt: JwtService) {}

  /**
   * فقط نقش‌های نگهبانی (مدیر، نگهبان، کارمند لابی/نگهبانی) به این کانال می‌پیوندند: رویدادها شامل پلاک خودرو، نام مهمان
   * و بسته‌های هر واحد است و نباید به ساکنین/کودکان واحدهای دیگر برسد (پیش‌تر هر کاربرِ ساختمان وارد room می‌شد).
   * اتصال هم‌زمان با انقضای توکن (۱۵ دقیقه) بسته می‌شود تا کاربرِ مسدود/خارج‌شده برای همیشه رویداد نگیرد؛ کلاینت با
   * توکن تازه دوباره وصل می‌شود. توکن فقط از handshake.auth خوانده می‌شود (نه query که در لاگ‌ها می‌ماند).
   */
  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token
      if (typeof token !== 'string' || !token) throw new Error('no token')
      const payload = this.jwt.verify(token, { secret: jwtSecret(), algorithms: JWT_ALGORITHMS })
      if (payload.typ === 'refresh' || !payload.tenant_id) throw new Error('invalid token')
      const perms: string[] = Array.isArray(payload.perms) ? payload.perms : []
      const allowed =
        payload.role === 'admin' ||
        payload.role === 'guard' ||
        (payload.role === 'staff' && perms.some((p) => p === 'lobby' || p === 'security'))
      if (!allowed) throw new Error('role not allowed')
      client.join(`tenant:${payload.tenant_id}`)
      const ttl = typeof payload.exp === 'number' ? payload.exp * 1000 - Date.now() : 0
      if (ttl <= 0) throw new Error('expired')
      const timer = setTimeout(() => client.disconnect(true), ttl)
      client.on('disconnect', () => clearTimeout(timer))
      this.logger.log(`اتصال جدید به پنل زنده نگهبانی — tenant ${payload.tenant_id}`)
    } catch {
      client.disconnect(true)
    }
  }

  broadcastGuardEvent(tenantId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, data)
  }
}
