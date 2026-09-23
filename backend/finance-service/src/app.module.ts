import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { EventsModule } from './events/events.module'
import { ChargesModule } from './charges/charges.module'
import { PaymentsModule } from './payments/payments.module'
import { ReservationEventsConsumer } from './events-consumer/reservation-events.consumer'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    EventsModule,
    HealthModule,
    AuthModule,
    ChargesModule,
    PaymentsModule,
  ],
  providers: [ReservationEventsConsumer],
})
export class AppModule {}
