import { Module } from '@nestjs/common'
import { AccountantsController } from './accountants.controller'
import { AccountantsService } from './accountants.service'

@Module({ controllers: [AccountantsController], providers: [AccountantsService] })
export class AccountantsModule {}
