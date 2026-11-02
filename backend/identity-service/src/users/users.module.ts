import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { StaffService } from './staff.service'
import { AccountantsService } from './accountants.service'
import { DepartmentsService } from './departments.service'
import { GrantsService } from './grants.service'

@Module({
  controllers: [UsersController],
  providers: [StaffService, AccountantsService, DepartmentsService, GrantsService],
})
export class UsersModule {}
