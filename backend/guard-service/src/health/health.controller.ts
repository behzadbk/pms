import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'
import { DatabaseService } from '../database/database.service'
import { Public } from '../auth/decorators/public.decorator'

/**
 * Endpointهای liveness/readiness برای Kubernetes probes
 * (infra/k8s/base/deployment.identity-svc.yaml از این دو مسیر استفاده می‌کند)
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseService,
  ) {}

  // liveness: فقط تأیید می‌کند پروسه بالاست و پاسخ می‌دهد — نباید به دیتابیس وابسته باشد
  @Public()
  @Get('live')
  live() {
    return { status: 'ok' }
  }

  // readiness: تأیید می‌کند سرویس آماده پذیرش ترافیک است (اتصال دیتابیس برقرار است)
  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.db.pingHealthIndicator()])
  }
}
