import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { jwtSecret } from '../auth/jwt-secret'
import { GuardGateway } from './guard.gateway'

@Module({
  imports: [
    JwtModule.registerAsync({ useFactory: () => ({ secret: jwtSecret() }) }),
  ],
  providers: [GuardGateway],
  exports: [GuardGateway],
})
export class RealtimeModule {}
