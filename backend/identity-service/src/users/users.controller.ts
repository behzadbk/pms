import { Controller, Get } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

/**
 * نمونه یک Endpoint tenant-scoped — نشان می‌دهد چطور بقیه ماژول‌های
 * این سرویس (و به همین الگو، بقیه ۵ سرویس دیگر) باید از withTenant استفاده کنند.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly db: DatabaseService) {}

  @Roles('admin', 'super_admin')
  @Get()
  async listUsers(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        'SELECT id, full_name, email, role, is_active FROM identity.users ORDER BY full_name',
      )
      return res.rows
      // نکته: حتی اگر این query عمداً یا اشتباهاً tenant_id را در WHERE فراموش کند،
      // Policy سطح دیتابیس (RLS) بازهم فقط ردیف‌های همین tenant را برمی‌گرداند —
      // این خط دفاعی مستقل از صحت کد Application Layer است.
    })
  }
}
