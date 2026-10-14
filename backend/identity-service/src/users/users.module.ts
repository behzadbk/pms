import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { StaffService } from './staff.service'
import { AccountantsService } from './accountants.service'
import { DepartmentsService } from './departments.service'

@Module({
  controllers: [UsersController],
  providers: [StaffService, AccountantsService, DepartmentsService],
})
export class UsersModule {}
