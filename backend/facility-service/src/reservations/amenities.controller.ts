import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put,
} from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { randomUUID } from 'crypto'
import type { PoolClient } from 'pg'
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

const ICONS = ['pool', 'groups', 'deck', 'fitness_center', 'movie', 'sports_tennis', 'sports_soccer', 'local_cafe', 'meeting_room', 'child_care', 'park', 'celebration']

export class AmenityDto {
  @IsString() @MinLength(2, { message: 'نام مشاع را بنویسید' }) @MaxLength(60) name: string
  @IsOptional() @IsString() @MaxLength(40) icon?: string
  @IsOptional() @IsString() @MaxLength(400) description?: string
  @IsOptional() @IsString() @MaxLength(600) rule_text?: string
  @IsOptional() @IsInt() @Min(1) @Max(1000) capacity?: number
  @IsOptional() @IsBoolean() requires_approval?: boolean
  @IsOptional() @IsInt() @Min(1) @Max(12) max_hours?: number
  @IsOptional() @IsInt() @Min(1) @Max(90) max_advance_days?: number
  @IsOptional() @IsBoolean() is_active?: boolean
}
export class AmenityPatchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string
  @IsOptional() @IsString() @MaxLength(40) icon?: string
  @IsOptional() @IsString() @MaxLength(400) description?: string
  @IsOptional() @IsString() @MaxLength(600) rule_text?: string
  @IsOptional() @IsInt() @Min(1) @Max(1000) capacity?: number | null
  @IsOptional() @IsBoolean() requires_approval?: boolean
  @IsOptional() @IsInt() @Min(1) @Max(12) max_hours?: number
  @IsOptional() @IsInt() @Min(1) @Max(90) max_advance_days?: number
  @IsOptional() @IsBoolean() is_active?: boolean
}
class DayDto {
  @IsInt() @Min(0) @Max(6) weekday: number
  @IsArray() @ArrayMaxSize(24) @IsInt({ each: true }) @Min(0, { each: true }) @Max(23, { each: true }) hours: number[]
}
export class ScheduleDto {
  @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => DayDto) days: DayDto[]
}
export class ClosureDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ شروع نامعتبر است' }) date_from: string
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ پایان نامعتبر است' }) date_to: string
  @IsOptional() @IsString() @MaxLength(120) reason?: string
  /** خالی = همه‌ی مشاعات */
  @IsOptional() @Matches(/^[0-9a-f-]{36}$/i) amenity_id?: string
}

export function isDesk(user: JwtPayload) {
  return user.role === 'admin' || (user.role === 'staff' && (user.perms ?? []).includes('amenity_desk'))
}
function needDesk(user: JwtPayload) {
  if (!isDesk(user)) throw new ForbiddenException('فقط مسئول مشاعات و مدیر')
}

/**
 * مشاعات — تعریف و مدیریت (مسئول مشاعات / مدیر)
 *   GET    /amenities                 فهرست مشاعات فعال (همه‌ی نقش‌ها)
 *   GET    /amenities/manage          همه‌ی مشاعات + تایم‌تیبل + تعطیلی‌ها + شمارنده‌ها (desk)
 *   POST   /amenities                 تعریف مشاع جدید
 *   PATCH  /amenities/:id             ویرایش / فعال‌وغیرفعال
 *   DELETE /amenities/:id             حذف (اگر رزرو دارد → غیرفعال)
 *   PUT    /amenities/:id/schedule    تایم‌تیبل هفتگی (۰=شنبه … ۶=جمعه → ساعت‌ها)
 *   POST   /amenities/closures        تعطیلی بازه‌ای · DELETE /amenities/closures/:id
 */
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

  @Roles('admin', 'staff')
  @Get('manage')
  async manage(@CurrentUser() user: JwtPayload) {
    needDesk(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const amenities = (await client.query(
        `SELECT a.*, a.requires_approval AS needs_approval,
                (SELECT count(*) FROM facility.reservations r WHERE r.amenity_id = a.id AND r.status = 'pending')::int AS pending_count,
                (SELECT count(*) FROM facility.reservations r WHERE r.amenity_id = a.id AND r.status = 'confirmed' AND r.end_at > now())::int AS upcoming_count
           FROM facility.amenities a ORDER BY a.is_active DESC, a.name`)).rows
      const schedule = (await client.query<{ amenity_id: string; weekday: number; hours: number[] }>(
        `SELECT amenity_id, weekday, hours FROM facility.amenity_schedule ORDER BY weekday`)).rows
      const closures = (await client.query(
        `SELECT id, amenity_id, date_from::text AS date_from, date_to::text AS date_to, reason FROM facility.amenity_closures
          WHERE date_to >= (now() AT TIME ZONE 'Asia/Tehran')::date ORDER BY date_from`)).rows
      return {
        amenities: amenities.map((a) => ({
          ...a,
          // بدون تایم‌تیبل ثبت‌شده، slot_hours برای همه‌ی روزها اعمال می‌شود؛ ویرایشگر همان را نشان می‌دهد
          schedule: this.weekGrid(schedule.filter((s) => s.amenity_id === a.id), a.slot_hours),
          has_schedule: schedule.some((s) => s.amenity_id === a.id),
        })),
        closures,
        icons: ICONS,
      }
    })
  }

  @Roles('admin', 'staff')
  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() dto: AmenityDto) {
    needDesk(user)
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const dup = await client.query(`SELECT 1 FROM facility.amenities WHERE is_active AND lower(name) = lower($1)`, [dto.name.trim()])
      if (dup.rowCount) throw new BadRequestException('مشاعی با این نام وجود دارد')
      const a = (await client.query(
        `INSERT INTO facility.amenities (tenant_id, name, type, icon, description, rule_text, capacity, requires_approval, max_hours, max_advance_days, is_active)
         VALUES ($1,$2,'other',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *, requires_approval AS needs_approval`,
        [tenantId, dto.name.trim(), dto.icon ?? 'groups', dto.description ?? null, dto.rule_text ?? null, dto.capacity ?? null,
          dto.requires_approval ?? true, dto.max_hours ?? 2, dto.max_advance_days ?? 14, dto.is_active ?? true])).rows[0]
      await this.audit(client, tenantId, user, 'amenity.created', { summary: `مشاع «${a.name}» تعریف شد`, amenity_id: a.id })
      return a
    })
  }

  @Roles('admin', 'staff')
  @Patch(':id')
  async update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AmenityPatchDto) {
    needDesk(user)
    const cols = ['name', 'icon', 'description', 'rule_text', 'capacity', 'requires_approval', 'max_hours', 'max_advance_days', 'is_active'] as const
    const sets: string[] = []
    const vals: unknown[] = []
    for (const c of cols) {
      if ((dto as Record<string, unknown>)[c] !== undefined) {
        vals.push((dto as Record<string, unknown>)[c])
        sets.push(`${c} = $${vals.length}`)
      }
    }
    if (!sets.length) throw new BadRequestException('تغییری ارسال نشده')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      vals.push(id)
      const r = await client.query(`UPDATE facility.amenities SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *, requires_approval AS needs_approval`, vals)
      if (!r.rows[0]) throw new NotFoundException('مشاع یافت نشد')
      await this.audit(client, user.tenant_id!, user, 'amenity.updated', { summary: `مشاع «${r.rows[0].name}» ویرایش شد`, amenity_id: id, after: dto })
      return r.rows[0]
    })
  }

  @Roles('admin', 'staff')
  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    needDesk(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const a = (await client.query<{ name: string }>(`SELECT name FROM facility.amenities WHERE id = $1`, [id])).rows[0]
      if (!a) throw new NotFoundException('مشاع یافت نشد')
      const used = await client.query(`SELECT 1 FROM facility.reservations WHERE amenity_id = $1 LIMIT 1`, [id])
      let archived = false
      if (used.rowCount) {
        await client.query(`UPDATE facility.amenities SET is_active = false WHERE id = $1`, [id])
        archived = true // تاریخچه‌ی رزروها حفظ می‌شود
      } else {
        await client.query(`DELETE FROM facility.amenities WHERE id = $1`, [id])
      }
      await this.audit(client, user.tenant_id!, user, 'amenity.removed', { summary: `مشاع «${a.name}» ${archived ? 'غیرفعال شد' : 'حذف شد'}`, amenity_id: id })
      return { ok: true, archived }
    })
  }

  @Roles('admin', 'staff')
  @Put(':id/schedule')
  async setSchedule(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleDto) {
    needDesk(user)
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const a = (await client.query<{ name: string }>(`SELECT name FROM facility.amenities WHERE id = $1`, [id])).rows[0]
      if (!a) throw new NotFoundException('مشاع یافت نشد')
      await client.query(`DELETE FROM facility.amenity_schedule WHERE amenity_id = $1`, [id])
      // هر ۷ روز همیشه ذخیره می‌شود تا «روز بدون ردیف = تعطیل» قطعی باشد
      const byDay = new Map(dto.days.map((d) => [d.weekday, [...new Set(d.hours)].sort((x, y) => x - y)]))
      for (let wd = 0; wd < 7; wd++) {
        await client.query(
          `INSERT INTO facility.amenity_schedule (tenant_id, amenity_id, weekday, hours) VALUES ($1,$2,$3,$4)`,
          [tenantId, id, wd, byDay.get(wd) ?? []])
      }
      await this.audit(client, tenantId, user, 'amenity.schedule', { summary: `تایم‌تیبل «${a.name}» به‌روز شد`, amenity_id: id })
      const rows = (await client.query<{ weekday: number; hours: number[] }>(`SELECT weekday, hours FROM facility.amenity_schedule WHERE amenity_id = $1`, [id])).rows
      return { amenity_id: id, schedule: this.weekGrid(rows, []) }
    })
  }

  @Roles('admin', 'staff')
  @Post('closures')
  async addClosure(@CurrentUser() user: JwtPayload, @Body() dto: ClosureDto) {
    needDesk(user)
    if (dto.date_to < dto.date_from) throw new BadRequestException('تاریخ پایان قبل از شروع است')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = (await client.query(
        `INSERT INTO facility.amenity_closures (tenant_id, amenity_id, date_from, date_to, reason, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, amenity_id, date_from::text AS date_from, date_to::text AS date_to, reason`,
        [user.tenant_id, dto.amenity_id ?? null, dto.date_from, dto.date_to, dto.reason ?? null, /^[0-9a-f-]{36}$/i.test(user.sub) ? user.sub : null])).rows[0]
      await this.audit(client, user.tenant_id!, user, 'amenity.closure', { summary: `تعطیلی ${dto.date_from} تا ${dto.date_to}`, amenity_id: dto.amenity_id ?? null })
      return r
    })
  }

  @Roles('admin', 'staff')
  @Delete('closures/:id')
  @HttpCode(200)
  async removeClosure(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    needDesk(user)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      await client.query(`DELETE FROM facility.amenity_closures WHERE id = $1`, [id])
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
        [user.tenant_id, id, body.maxBookingsPerUnitPerPeriod, body.periodType, body.minAdvanceHours, body.maxAdvanceDays, body.depositAmount ?? 0],
      )
      return res.rows[0]
    })
  }

  /** ۷ روز هفته → ساعت‌ها؛ اگر ردیفی نیست، fallback روی ساعت‌های پیش‌فرض مشاع */
  private weekGrid(rows: { weekday: number; hours: number[] }[], fallback: number[]) {
    return Array.from({ length: 7 }, (_, wd) => ({
      weekday: wd,
      hours: rows.length ? rows.find((r) => r.weekday === wd)?.hours ?? [] : fallback ?? [],
    }))
  }

  private async audit(client: PoolClient, tenantId: string, user: JwtPayload, action: string, body: Record<string, unknown>) {
    await client.query(
      `INSERT INTO audit.event_logs (tenant_id, session_id, user_id, actor_role, source, level, action, request_body)
       VALUES ($1, $2, $3, $4, 'facility-svc', 'info', $5, $6)`,
      [tenantId, randomUUID(), /^[0-9a-f-]{36}$/i.test(user.sub) ? user.sub : null, user.role, action, JSON.stringify(body)],
    )
  }
}
