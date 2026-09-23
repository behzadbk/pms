import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

interface CreateUnitBody {
  buildingId: string
  unitNumber: string
  floor?: number
  areaSqm?: number
}

@Controller('units')
export class UnitsController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `SELECT id, building_id, unit_number, floor, area_sqm, ownership_status
         FROM property.units ORDER BY unit_number`,
      )
      return res.rows
    })
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(`SELECT * FROM property.units WHERE id = $1`, [id])
      return res.rows[0] ?? null
    })
  }

  @Roles('admin')
  @Post()
  async create(@Body() body: CreateUnitBody, @CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const res = await client.query(
        `INSERT INTO property.units (tenant_id, building_id, unit_number, floor, area_sqm)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [user.tenant_id, body.buildingId, body.unitNumber, body.floor ?? null, body.areaSqm ?? null],
      )
      return res.rows[0]
    })
  }
}
