import { Module } from '@nestjs/common'
import { CleaningFeedbackController } from './cleaning-feedback.controller'
import { CleaningFeedbackService } from './cleaning-feedback.service'
import { CleaningTasksController } from './cleaning-tasks.controller'
import { CleaningTasksService } from './cleaning-tasks.service'
import { CleaningController } from './cleaning.controller'
import { CleaningService } from './cleaning.service'
import { EntitlementsController } from './entitlements.controller'
import { EntitlementsService } from './entitlements.service'

@Module({
  controllers: [EntitlementsController, CleaningController, CleaningTasksController, CleaningFeedbackController],
  providers: [EntitlementsService, CleaningService, CleaningTasksService, CleaningFeedbackService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
