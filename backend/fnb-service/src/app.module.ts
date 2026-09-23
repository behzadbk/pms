import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { EventsModule } from './events/events.module'
import { RealtimeModule } from './realtime/realtime.module'
import { MenuModule } from './menu/menu.module'
import { OrdersModule } from './orders/orders.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule, EventsModule, HealthModule, AuthModule,
    RealtimeModule, MenuModule, OrdersModule,
  ],
})
export class AppModule {}
