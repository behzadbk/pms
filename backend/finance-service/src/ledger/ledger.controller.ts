import { Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { STAFF_SOURCE, StaffLedgerSource, StaffRow, UNIT_SOURCE, UnitLedgerSource } from './provider'

/**
 * پروفایل مالی واحد و کارمند — فقط‌خواندنی. فقط حسابداری و مدیر ساختمان؛ ساکنین، کارکنان و نگهبانی هرگز
 * (وضعیت تسویه‌ی هر واحد برای دیگران پنهان است). ما چیزی نمی‌نویسیم؛ همه‌چیز از منبع حسابداری خوانده می‌شود.
 */
@Controller('accounting')
@Roles('accountant', 'admin')
export class LedgerController {
  constructor(
    private readonly db: DatabaseService,
    @Inject(UNIT_SOURCE) private readonly units: UnitLedgerSource,
    @Inject(STAFF_SOURCE) private readonly staff: StaffLedgerSource,
  ) {}

  @Get('status')
  status() {
    return { units: this.units.status(), staff: this.staff.status(), read_only: true }
  }

  @Get('units')
  listUnits(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, (client) => this.units.listUnits(client))
  }

  @Get('units/:id/profile')
  unitProfile(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const p = await this.units.unitProfile(client, id)
      if (!p) throw new NotFoundException('واحد پیدا نشد')
      return p
    })
  }

  @Get('staff')
  listStaff(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) =>
      (await client.query<StaffRow>(
        `SELECT id, full_name, department, is_active FROM identity.users WHERE role = 'staff' ORDER BY is_active DESC, full_name`,
      )).rows,
    )
  }

  @Get('staff/:id/profile')
  staffProfile(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const s = (await client.query<StaffRow>(
        `SELECT id, full_name, department, is_active FROM identity.users WHERE id = $1 AND role = 'staff'`, [id],
      )).rows[0]
      if (!s) throw new NotFoundException('کارمند پیدا نشد')
      return this.staff.staffProfile(s)
    })
  }
}
