import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

interface UpsertRuleBody {
  maxBookingsPerUnitPerPeriod: number
  periodType: 'day' | 'week' | 'month'
  minAdvanceHours: number
  maxAdvanceDays: number
  depositAmount?: number
}

@Controller('amenities')
export class AmenitiesController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(`SELECT * FROM facility.amenities ORDER BY name`)
      return res.rows
    })
  }

  @Get(':id/booking-rules')
  async getRule(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `SELECT * FROM facility.booking_rules WHERE amenity_id = $1 AND is_active = true LIMIT 1`,
        [id],
      )
      return res.rows[0] ?? null
    })
  }

  @Roles('admin')
  @Put(':id/booking-rules')
  async upsertRule(@Param('id') id: string, @Body() body: UpsertRuleBody, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      // نسخه فعلی قانون غیرفعال می‌شود (نه حذف) — تا رزروهای گذشته همچنان قابل ردیابی
      // به قانونی باشند که در لحظه ثبت اعمال شده (applied_rule_id در جدول reservations)
      await client.query(`UPDATE facility.booking_rules SET is_active = false WHERE amenity_id = $1`, [id])
      const res = await client.query(
        `INSERT INTO facility.booking_rules
           (tenant_id, amenity_id, max_bookings_per_unit_per_period, period_type,
            min_advance_hours, max_advance_days, deposit_amount, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
        [
          user.tenant_id,
          id,
          body.maxBookingsPerUnitPerPeriod,
          body.periodType,
          body.minAdvanceHours,
          body.maxAdvanceDays,
          body.depositAmount ?? 0,
        ],
      )
      return res.rows[0]
    })
  }
}
