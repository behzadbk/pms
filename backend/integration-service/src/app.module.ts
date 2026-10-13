import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { ErpApiModule, IntegrationAdminModule } from './erp/integration.module'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, HealthModule, AuthModule, ErpApiModule, IntegrationAdminModule],
})
export class AppModule {}
