import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'crypto'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { SYSTEM_DEPARTMENTS } from './staff.constants'
import type { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto'

/**
 * دپارتمان‌های سیستمی (لابی، آشپزخانه، …) برای هر ساختمان، اولین باری که لازم شوند ساخته می‌شوند.
 * مایگریشن 009 ساختمان‌های موجود را پر می‌کند؛ این تابع ساختمان‌هایی را پوشش می‌دهد که بعد از آن ساخته شده‌اند.
 * باید داخل withTenant صدا زده شود (tenant_id از همان جلسه‌ی RLS می‌آید).
 */
export async function ensureSystemDepartments(client: PoolClient) {
  const values = SYSTEM_DEPARTMENTS.map((_, i) => `(platform.current_tenant_id(), $${i * 3 + 1}, $${i * 3 + 2}, true, $${i * 3 + 3})`).join(', ')
  await client.query(
    `INSERT INTO identity.departments (tenant_id, code, name, is_system, sort) VALUES ${values}
     ON CONFLICT (tenant_id, code) DO NOTHING`,
    SYSTEM_DEPARTMENTS.flatMap((d) => [d.code, d.name, d.sort]),
  )
}

interface DepartmentRow {
  id: string
  code: string
  name: string
  icon: string | null
  is_system: boolean
  manager_user_id: string | null
  is_active: boolean
  sort: number
}
interface MemberRow {
  id: string
  full_name: string
  department: string
  is_active: boolean
}

/**
 * مدیریت دپارتمان‌ها توسط مدیر ساختمان:
 *   ۱) دپارتمان تعریف می‌شود (مثلاً «کارواش»)
 *   ۲) برایش مدیر دپارتمان تعیین می‌شود (باید کارمندِ همان دپارتمان باشد)
 *   ۳) کارکنان زیردست با «دپارتمان» در صفحه‌ی کارکنان اضافه می‌شوند
 * مدیر دپارتمان به‌طور خودکار دسترسی «service_desk» می‌گیرد تا پنل درخواست‌ها برایش باز شود.
 */
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  list(tenantId: string) {
    return this.db.withTenant(tenantId, async (client) => {
      await ensureSystemDepartments(client)
      const deps = await client.query<DepartmentRow>(
        `SELECT id, code, name, icon, is_system, manager_user_id, is_active, sort
           FROM identity.departments ORDER BY sort, created_at`,
      )
      const members = await client.query<MemberRow>(
        `SELECT id, full_name, department, is_active FROM identity.users
          WHERE role = 'staff' AND department IS NOT NULL ORDER BY full_name`,
      )
      return deps.rows.map((d) => {
        const mine = members.rows.filter((m) => m.department === d.code)
        const manager = mine.find((m) => m.id === d.manager_user_id)
        return {
          id: d.id,
          code: d.code,
          name: d.name,
          icon: d.icon,
          isSystem: d.is_system,
          isActive: d.is_active,
          managerId: manager ? d.manager_user_id : null,
          managerName: manager?.full_name ?? null,
          memberCount: mine.length,
          members: mine.map((m) => ({ id: m.id, fullName: m.full_name, isActive: m.is_active })),
        }
      })
    })
  }

  async create(tenantId: string, dto: CreateDepartmentDto, actorId: string) {
    const name = dto.name.trim()
    // code فقط داخلی است (ASCII)؛ نام فارسی می‌ماند و هر دپارتمان code یکتای خودش را دارد
    const code = `d_${randomBytes(4).toString('hex')}`
    const row = await this.db.withTenant(tenantId, async (client) => {
      await ensureSystemDepartments(client)
      const dup = await client.query(`SELECT 1 FROM identity.departments WHERE lower(btrim(name)) = lower($1)`, [name])
      if (dup.rowCount) throw new ConflictException('دپارتمانی با این نام وجود دارد')
      const r = await client.query<DepartmentRow>(
        `INSERT INTO identity.departments (tenant_id, code, name, icon, is_system, sort)
         VALUES (platform.current_tenant_id(), $1, $2, $3, false,
                 COALESCE((SELECT max(sort) FROM identity.departments), 100) + 10)
         RETURNING id, code, name, icon, is_system, manager_user_id, is_active, sort`,
        [code, name, dto.icon ?? null],
      )
      return r.rows[0]
    })
    this.events.publish('department.created', { tenantId, departmentId: row.id, by: actorId })
    return { id: row.id, code: row.code, name: row.name, icon: row.icon, isSystem: false, isActive: true, managerId: null, managerName: null, memberCount: 0, members: [] }
  }

  async update(tenantId: string, id: string, dto: UpdateDepartmentDto, actorId: string) {
    await this.db.withTenant(tenantId, async (client) => {
      const cur = (await client.query<DepartmentRow>(`SELECT id, code, name, is_system FROM identity.departments WHERE id = $1`, [id])).rows[0]
      if (!cur) throw new NotFoundException('دپارتمان یافت نشد')

      const sets: string[] = []
      const vals: unknown[] = []
      const set = (col: string, v: unknown) => {
        vals.push(v)
        sets.push(`${col} = $${vals.length}`)
      }
      if (dto.name !== undefined) {
        const name = dto.name.trim()
        const dup = await client.query(`SELECT 1 FROM identity.departments WHERE id <> $1 AND lower(btrim(name)) = lower($2)`, [id, name])
        if (dup.rowCount) throw new ConflictException('دپارتمانی با این نام وجود دارد')
        set('name', name)
      }
      if (dto.icon !== undefined) set('icon', dto.icon || null)
      if (dto.isActive !== undefined) {
        if (!dto.isActive && cur.is_system) throw new BadRequestException('دپارتمان سیستمی را نمی‌شود غیرفعال کرد')
        set('is_active', dto.isActive)
      }
      if (dto.managerUserId !== undefined) {
        if (dto.managerUserId === null) {
          set('manager_user_id', null)
        } else {
          const u = (
            await client.query<{ department: string | null; is_active: boolean }>(
              `SELECT department, is_active FROM identity.users WHERE id = $1 AND role = 'staff'`,
              [dto.managerUserId],
            )
          ).rows[0]
          if (!u) throw new BadRequestException('کارمند یافت نشد')
          if (u.department !== cur.code) throw new BadRequestException('مدیر دپارتمان باید ابتدا به‌عنوان کارمند در همین دپارتمان ثبت شود')
          if (!u.is_active) throw new BadRequestException('این کارمند غیرفعال است')
          set('manager_user_id', dto.managerUserId)
          // پنل درخواست‌ها برای مدیر دپارتمان باز می‌شود (در ورود بعدی)
          await client.query(
            `UPDATE identity.users SET permissions = array_append(permissions, 'service_desk'), updated_at = now()
              WHERE id = $1 AND NOT ('service_desk' = ANY(permissions))`,
            [dto.managerUserId],
          )
        }
      }
      if (sets.length) {
        vals.push(id)
        await client.query(`UPDATE identity.departments SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals)
      }
    })
    this.events.publish('department.updated', { tenantId, departmentId: id, by: actorId, fields: Object.keys(dto) })
    return (await this.list(tenantId)).find((d) => d.id === id)!
  }

  async remove(tenantId: string, id: string, actorId: string) {
    await this.db.withTenant(tenantId, async (client) => {
      const cur = (await client.query<DepartmentRow>(`SELECT id, code, is_system FROM identity.departments WHERE id = $1`, [id])).rows[0]
      if (!cur) throw new NotFoundException('دپارتمان یافت نشد')
      if (cur.is_system) throw new BadRequestException('دپارتمان سیستمی حذف‌شدنی نیست')
      const staff = await client.query(`SELECT 1 FROM identity.users WHERE role = 'staff' AND department = $1 LIMIT 1`, [cur.code])
      if (staff.rowCount) throw new ConflictException('ابتدا کارکنان این دپارتمان را به دپارتمان دیگری منتقل کنید')
      // نوع خدمتی که به این دپارتمان وصل است بی‌صاحب نماند
      const svc = await client.query(`SELECT 1 FROM facility.service_types WHERE department_code = $1 AND is_active LIMIT 1`, [cur.code])
      if (svc.rowCount) throw new ConflictException('خدماتی به این دپارتمان وصل است؛ ابتدا آن را به دپارتمان دیگری بدهید یا غیرفعال کنید')
      await client.query(`DELETE FROM identity.departments WHERE id = $1`, [id])
    })
    this.events.publish('department.deleted', { tenantId, departmentId: id, by: actorId })
    return { ok: true }
  }
}
