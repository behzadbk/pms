import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { NotificationsModule } from './notifications/notifications.module'
import { AnnouncementsModule } from './announcements/announcements.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    NotificationsModule,
    AnnouncementsModule,
  ],
})
export class AppModule {}
