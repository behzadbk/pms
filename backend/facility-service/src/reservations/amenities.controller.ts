import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { unitOfResident } from './debtor-lock'

interface UpsertRuleBody {
  maxBookingsPerUnitPerPeriod: number
  periodType: 'day' | 'week' | 'month'
  minAdvanceHours: number
  maxAdvanceDays: number
  depositAmount?: number
}

interface AmenityBody {
  name?: string
  type?: 'pool' | 'hall' | 'roof_garden' | 'gym' | 'cinema' | 'other'
  capacity?: number | null
  requiresApproval?: boolean
  ruleText?: string | null
  /** حداکثر ساعت قابل رزرو در یک نوبت (۱ تا ۱۲) */
  maxHours?: number
  /** ساعت‌های شروع قابل رزرو در شبانه‌روز (۰ تا ۲۳، به وقت تهران) */
  slotHours?: number[]
}

/** نوع مشاع → آیکن صفحه‌ی رزرو ساکن */
const ICON_BY_TYPE: Record<string, string> = { pool: 'pool', hall: 'groups', roof_garden: 'deck', gym: 'fitness_center', cinema: 'movie', other: 'groups' }
const TYPES = Object.keys(ICON_BY_TYPE)

function cleanAmenity(b: AmenityBody, partial: boolean) {
  const out: { name?: string; type?: string; capacity?: number | null; requires_approval?: boolean; rule_text?: string | null; max_hours?: number; slot_hours?: number[] } = {}
  if (b.name !== undefined || !partial) {
    const name = String(b.name ?? '').trim()
    if (!name || name.length > 80) throw new BadRequestException('نام مشاع لازم است (حداکثر ۸۰ نویسه)')
    out.name = name
  }
  if (b.type !== undefined || !partial) {
    const type = b.type ?? 'other'
    if (!TYPES.includes(type)) throw new BadRequestException('نوع مشاع نامعتبر است')
    out.type = type
  }
  if (b.capacity !== undefined) {
    if (b.capacity !== null && (!Number.isInteger(b.capacity) || b.capacity < 1 || b.capacity > 10000)) throw new BadRequestException('ظرفیت باید عدد مثبت باشد')
    out.capacity = b.capacity
  }
  if (b.requiresApproval !== undefined) out.requires_approval = !!b.requiresApproval
  if (b.ruleText !== undefined) out.rule_text = b.ruleText ? String(b.ruleText).slice(0, 300) : null
  if (b.maxHours !== undefined) {
    if (!Number.isInteger(b.maxHours) || b.maxHours < 1 || b.maxHours > 12) throw new BadRequestException('حداکثر ساعت رزرو باید بین ۱ تا ۱۲ باشد')
    out.max_hours = b.maxHours
  }
  if (b.slotHours !== undefined) {
    if (!Array.isArray(b.slotHours) || b.slotHours.length === 0 || b.slotHours.length > 24 || !b.slotHours.every((h) => Number.isInteger(h) && h >= 0 && h <= 23)) {
      throw new BadRequestException('ساعت‌های قابل رزرو باید فهرستی از اعداد ۰ تا ۲۳ باشد')
    }
    out.slot_hours = [...new Set(b.slotHours)].sort((x, y) => x - y)
  }
  return out
}

@Controller('amenities')
export class AmenitiesController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      // «locked»: مشاعِ بسته برای واحد بدهکار (قوانین برج) — برای مدیر/کارکنان همیشه false
      const unit = await unitOfResident(client, user)
      const res = await client.query(
        `SELECT a.*, a.requires_approval AS needs_approval,
                CASE WHEN $1::uuid IS NULL THEN false
                     ELSE (residency.unit_restricted($1, 'module:amenity') OR residency.unit_restricted($1, 'amenity:' || a.id::text)) END AS locked
           FROM facility.amenities a WHERE a.is_active ORDER BY a.requires_approval DESC, a.name`,
        [unit],
      )
      return res.rows
    })
  }

  /** ساخت مشاع برای ساختمان (ساختمان تازه هیچ مشاعی ندارد) */
  @Roles('admin')
  @Post()
  async create(@Body() body: AmenityBody, @CurrentUser() user: JwtPayload) {
    const a = cleanAmenity(body ?? {}, false)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `INSERT INTO facility.amenities (tenant_id, name, type, capacity, requires_approval, icon, rule_text, max_hours, slot_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 1), COALESCE($9::int[], '{8,9,10,11,16,17,18,19,20}'::int[])) RETURNING *, requires_approval AS needs_approval`,
        [user.tenant_id, a.name, a.type, a.capacity ?? null, a.requires_approval ?? false, ICON_BY_TYPE[a.type!], a.rule_text ?? null, a.max_hours ?? null, a.slot_hours ?? null],
      )
      return res.rows[0]
    })
  }

  @Roles('admin')
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: AmenityBody, @CurrentUser() user: JwtPayload) {
    const a = cleanAmenity(body ?? {}, true)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `UPDATE facility.amenities SET
           name = COALESCE($2, name),
           type = COALESCE($3, type),
           icon = COALESCE($4, icon),
           capacity = CASE WHEN $5::boolean THEN $6::int ELSE capacity END,
           requires_approval = COALESCE($7, requires_approval),
           rule_text = CASE WHEN $8::boolean THEN $9 ELSE rule_text END,
           max_hours = COALESCE($10, max_hours),
           slot_hours = COALESCE($11::int[], slot_hours)
         WHERE id = $1 AND is_active RETURNING *, requires_approval AS needs_approval`,
        [id, a.name ?? null, a.type ?? null, a.type ? ICON_BY_TYPE[a.type] : null, 'capacity' in a, a.capacity ?? null, a.requires_approval ?? null, 'rule_text' in a, a.rule_text ?? null, a.max_hours ?? null, a.slot_hours ?? null],
      )
      if (!res.rows[0]) throw new NotFoundException('مشاع یافت نشد')
      return res.rows[0]
    })
  }

  /** حذف = غیرفعال‌سازی (رزروهای گذشته و سابقه می‌مانند) */
  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(`UPDATE facility.amenities SET is_active = false WHERE id = $1 AND is_active RETURNING id`, [id])
      if (!res.rows[0]) throw new NotFoundException('مشاع یافت نشد')
      return { ok: true }
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
