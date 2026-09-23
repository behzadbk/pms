import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { jwtSecret } from '../auth/jwt-secret'
import { FnbGateway } from './fnb.gateway'

@Module({
  imports: [
    JwtModule.registerAsync({ useFactory: () => ({ secret: jwtSecret() }) }),
  ],
  providers: [FnbGateway],
  exports: [FnbGateway],
})
export class RealtimeModule {}
