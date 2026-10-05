import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { GuardGateway } from '../realtime/guard.gateway'
import { assertDesk, faDigits, normPlate } from '../common/access'

const TODAY = `(x AT TIME ZONE 'Asia/Tehran')::date = (now() AT TIME ZONE 'Asia/Tehran')::date`
const today = (col: string) => TODAY.replace('x', col)
const SEC = ['security']

/** پنل نگهبانی: جست‌وجوی واحد، خلاصه‌ی داشبورد، رویدادهای زنده، پلاک و تردد خودرو */
@Controller()
export class DeskController {
  constructor(
    private readonly db: DatabaseService,
    private readonly gateway: GuardGateway,
  ) {}

  /** جست‌وجوی واحد برای ثبت مرسوله/پلاک */
  @Roles('guard', 'admin', 'staff')
  @Get('units')
  units(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    assertDesk(user)
    const term = String(q ?? '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim()
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `SELECT id, unit_number AS no, floor FROM property.units
          WHERE ($1::text IS NULL OR unit_number ILIKE '%' || $1 || '%') ORDER BY length(unit_number), unit_number LIMIT 40`,
        [term || null])
      return r.rows
    })
  }

  @Roles('guard', 'admin', 'staff')
  @Get('summary')
  summary(@CurrentUser() user: JwtPayload) {
    assertDesk(user)
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `SELECT
           (SELECT count(*)::int FROM guard.parcels WHERE status = 'pending_pickup') AS pending_parcels,
           (SELECT count(*)::int FROM guard.guest_visit_logs WHERE ${today('entry_at')}) AS guests_today,
           (SELECT count(*)::int FROM guard.guest_passes WHERE status = 'active' AND valid_until > now() AND uses_count < max_uses) AS expected_guests,
           (SELECT count(*)::int FROM guard.vehicle_logs WHERE ${today('recorded_at')}) AS vehicles_today`)
      return r.rows[0]
    })
  }

  /** رویدادهای اخیر واقعی از جداول نگهبانی (مهمان، مرسوله، تردد) — جدیدترین اول */
  @Roles('guard', 'admin', 'staff')
  @Get('feed')
  feed(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    assertDesk(user)
    const n = Math.min(Math.max(Number(limit) || 20, 1), 60)
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `SELECT * FROM (
           SELECT 'guest_entry' AS type, l.id::text AS id, l.entry_at AS at, u.unit_number,
                  'ورود مهمان — ' || l.guest_name AS summary
             FROM guard.guest_visit_logs l LEFT JOIN property.units u ON u.id = l.unit_id
           UNION ALL
           SELECT 'parcel', p.id::text || ':r', p.received_at, u.unit_number,
                  'مرسوله ' || COALESCE(p.courier_company, '') || ' دریافت شد'
             FROM guard.parcels p LEFT JOIN property.units u ON u.id = p.unit_id
           UNION ALL
           SELECT 'parcel', p.id::text || ':p', p.picked_up_at, u.unit_number, 'مرسوله تحویل ساکن شد'
             FROM guard.parcels p LEFT JOIN property.units u ON u.id = p.unit_id WHERE p.picked_up_at IS NOT NULL
           UNION ALL
           SELECT CASE WHEN v.direction = 'in' THEN 'vehicle_in' ELSE 'vehicle_out' END, v.id::text, v.recorded_at, u.unit_number,
                  CASE WHEN v.direction = 'in' THEN 'ورود خودرو ' ELSE 'خروج خودرو ' END || v.plate
             FROM guard.vehicle_logs v LEFT JOIN property.units u ON u.id = v.unit_id
         ) f ORDER BY at DESC LIMIT $1`, [n])
      return r.rows
    })
  }

  // ───────── خودروها ─────────

  /** جست‌وجوی پلاک در خودروهای ثبت‌شده‌ی ساکنین */
  @Roles('guard', 'admin', 'staff')
  @Get('vehicles/lookup')
  lookup(@CurrentUser() user: JwtPayload, @Query('plate') plate: string) {
    assertDesk(user)
    const norm = normPlate(plate)
    if (norm.length < 3) throw new BadRequestException('پلاک را کامل‌تر وارد کنید')
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `SELECT v.id, v.plate, v.owner_name, v.label, v.unit_id, u.unit_number
           FROM guard.vehicles v LEFT JOIN property.units u ON u.id = v.unit_id WHERE v.plate_norm = $1`, [norm])
      return { found: !!r.rows[0], vehicle: r.rows[0] ?? null }
    })
  }

  @Roles('guard', 'admin', 'staff')
  @Post('vehicles')
  async addVehicle(@CurrentUser() user: JwtPayload, @Body() b: { unitId: string; plate: string; ownerName?: string; label?: string }) {
    assertDesk(user)
    const plate = String(b?.plate ?? '').trim()
    const norm = normPlate(plate)
    if (norm.length < 3 || plate.length > 30) throw new BadRequestException('پلاک نامعتبر است')
    if (!b.unitId) throw new BadRequestException('واحد الزامی است')
    return this.db.withTenant(user.tenant_id!, async (c) => {
      if (!(await c.query('SELECT 1 FROM property.units WHERE id = $1', [b.unitId])).rowCount) throw new NotFoundException('واحد یافت نشد')
      const dup = await c.query('SELECT 1 FROM guard.vehicles WHERE plate_norm = $1', [norm])
      if (dup.rowCount) throw new ConflictException('این پلاک قبلاً ثبت شده است')
      const r = await c.query(
        `INSERT INTO guard.vehicles (tenant_id, unit_id, plate, plate_norm, owner_name, label, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [user.tenant_id, b.unitId, plate, norm, b.ownerName?.trim().slice(0, 80) || null, b.label?.trim().slice(0, 60) || null, user.sub])
      return (await c.query(
        `SELECT v.id, v.plate, v.owner_name, v.label, v.unit_id, u.unit_number FROM guard.vehicles v LEFT JOIN property.units u ON u.id = v.unit_id WHERE v.id = $1`, [r.rows[0].id])).rows[0]
    })
  }

  @Roles('guard', 'admin', 'staff')
  @Delete('vehicles/:id')
  async removeVehicle(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    assertDesk(user)
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query('DELETE FROM guard.vehicles WHERE id = $1 RETURNING id', [id])
      if (!r.rows[0]) throw new NotFoundException('خودرو یافت نشد')
      return { id, deleted: true }
    })
  }

  // ───────── تردد ─────────

  /** تردد امروز (به وقت تهران) */
  @Roles('guard', 'admin', 'staff')
  @Get('vehicle-logs')
  logs(@CurrentUser() user: JwtPayload) {
    assertDesk(user)
    return this.db.withTenant(user.tenant_id!, async (c) => {
      const r = await c.query(
        `SELECT l.id, l.plate, l.unit_id, u.unit_number, l.direction, l.is_guest, l.note, l.recorded_at
           FROM guard.vehicle_logs l LEFT JOIN property.units u ON u.id = l.unit_id
          WHERE ${today('l.recorded_at')} ORDER BY l.recorded_at DESC LIMIT 200`)
      return r.rows
    })
  }

  @Roles('guard', 'admin', 'staff')
  @Post('vehicle-logs')
  async addLog(@CurrentUser() user: JwtPayload, @Body() b: { plate: string; direction: 'in' | 'out'; unitId?: string; isGuest?: boolean; note?: string }) {
    assertDesk(user, SEC)
    const plate = String(b?.plate ?? '').trim()
    const norm = normPlate(plate)
    if (norm.length < 3 || plate.length > 30) throw new BadRequestException('پلاک نامعتبر است')
    if (!['in', 'out'].includes(b.direction)) throw new BadRequestException('جهت تردد نامعتبر است')
    const out = await this.db.withTenant(user.tenant_id!, async (c) => {
      const known = (await c.query('SELECT id, unit_id FROM guard.vehicles WHERE plate_norm = $1', [norm])).rows[0]
      const unitId = known?.unit_id ?? b.unitId ?? null
      if (unitId && !(await c.query('SELECT 1 FROM property.units WHERE id = $1', [unitId])).rowCount) throw new NotFoundException('واحد یافت نشد')
      const r = await c.query(
        `INSERT INTO guard.vehicle_logs (tenant_id, plate, plate_norm, unit_id, vehicle_id, direction, is_guest, note, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [user.tenant_id, plate, norm, unitId, known?.id ?? null, b.direction, !known, b.note?.trim().slice(0, 200) || null, user.sub])
      return (await c.query(
        `SELECT l.id, l.plate, l.unit_id, u.unit_number, l.direction, l.is_guest, l.note, l.recorded_at
           FROM guard.vehicle_logs l LEFT JOIN property.units u ON u.id = l.unit_id WHERE l.id = $1`, [r.rows[0].id])).rows[0]
    })
    this.gateway.broadcastGuardEvent(user.tenant_id!, 'vehicle.logged', { plate: out.plate, direction: out.direction, unit: out.unit_number ? faDigits(out.unit_number) : null })
    return out
  }
}
