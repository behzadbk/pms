import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { EventsModule } from './events/events.module'
import { ChargesModule } from './charges/charges.module'
import { PaymentsModule } from './payments/payments.module'
import { BillingModule } from './billing/billing.module'
import { InvoicesModule } from './invoices/invoices.module'
import { ReportsModule } from './reports/reports.module'
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
    BillingModule,
    InvoicesModule,
    ReportsModule,
  ],
  providers: [ReservationEventsConsumer],
})
export class AppModule {}
