import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { EventsModule } from './events/events.module'
import { ChargesModule } from './charges/charges.module'
import { PaymentsModule } from './payments/payments.module'
import { InvoicesModule } from './invoices/invoices.module'
import { BillingModule } from './billing/billing.module'
import { ReportsModule } from './reports/reports.module'
import { ImportsModule } from './imports/imports.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    EventsModule,
    HealthModule,
    AuthModule,
    ChargesModule,
    PaymentsModule,
    InvoicesModule,
    BillingModule,
    ReportsModule,
    ImportsModule,
  ],
})
export class AppModule {}
