import { Module } from '@nestjs/common'
import { OverdueService } from './overdue.service'

@Module({ providers: [OverdueService] })
export class OverdueModule {}
