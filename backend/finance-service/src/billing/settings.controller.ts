import { Body, Controller, Get, Put } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { SettingsService } from './settings.service'

/**
 * تنظیمات مالی ساختمان. نرخ جریمه‌ی دیرکرد تصمیم مالک/مدیر است؛ فقط مدیر می‌تواند آن را تغییر دهد
 * و تا وقتی فعال نشود هیچ جریمه‌ای محاسبه نمی‌شود.
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly db: DatabaseService, private readonly settings: SettingsService) {}

  @Roles('admin', 'accountant')
  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (c) => this.settings.get(c, user.tenant_id!))
  }

  @Roles('admin')
  @Put()
  put(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (c) => this.settings.update(c, user.tenant_id!, body, user.sub))
  }
}
