import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { Roles } from '../auth/decorators/roles.decorator'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { EventsService } from '../events/events.service'
import { GuardGateway } from '../realtime/guard.gateway'

interface RegisterParcelBody {
  unitId: string
  courierCompany: string
  trackingCode?: string
  photoUrl?: string
}

/**
 * پیاده‌سازی جریان مرسولات پستی — docs/FEATURES-DEEP-DIVE.md بخش ۷.۳:
 * نگهبان فقط بارکد را اسکن می‌کند (trackingCode از سمت کلاینت پر می‌شود) و واحد را
 * انتخاب می‌کند؛ همین یک POST هم رکورد را ثبت می‌کند و هم اعلان را صادر می‌کند —
 * بدون فرم چندمرحله‌ای، دقیقاً مطابق اصل «تسهیل کار نگهبانی».
 */
@Controller('parcels')
export class ParcelsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly gateway: GuardGateway,
  ) {}

  @Roles('guard', 'admin')
  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = status
        ? await client.query(`SELECT * FROM guard.parcels WHERE status = $1 ORDER BY received_at DESC`, [status])
        : await client.query(`SELECT * FROM guard.parcels ORDER BY received_at DESC`)
      return res.rows
    })
  }

  @Roles('guard', 'admin')
  @Post()
  async register(@Body() body: RegisterParcelBody, @CurrentUser() user: JwtPayload) {
    const tenantId = user.tenant_id!
    if (!body?.unitId) throw new BadRequestException('واحد مقصد الزامی است')
    const parcel = await this.db.withTenant(tenantId, async (client) => {
      const res = await client.query(
        `INSERT INTO guard.parcels (tenant_id, unit_id, courier_company, tracking_code, received_by, photo_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_pickup') RETURNING *`,
        [tenantId, body.unitId, body.courierCompany, body.trackingCode ?? null, user.sub, body.photoUrl ?? null],
      )
      return res.rows[0]
    })

    // اعلان فوری به پنل زنده نگهبانی + انتشار رویداد برای notification-svc
    // (که مسئول ارسال واقعی Push/SMS به ساکن است — بخش ۲ سند ARCHITECTURE-SAAS.md)
    this.gateway.broadcastGuardEvent(tenantId, 'parcel.received', {
      unitId: parcel.unit_id,
      courier: parcel.courier_company,
    })
    this.events.publish('parcel.received', { unitId: parcel.unit_id, parcelId: parcel.id }, tenantId)

    return parcel
  }

  @Roles('guard', 'admin')
  @Post(':id/pickup-confirm')
  async confirmPickup(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `UPDATE guard.parcels SET status = 'picked_up', picked_up_at = now()
         WHERE id = $1 AND status = 'pending_pickup' RETURNING *`,
        [id],
      )
      if (!res.rows[0]) throw new NotFoundException('مرسوله یافت نشد یا قبلاً تحویل شده است')
      return res.rows[0]
    })
  }
}
