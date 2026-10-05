import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { Roles } from '../auth/decorators/roles.decorator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { EventsService } from '../events/events.service'
import { GuardGateway } from '../realtime/guard.gateway'
import { assertDesk, faDigits, myMembership, notify, unitRecipients } from '../common/access'

interface RegisterParcelBody {
  unitId: string
  courierCompany?: string
  trackingCode?: string
  photoUrl?: string
}

const PARCEL_SELECT = `
  SELECT p.id, p.unit_id, u.unit_number, p.courier_company, p.tracking_code, p.photo_url, p.status, p.received_at, p.picked_up_at
    FROM guard.parcels p LEFT JOIN property.units u ON u.id = p.unit_id`

/**
 * جریان مرسولات پستی — docs/FEATURES-DEEP-DIVE.md بخش ۷.۳:
 * نگهبان واحد را انتخاب می‌کند و کد رهگیری را وارد می‌کند؛ همین یک POST هم رکورد را ثبت می‌کند
 * و هم برای ساکنان واحد اعلان (پوش) می‌سازد.
 */
@Controller('parcels')
export class ParcelsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly gateway: GuardGateway,
  ) {}

  @Roles('guard', 'admin', 'staff')
  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query('status') status?: string, @Query('limit') limit?: string) {
    assertDesk(user)
    const n = Math.min(Math.max(Number(limit) || 100, 1), 300)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `${PARCEL_SELECT} WHERE ($1::text IS NULL OR p.status = $1)
          ORDER BY (p.status = 'pending_pickup') DESC, COALESCE(p.picked_up_at, p.received_at) DESC LIMIT $2`,
        [status || null, n])
      return res.rows
    })
  }

  /** مرسولات واحد من (ساکن) — منتظر تحویل بالاتر */
  @Roles('resident', 'child')
  @Get('mine')
  async mine(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await myMembership(client, user)
      const res = await client.query(
        `${PARCEL_SELECT} WHERE p.unit_id = $1 ORDER BY (p.status = 'pending_pickup') DESC, p.received_at DESC LIMIT 30`, [m.unit_id])
      return res.rows
    })
  }

  @Roles('guard', 'admin', 'staff')
  @Post()
  async register(@Body() body: RegisterParcelBody, @CurrentUser() user: JwtPayload) {
    assertDesk(user)
    const tenantId = user.tenant_id!
    if (!body?.unitId) throw new BadRequestException('واحد مقصد الزامی است')
    const courier = (body.courierCompany ?? '').trim().slice(0, 60) || null
    const tracking = (body.trackingCode ?? '').trim().slice(0, 60) || null
    const parcel = await this.db.withTenant(tenantId, async (client) => {
      const unit = await client.query<{ unit_number: string }>('SELECT unit_number FROM property.units WHERE id = $1', [body.unitId])
      if (!unit.rows[0]) throw new NotFoundException('واحد یافت نشد')
      const res = await client.query(
        `INSERT INTO guard.parcels (tenant_id, unit_id, courier_company, tracking_code, received_by, photo_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_pickup') RETURNING id`,
        [tenantId, body.unitId, courier, tracking, user.sub, body.photoUrl ?? null])
      // اعلان به ساکنان واحد (DB trigger + notification-service پوش را می‌فرستند)
      await notify(client, tenantId, await unitRecipients(client, body.unitId), {
        kind: 'parcel_received',
        title: 'مرسوله‌ای برای شما در نگهبانی منتظر است',
        body: [courier, tracking && `کد ${tracking}`].filter(Boolean).join(' · ') || `واحد ${faDigits(unit.rows[0].unit_number)}`,
        link: '/resident',
        ref: res.rows[0].id,
      })
      return (await client.query(`${PARCEL_SELECT} WHERE p.id = $1`, [res.rows[0].id])).rows[0]
    })
    this.gateway.broadcastGuardEvent(tenantId, 'parcel.received', { unitId: parcel.unit_id, courier: parcel.courier_company })
    this.events.publish('parcel.received', { unitId: parcel.unit_id, parcelId: parcel.id }, tenantId)
    return parcel
  }

  @Roles('guard', 'admin', 'staff')
  @Post(':id/pickup-confirm')
  async confirmPickup(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    assertDesk(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `UPDATE guard.parcels SET status = 'picked_up', picked_up_at = now()
          WHERE id = $1 AND status = 'pending_pickup' RETURNING id`, [id])
      if (!res.rows[0]) throw new NotFoundException('مرسوله یافت نشد یا قبلاً تحویل شده است')
      return (await client.query(`${PARCEL_SELECT} WHERE p.id = $1`, [id])).rows[0]
    })
  }
}
