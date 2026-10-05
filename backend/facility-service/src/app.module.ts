import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { EventsModule } from './events/events.module'
import { ReservationsModule } from './reservations/reservations.module'
import { MaintenanceModule } from './maintenance/maintenance.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    EventsModule,
    HealthModule,
    AuthModule,
    ReservationsModule,
    MaintenanceModule,
  ],
})
export class AppModule {}
