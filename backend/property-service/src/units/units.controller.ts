import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

interface CreateUnitBody {
  buildingId: string
  unitNumber: string
  floor?: number
  areaSqm?: number
}

interface UpdateUnitBody {
  floor?: number | null
  areaSqm?: number | null
  parkingCount?: number
  storageNo?: string | null
}

interface CreateBuildingBody {
  name: string
  address?: string
  totalUnits?: number
}

const isInt = (v: unknown) => Number.isInteger(v)

/**
 * ساختار ملک هر مجتمع (ساختمان/بلوک‌ها و واحدها) — همه‌ی queryها داخل withTenant (RLS).
 * ثبت دسته‌ای واحد و ساکن در identity-service (ماژول ساکنین) انجام می‌شود؛ این‌جا CRUD سبک خود ملک است.
 */
@Controller()
export class UnitsController {
  constructor(private readonly db: DatabaseService) {}

  @Get('buildings')
  async listBuildings(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `SELECT b.id, b.name, b.address, b.total_units, b.created_at, count(u.id)::int AS unit_count
           FROM property.buildings b LEFT JOIN property.units u ON u.building_id = b.id
          GROUP BY b.id ORDER BY b.created_at`,
      )
      return res.rows
    })
  }

  @Roles('admin')
  @Post('buildings')
  async createBuilding(@Body() body: CreateBuildingBody, @CurrentUser() user: JwtPayload) {
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (name.length < 2 || name.length > 120) throw new BadRequestException('نام ساختمان/بلوک را وارد کنید')
    if (body.totalUnits !== undefined && (!isInt(body.totalUnits) || body.totalUnits < 0)) throw new BadRequestException('تعداد واحد نامعتبر است')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `INSERT INTO property.buildings (tenant_id, name, address, total_units) VALUES ($1, $2, $3, $4) RETURNING *`,
        [user.tenant_id, name, body.address?.trim() || null, body.totalUnits ?? null],
      )
      return res.rows[0]
    })
  }

  @Get('units')
  async list(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `SELECT id, building_id, unit_number, floor, area_sqm, ownership_status, parking_count, storage_no, occupancy
         FROM property.units ORDER BY unit_number`,
      )
      return res.rows
    })
  }

  @Get('units/:id')
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(`SELECT * FROM property.units WHERE id = $1`, [id])
      if (!res.rows[0]) throw new NotFoundException('واحد یافت نشد')
      return res.rows[0]
    })
  }

  @Roles('admin')
  @Post('units')
  async create(@Body() body: CreateUnitBody, @CurrentUser() user: JwtPayload) {
    const unitNumber = typeof body?.unitNumber === 'string' ? body.unitNumber.trim() : ''
    if (!unitNumber || unitNumber.length > 20) throw new BadRequestException('شماره واحد نامعتبر است')
    if (body.floor !== undefined && !isInt(body.floor)) throw new BadRequestException('طبقه نامعتبر است')
    if (body.areaSqm !== undefined && !(Number(body.areaSqm) > 0)) throw new BadRequestException('متراژ نامعتبر است')
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `INSERT INTO property.units (tenant_id, building_id, unit_number, floor, area_sqm)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [user.tenant_id, body.buildingId, unitNumber, body.floor ?? null, body.areaSqm ?? null],
      )
      return res.rows[0]
    })
  }

  @Roles('admin')
  @Patch('units/:id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUnitBody, @CurrentUser() user: JwtPayload) {
    const sets: string[] = []
    const vals: unknown[] = []
    const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }
    if (body.floor !== undefined) {
      if (body.floor !== null && !isInt(body.floor)) throw new BadRequestException('طبقه نامعتبر است')
      set('floor', body.floor)
    }
    if (body.areaSqm !== undefined) {
      if (body.areaSqm !== null && !(Number(body.areaSqm) > 0)) throw new BadRequestException('متراژ نامعتبر است')
      set('area_sqm', body.areaSqm)
    }
    if (body.parkingCount !== undefined) {
      if (!isInt(body.parkingCount) || body.parkingCount < 0) throw new BadRequestException('تعداد پارکینگ نامعتبر است')
      set('parking_count', body.parkingCount)
    }
    if (body.storageNo !== undefined) set('storage_no', body.storageNo?.toString().trim() || null)
    if (!sets.length) throw new BadRequestException('فیلدی برای ویرایش ارسال نشده است')
    vals.push(id)
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(`UPDATE property.units SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals)
      if (!res.rows[0]) throw new NotFoundException('واحد یافت نشد')
      return res.rows[0]
    })
  }
}
