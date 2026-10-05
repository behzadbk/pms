import { Module } from '@nestjs/common'
import { ReportsController } from './reports.controller'
import { MeController } from './me.controller'
import { BillingModule } from '../billing/billing.module'

@Module({ imports: [BillingModule], controllers: [ReportsController, MeController] })
export class ReportsModule {}
