import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { jwtSecret } from './jwt-secret'
import { PassportModule } from '@nestjs/passport'
import { APP_GUARD } from '@nestjs/core'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { RolesGuard } from './guards/roles.guard'
import { EventsModule } from '../events/events.module'

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { algorithm: 'HS256' }, // در Production: RS256 با کلید خصوصی/عمومی جدا (بخش jwt.strategy.ts)
      }),
    }),
    EventsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard }, // پیش‌فرض همه Route‌ها محافظت‌شده‌اند؛ با @Public() معاف می‌شوند
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
