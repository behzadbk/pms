import { Module } from '@nestjs/common'
import { CleaningFeedbackController } from './cleaning-feedback.controller'
import { CleaningFeedbackService } from './cleaning-feedback.service'
import { CleaningController } from './cleaning.controller'
import { CleaningService } from './cleaning.service'
import { EntitlementsController } from './entitlements.controller'
import { EntitlementsService } from './entitlements.service'

@Module({
  controllers: [EntitlementsController, CleaningController, CleaningFeedbackController],
  providers: [EntitlementsService, CleaningService, CleaningFeedbackService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
