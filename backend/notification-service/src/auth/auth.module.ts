import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { jwtSecret } from './jwt-secret'
import { PassportModule } from '@nestjs/passport'
import { APP_GUARD } from '@nestjs/core'
import { JwtStrategy } from './jwt.strategy'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { RolesGuard } from './guards/roles.guard'

/**
 * این سرویس توکن صادر نمی‌کند (فقط identity-svc این کار را می‌کند) — این ماژول
 * صرفاً امضای JWT را با همان کلید/سکرت مشترک اعتبارسنجی می‌کند (بخش ۲ سند
 * ARCHITECTURE-SAAS.md: «کاهش تماس‌های داخلی» با اعتبارسنجی محلی توکن).
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
      }),
    }),
  ],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
