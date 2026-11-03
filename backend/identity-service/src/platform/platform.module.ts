import { Module } from '@nestjs/common'
import { PlatformController } from './platform.controller'
import { PlatformService } from './platform.service'
import { PlatformInsightsService } from './platform-insights.service'
import { PlatformAuditService } from './platform-audit.service'
import { PlatformSettingsService } from './platform-settings.service'
import { PlatformLifecycleService } from './platform-lifecycle.service'
import { PlatformHealthService } from './platform-health.service'
import { PlatformNotesService } from './platform-notes.service'
import { PlatformAdminsService } from './platform-admins.service'
import { PlatformRolesGuard } from './platform-roles.guard'
import { EventsModule } from '../events/events.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [EventsModule, AuthModule],
  controllers: [PlatformController],
  providers: [
    PlatformService,
    PlatformInsightsService,
    PlatformAuditService,
    PlatformSettingsService,
    PlatformLifecycleService,
    PlatformHealthService,
    PlatformNotesService,
    PlatformAdminsService,
    PlatformRolesGuard,
  ],
  exports: [PlatformService],
})
export class PlatformModule {}
