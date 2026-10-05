import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { StaffService } from './staff.service'
import { AccountantsService } from './accountants.service'

@Module({
  controllers: [UsersController],
  providers: [StaffService, AccountantsService],
})
export class UsersModule {}
