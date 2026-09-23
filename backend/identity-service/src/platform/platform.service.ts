import { randomUUID } from 'crypto'
import * as bcrypt from 'bcrypt'
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { CreateBuildingDto } from './dto/create-building.dto'
import { UpdateBuildingDto } from './dto/update-building.dto'
import { BuildingTier, TIERS, getTier, suggestMonthlyFee } from './tiers'

export interface BuildingRow {
  id: string
  name: string
  subdomain: string
  status: string
  tier: BuildingTier
  unit_count: number
  floor_count: number | null
  address: string | null
  manager_name: string | null
  manager_phone: string | null
  monthly_fee: string | number
  outstanding_amount: string | number
  billing_status: string
  last_payment_at: Date | null
  next_due_at: Date | null
  created_at: Date
}

export interface Building {
  id: string
  name: string
  subdomain: string
  status: string
  tier: BuildingTier
  tierLabel: string
  unitCount: number
  floorCount: number | null
  address: string | null
  managerName: string | null
  managerPhone: string | null
  monthlyFee: number
  outstandingAmount: number
  billingStatus: string
  lastPaymentAt: string | null
  nextDueAt: string | null
  createdAt: string
}

const SELECT_COLUMNS = `
  id, name, subdomain, status, tier, unit_count, floor_count, address,
  manager_name, manager_phone, monthly_fee, outstanding_amount, billing_status,
  last_payment_at, next_due_at, created_at
`

function toDateString(value: Date | null): string | null {
  return value ? new Date(value).toISOString().slice(0, 10) : null
}

/**
 * سرویس سطح پلتفرم (سوپرادمین) — همه‌ی Queryها cross-tenant هستند و عمداً با
 * withPlatformAccess اجرا می‌شوند، نه withTenant. جدول identity.tenants طبق
 * migration 001 اصلاً RLS ندارد (چون در لحظه‌ی لاگین باید با subdomain جستجو شود).
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  /** ماتریس سطوح سرویس — برای نمایش در فرم «تعریف برج جدید» */
  listTiers() {
    return TIERS
  }

  async listBuildings(): Promise<{ buildings: Building[]; summary: ReturnType<typeof buildSummary> }> {
    const rows = await this.db.withPlatformAccess(async (client: PoolClient) => {
      const res = await client.query<BuildingRow>(
        `SELECT ${SELECT_COLUMNS} FROM identity.tenants ORDER BY created_at DESC`,
      )
      return res.rows
    })
    const buildings = rows.map(mapBuilding)
    return { buildings, summary: buildSummary(buildings) }
  }

  async getBuilding(id: string): Promise<Building> {
    const row = await this.db.withPlatformAccess(async (client) => {
      const res = await client.query<BuildingRow>(
        `SELECT ${SELECT_COLUMNS} FROM identity.tenants WHERE id = $1`,
        [id],
      )
      return res.rows[0]
    })
    if (!row) throw new NotFoundException('ساختمان یافت نشد')
    return mapBuilding(row)
  }

  async createBuilding(dto: CreateBuildingDto): Promise<Building> {
    // اعتبارسنجی سطح — getTier در صورت نامعتبر بودن throw می‌کند
    getTier(dto.tier)
    const monthlyFee = dto.monthlyFee ?? suggestMonthlyFee(dto.tier, dto.unitCount)

    // ساختمان و مدیر اولیه‌اش در یک تراکنش ساخته می‌شوند (یا هر دو، یا هیچ‌کدام).
    // شناسه از قبل تولید می‌شود تا بتوان context تنانت را برای درج کاربر (زیر RLS) ست کرد.
    const tenantId = randomUUID()
    const passwordHash = dto.adminEmail ? await bcrypt.hash(dto.adminPassword!, 10) : null
    const row = await this.db.withTenant(tenantId, async (client) => {
      const exists = await client.query('SELECT 1 FROM identity.tenants WHERE subdomain = $1', [
        dto.subdomain,
      ])
      if (exists.rowCount) {
        throw new ConflictException('این subdomain قبلاً ثبت شده است')
      }
      const res = await client.query<BuildingRow>(
        `INSERT INTO identity.tenants
           (id, name, subdomain, status, tier, unit_count, floor_count, address,
            manager_name, manager_phone, monthly_fee, outstanding_amount,
            billing_status, next_due_at)
         VALUES ($11, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'settled', CURRENT_DATE + 30)
         RETURNING ${SELECT_COLUMNS}`,
        [
          dto.name,
          dto.subdomain,
          dto.status ?? 'trial',
          dto.tier,
          dto.unitCount,
          dto.floorCount ?? null,
          dto.address ?? null,
          dto.managerName ?? null,
          dto.managerPhone ?? null,
          monthlyFee,
          tenantId,
        ],
      )
      if (dto.adminEmail && passwordHash) {
        await client.query(
          `INSERT INTO identity.users (tenant_id, full_name, email, password_hash, role)
           VALUES ($1, $2, $3, $4, 'admin')`,
          [tenantId, dto.adminFullName ?? dto.managerName ?? 'مدیر مجتمع', dto.adminEmail.trim().toLowerCase(), passwordHash],
        )
      }
      return res.rows[0]
    })

    this.events.publish('tenant.created', {
      tenantId: row.id,
      name: row.name,
      tier: row.tier,
      unitCount: row.unit_count,
    })

    return mapBuilding(row)
  }

  async updateBuilding(id: string, dto: UpdateBuildingDto): Promise<Building> {
    const fieldMap: Record<string, string> = {
      name: 'name',
      tier: 'tier',
      unitCount: 'unit_count',
      status: 'status',
      monthlyFee: 'monthly_fee',
      outstandingAmount: 'outstanding_amount',
      billingStatus: 'billing_status',
      managerName: 'manager_name',
      managerPhone: 'manager_phone',
    }

    const sets: string[] = []
    const values: unknown[] = []
    for (const [key, column] of Object.entries(fieldMap)) {
      const value = (dto as Record<string, unknown>)[key]
      if (value !== undefined) {
        values.push(value)
        sets.push(`${column} = $${values.length}`)
      }
    }
    if (sets.length === 0) {
      throw new BadRequestException('هیچ فیلدی برای به‌روزرسانی ارسال نشده است')
    }
    values.push(id)

    const row = await this.db.withPlatformAccess(async (client) => {
      const res = await client.query<BuildingRow>(
        `UPDATE identity.tenants SET ${sets.join(', ')} WHERE id = $${values.length}
         RETURNING ${SELECT_COLUMNS}`,
        values,
      )
      return res.rows[0]
    })
    if (!row) throw new NotFoundException('ساختمان یافت نشد')

    this.events.publish('tenant.updated', { tenantId: row.id, changes: Object.keys(dto) })
    return mapBuilding(row)
  }

  /** ثبت پرداخت اشتراک — مانده‌ی بدهی را صفر می‌کند و سررسید بعدی را جلو می‌برد */
  async settleBuilding(id: string): Promise<Building> {
    const row = await this.db.withPlatformAccess(async (client) => {
      const res = await client.query<BuildingRow>(
        `UPDATE identity.tenants
            SET outstanding_amount = 0,
                billing_status = 'settled',
                last_payment_at = CURRENT_DATE,
                next_due_at = CURRENT_DATE + 30
          WHERE id = $1
        RETURNING ${SELECT_COLUMNS}`,
        [id],
      )
      return res.rows[0]
    })
    if (!row) throw new NotFoundException('ساختمان یافت نشد')
    this.events.publish('tenant.subscription_settled', { tenantId: row.id })
    return mapBuilding(row)
  }
}

function mapBuilding(row: BuildingRow): Building {
  return {
    id: row.id,
    name: row.name,
    subdomain: row.subdomain,
    status: row.status,
    tier: row.tier,
    tierLabel: getTier(row.tier).label,
    unitCount: Number(row.unit_count),
    floorCount: row.floor_count === null ? null : Number(row.floor_count),
    address: row.address,
    managerName: row.manager_name,
    managerPhone: row.manager_phone,
    monthlyFee: Number(row.monthly_fee),
    outstandingAmount: Number(row.outstanding_amount),
    billingStatus: row.billing_status,
    lastPaymentAt: toDateString(row.last_payment_at),
    nextDueAt: toDateString(row.next_due_at),
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function buildSummary(buildings: Building[]) {
  const active = buildings.filter((b) => b.status === 'active')
  return {
    totalBuildings: buildings.length,
    activeBuildings: active.length,
    trialBuildings: buildings.filter((b) => b.status === 'trial').length,
    suspendedBuildings: buildings.filter((b) => b.status === 'suspended').length,
    totalUnits: buildings.reduce((sum, b) => sum + b.unitCount, 0),
    /** درآمد ماهانه‌ی مکرر — فقط مجتمع‌های فعال */
    mrr: active.reduce((sum, b) => sum + b.monthlyFee, 0),
    totalOutstanding: buildings.reduce((sum, b) => sum + b.outstandingAmount, 0),
    overdueCount: buildings.filter((b) => b.billingStatus === 'overdue').length,
    byTier: {
      simple: buildings.filter((b) => b.tier === 'simple').length,
      economic: buildings.filter((b) => b.tier === 'economic').length,
      professional: buildings.filter((b) => b.tier === 'professional').length,
    },
  }
}
