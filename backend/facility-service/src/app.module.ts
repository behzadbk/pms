import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { ReservationsModule } from './reservations/reservations.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { ServiceDeskModule } from './service-desk/service-desk.module';
import { CommunityEventsModule } from './community-events/community-events.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    EventsModule,
    HealthModule,
    AuthModule,
    ReservationsModule,
    MaintenanceModule,
    EntitlementsModule,
    ServiceDeskModule,
    CommunityEventsModule,
  ],
})
export class AppModule {}
