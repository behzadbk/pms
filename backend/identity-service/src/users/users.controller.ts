import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { StaffService } from './staff.service'
import { CreateStaffDto, UpdateStaffDto } from './dto/staff.dto'
import { AccountantsService } from './accountants.service'
import { CreateAccountantDto, UpdateAccountantDto } from './dto/accountant.dto'

/**
 * نمونه یک Endpoint tenant-scoped — نشان می‌دهد چطور بقیه ماژول‌های
 * این سرویس (و به همین الگو، بقیه ۵ سرویس دیگر) باید از withTenant استفاده کنند.
 */
@Controller('users')
export class UsersController {
  constructor(
    private readonly db: DatabaseService,
    private readonly staff: StaffService,
    private readonly accountants: AccountantsService,
  ) {}

  @Roles('admin', 'super_admin')
  @Get()
  async listUsers(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        'SELECT id, full_name, email, username, role, department, is_active FROM identity.users ORDER BY full_name',
      )
      return res.rows
      // نکته: حتی اگر این query عمداً یا اشتباهاً tenant_id را در WHERE فراموش کند،
      // Policy سطح دیتابیس (RLS) بازهم فقط ردیف‌های همین tenant را برمی‌گرداند —
      // این خط دفاعی مستقل از صحت کد Application Layer است.
    })
  }

  /* ───────────── کارکنان (مدیریت توسط مدیر ساختمان) ───────────── */

  @Roles('admin')
  @Get('staff')
  listStaff(@CurrentUser() user: JwtPayload) {
    return this.staff.list(user.tenant_id!)
  }

  @Roles('admin')
  @Post('staff')
  createStaff(@CurrentUser() user: JwtPayload, @Body() dto: CreateStaffDto) {
    return this.staff.create(user.tenant_id!, dto, user.sub)
  }

  @Roles('admin')
  @Patch('staff/:id')
  updateStaff(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(user.tenant_id!, id, dto, user.sub)
  }

  @Roles('admin')
  @Delete('staff/:id')
  deleteStaff(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.remove(user.tenant_id!, id, user.sub)
  }

  /* ───────────── حسابداران (ساخت توسط مدیر ساختمان) ───────────── */

  @Roles('admin')
  @Get('accountants')
  listAccountants(@CurrentUser() user: JwtPayload) {
    return this.accountants.list(user.tenant_id!)
  }

  @Roles('admin')
  @Post('accountants')
  createAccountant(@CurrentUser() user: JwtPayload, @Body() dto: CreateAccountantDto) {
    return this.accountants.create(user.tenant_id!, dto, user.sub)
  }

  @Roles('admin')
  @Patch('accountants/:id')
  updateAccountant(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountantDto) {
    return this.accountants.update(user.tenant_id!, id, dto, user.sub)
  }

  @Roles('admin')
  @Delete('accountants/:id')
  deleteAccountant(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.accountants.remove(user.tenant_id!, id, user.sub)
  }
}
