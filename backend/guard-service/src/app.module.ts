import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { EventsModule } from './events/events.module'
import { RealtimeModule } from './realtime/realtime.module'
import { GuestPassesModule } from './guest-passes/guest-passes.module'
import { ParcelsModule } from './parcels/parcels.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    EventsModule,
    HealthModule,
    AuthModule,
    RealtimeModule,
    GuestPassesModule,
    ParcelsModule,
  ],
})
export class AppModule {}
