import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { StaffService } from './staff.service'

@Module({
  controllers: [UsersController],
  providers: [StaffService],
})
export class UsersModule {}
