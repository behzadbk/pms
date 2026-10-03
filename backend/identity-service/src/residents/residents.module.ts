import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ManagerService } from './manager.service'
import { JoinService } from './join.service'
import { HouseholdService } from './household.service'
import { ChildService } from './child.service'
import { AdminResidentsService } from './admin-residents.service'
import { HousekeepingService } from './housekeeping.service'
import { TowerService } from './tower.service'
import {
  AdminResidentsController,
  HouseholdController,
  ManagerResidentsController,
  MeController,
  PublicResidentsController,
} from './residents.controller'

/** ماژول ساکنین، خانوار و حالت والدین — RESIDENTS.md */
@Module({
  imports: [AuthModule],
  controllers: [ManagerResidentsController, AdminResidentsController, HouseholdController, MeController, PublicResidentsController],
  providers: [ManagerService, JoinService, HouseholdService, ChildService, AdminResidentsService, HousekeepingService, TowerService],
})
export class ResidentsModule {}
