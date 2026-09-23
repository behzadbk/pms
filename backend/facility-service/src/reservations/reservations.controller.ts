import { Body, Controller, Get, Param, Post, Query, ConflictException, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { EventsService } from '../events/events.service'
import { PropertyClientService } from '../property-client/property-client.service'
import { BookingValidationService } from './booking-validation.service'

interface CreateReservationBody {
  unitId: string
  startAt: string // ISO
  endAt: string
}

@Controller('amenities')
export class ReservationsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly propertyClient: PropertyClientService,
    private readonly validator: BookingValidationService,
  ) {}

  @Get(':amenityId/calendar')
  async calendar(
    @Param('amenityId') amenityId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `SELECT start_at, end_at, status FROM facility.reservations
         WHERE amenity_id = $1 AND start_at < $3 AND end_at > $2
         ORDER BY start_at`,
        [amenityId, from, to],
      )
      return res.rows
    })
  }

  @Post(':amenityId/reservations')
  async create(
    @Param('amenityId') amenityId: string,
    @Body() body: CreateReservationBody,
    @CurrentUser() user: JwtPayload,
  ) {
    const tenantId = user.tenant_id!

    // ۱) اعتبارسنجی واحد از طریق property-svc (gRPC داخلی — بدون کپی جدول units)
    const unit = await this.propertyClient.getUnitById(body.unitId, tenantId).catch(() => null)
    if (!unit?.found) {
      throw new NotFoundException('واحد یافت نشد')
    }

    return this.db.withTenant(tenantId, async (client) => {
      const amenityRes = await client.query(`SELECT * FROM facility.amenities WHERE id = $1`, [amenityId])
      const amenity = amenityRes.rows[0]
      if (!amenity) throw new NotFoundException('مشاع یافت نشد')

      const ruleRes = await client.query(
        `SELECT * FROM facility.booking_rules WHERE amenity_id = $1 AND is_active = true LIMIT 1`,
        [amenityId],
      )
      const rule = ruleRes.rows[0]
      if (!rule) throw new NotFoundException('قانون رزرو برای این مشاع تعریف نشده است')

      const startAt = new Date(body.startAt)
      const endAt = new Date(body.endAt)

      const check = await this.validator.check(client, rule, body.unitId, startAt, endAt)
      if (!check.ok) {
        throw new ConflictException({ message: 'این رزرو مجاز نیست', violations: check.violations })
      }

      const status = amenity.requires_approval ? 'pending_approval' : 'confirmed'

      // نکته: حتی با عبور از چک بالا، درج زیر ممکن است به‌خاطر EXCLUDE Constraint
      // (رزرو هم‌زمان رقیب) با خطای دیتابیس رد شود — این دقیقاً لایه دفاعی دوم
      // توضیح‌داده‌شده در بخش ۴ سند ARCHITECTURE-SAAS.md است.
      let insertRes
      try {
        insertRes = await client.query(
          `INSERT INTO facility.reservations
             (tenant_id, amenity_id, unit_id, requested_by, start_at, end_at, status, applied_rule_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [tenantId, amenityId, body.unitId, user.sub, startAt, endAt, status, rule.id],
        )
      } catch (err: unknown) {
        const pgErr = err as { code?: string }
        if (pgErr.code === '23P01') {
          // exclusion_violation — یعنی بین چک بالا و این INSERT، شخص دیگری همین بازه را گرفت
          throw new ConflictException('این بازه لحظاتی پیش توسط شخص دیگری رزرو شد؛ لطفاً بازه دیگری انتخاب کنید')
        }
        throw err
      }

      const reservation = insertRes.rows[0]
      this.events.publish(
        status === 'pending_approval' ? 'reservation.pending_approval' : 'reservation.created',
        { reservationId: reservation.id, unitId: body.unitId, amenityId, startAt: body.startAt },
        tenantId,
      )

      return { ...reservation, depositRequired: Number(rule.deposit_amount) > 0 ? rule.deposit_amount : 0 }
    })
  }
}
