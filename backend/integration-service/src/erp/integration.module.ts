import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { DispatcherService } from './dispatcher.service'
import { ErpController } from './erp.controller'
import { ErpKeyGuard } from './erp-key.guard'
import { SandboxController } from './sandbox.controller'

/** API عمومی ERP (کلید API) — در Swagger اصلی /docs */
@Module({
  controllers: [ErpController],
  providers: [ErpKeyGuard],
})
export class ErpApiModule {}

/** مدیریت از پنل (JWT) + ارسال خودکار + گیرنده‌ی آزمایشی (فقط غیر production) */
@Module({
  controllers: [AdminController, ...(process.env.NODE_ENV === 'production' ? [] : [SandboxController])],
  providers: [DispatcherService],
  exports: [DispatcherService],
})
export class IntegrationAdminModule {}
