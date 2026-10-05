import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { EventsModule } from './events/events.module'
import { ChargesModule } from './charges/charges.module'
import { PaymentsModule } from './payments/payments.module'
import { FormulasModule } from './formulas/formulas.module'
import { SettingsModule } from './settings/settings.module'
import { InvoicesModule } from './invoices/invoices.module'
import { SummaryModule } from './summary/summary.module'
import { OverdueModule } from './overdue/overdue.module'
import { BillingModule } from './billing/billing.module'
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
    FormulasModule,
    SettingsModule,
    InvoicesModule,
    SummaryModule,
    OverdueModule,
    BillingModule,
    ReportsModule,
  ],
  providers: [ReservationEventsConsumer],
})
export class AppModule {}
