import { Module } from '@nestjs/common'
import { CleaningController } from './cleaning.controller'
import { CleaningService } from './cleaning.service'
import { EntitlementsController } from './entitlements.controller'
import { EntitlementsService } from './entitlements.service'

@Module({
  controllers: [EntitlementsController, CleaningController],
  providers: [EntitlementsService, CleaningService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
