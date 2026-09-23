import { Controller } from '@nestjs/common'
import { GrpcMethod } from '@nestjs/microservices'
import { DatabaseService } from '../database/database.service'

interface GetUnitByIdRequest {
  id: string
  tenantId: string
}
interface ListUnitsByTenantRequest {
  tenantId: string
}

/**
 * پیاده‌سازی واقعی سرویس gRPC داخلی UnitService (property.proto) — بخش ۲ سند
 * ARCHITECTURE-SAAS.md. facility-service و finance-service این متدها را برای
 * اعتبارسنجی واحد یا خواندن متراژ (محاسبه شارژ) فراخوانی می‌کنند، بدون این‌که
 * جدول property.units را در دیتابیس خودشان تکرار کنند.
 *
 * نکته: چون این تماس داخلی سرویس‌به‌سرویس است (نه از کلاینت با JWT)، tenant_id
 * مستقیماً در payload gRPC پاس داده می‌شود — سرویس فراخوان آن را از JWT خودش
 * استخراج کرده است.
 */
@Controller()
export class UnitsGrpcController {
  constructor(private readonly db: DatabaseService) {}

  @GrpcMethod('UnitService', 'GetUnitById')
  async getUnitById(data: GetUnitByIdRequest) {
    const row = await this.db.withTenant(data.tenantId, async (client) => {
      const res = await client.query(
        `SELECT u.id, u.building_id, u.unit_number, u.area_sqm,
                l.user_id AS owner_user_id
         FROM property.units u
         LEFT JOIN property.user_unit_links l
           ON l.unit_id = u.id AND l.relation = 'owner' AND l.is_primary_contact = true
         WHERE u.id = $1`,
        [data.id],
      )
      return res.rows[0]
    })

    if (!row) return { found: false, id: '', buildingId: '', unitNumber: '', areaSqm: 0, ownerUserId: '' }
    return {
      found: true,
      id: row.id,
      buildingId: row.building_id,
      unitNumber: row.unit_number,
      areaSqm: Number(row.area_sqm ?? 0),
      ownerUserId: row.owner_user_id ?? '',
    }
  }

  @GrpcMethod('UnitService', 'ListUnitsByTenant')
  async listUnitsByTenant(data: ListUnitsByTenantRequest) {
    const rows = await this.db.withTenant(data.tenantId, async (client) => {
      const res = await client.query(`SELECT id, building_id, unit_number, area_sqm FROM property.units`)
      return res.rows
    })
    return {
      units: rows.map((r) => ({
        found: true,
        id: r.id,
        buildingId: r.building_id,
        unitNumber: r.unit_number,
        areaSqm: Number(r.area_sqm ?? 0),
        ownerUserId: '',
      })),
    }
  }
}
