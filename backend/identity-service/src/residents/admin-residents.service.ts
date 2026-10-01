import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { RequestCtx, writeAudit } from './context'
import { displayPhone, normalizePhone } from './phone'
import { RESIDENCY_LABEL, ROLE_LABEL, ageFromBirthYear } from './residents.constants'

interface TenantRow {
  id: string
  name: string
  status: string
  unit_count: number
  manager_name: string | null
}

/**
 * پنل سوپرادمین برای ساکنین — cross-tenant. به‌جای دور زدن RLS، روی هر ساختمان جدا
 * withTenant اجرا می‌شود؛ پس حتی کد سوپرادمین هم هرگز داده‌ی دو ساختمان را در یک تراکنش نمی‌بیند.
 */
@Injectable()
export class AdminResidentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  private tenants(buildingId?: string) {
    return this.db.withPlatformAccess(async (c) =>
      (await c.query<TenantRow>(
        `SELECT id, name, status, unit_count, manager_name FROM identity.tenants ${buildingId ? 'WHERE id = $1' : ''} ORDER BY created_at`,
        buildingId ? [buildingId] : [],
      )).rows,
    )
  }

  /** B1 — ساختمان‌ها با درصد پر بودن + (با q) جست‌وجوی شخص در همه‌ی ساختمان‌ها */
  async residents(buildingId?: string, q?: string) {
    const tenants = await this.tenants(buildingId)
    if (buildingId && !tenants.length) throw new NotFoundException('ساختمان یافت نشد')
    const buildings = []
    for (const t of tenants) {
      const stats = await this.db.withTenant(t.id, async (c) => {
        const u = (await c.query<{ total: number; filled: number }>(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE occupancy <> 'vacant')::int AS filled FROM property.units`)).rows[0]
        const pending = (await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM residency.memberships WHERE status IN ('pending_approval','pending_head')`)).rows[0].n
        const mgr = (await c.query<{ full_name: string }>(
          `SELECT full_name FROM identity.users WHERE role = 'admin' AND is_active ORDER BY created_at LIMIT 1`)).rows[0]
        return { ...u, pending, manager: mgr?.full_name ?? null }
      })
      const total = stats.total || t.unit_count || 0
      buildings.push({
        id: t.id,
        name: t.name,
        status: t.status,
        units_total: total,
        units_filled: stats.filled,
        occupancy_pct: total ? Math.round((stats.filled / total) * 100) : 0,
        pending: stats.pending,
        manager_name: stats.manager ?? t.manager_name,
        manager_assigned: !!stats.manager,
        setting_up: stats.total === 0,
      })
    }
    const people = q?.trim() ? await this.search(q.trim(), tenants) : []
    return { buildings, people }
  }

  private async search(q: string, tenants: TenantRow[]) {
    const phone = normalizePhone(q)
    const digits = q.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '')
    const people = await this.db.withPlatformAccess(async (c) =>
      (await c.query<{ id: string; name: string; phone: string | null; national_id: string | null; status: string }>(
        `SELECT id, name, phone, national_id, status FROM residency.users
          WHERE status <> 'merged' AND (name ILIKE '%' || $1 || '%' OR ($2::text IS NOT NULL AND phone = $2)
                OR ($3 <> '' AND (phone LIKE '%' || $3 || '%' OR national_id = $3)))
          ORDER BY name LIMIT 30`,
        [q, phone, digits.length >= 4 ? digits : ''],
      )).rows,
    )
    const ids = people.map((p) => p.id)
    const where = new Map<string, string[]>()
    for (const t of tenants) {
      if (!ids.length) break
      const rows = await this.db.withTenant(t.id, async (c) =>
        (await c.query<{ user_id: string; unit_no: string }>(
          `SELECT m.user_id, u.unit_number AS unit_no FROM residency.memberships m JOIN property.units u ON u.id = m.unit_id
            WHERE m.user_id = ANY($1) AND m.status <> 'ended'`, [ids])).rows,
      )
      for (const r of rows) where.set(r.user_id, [...(where.get(r.user_id) ?? []), `${t.name} · واحد ${r.unit_no}`])
    }
    return people.map((p) => ({ id: p.id, name: p.name, phone: displayPhone(p.phone), status: p.status, memberships: where.get(p.id) ?? [] }))
  }

  /** B2 — پرونده‌ی شخص: عضویت در چند ساختمان + تاریخچه + حساب‌های مشابه */
  async user(id: string) {
    const person = await this.db.withPlatformAccess(async (c) =>
      (await c.query<{ id: string; name: string; phone: string | null; national_id: string | null; birth_year: number | null; status: string; merged_into: string | null; created_at: string }>(
        `SELECT id, name, phone, national_id, birth_year, status, merged_into, created_at FROM residency.users WHERE id = $1`, [id])).rows[0],
    )
    if (!person) throw new NotFoundException('شخص یافت نشد')
    const memberships: unknown[] = []
    const audit: { t: string; action: string; at: string; building: string }[] = []
    for (const t of await this.tenants()) {
      await this.db.withTenant(t.id, async (c) => {
        const ms = await c.query<{ id: string; unit_no: string; role: string; residency: string; status: string; start_date: string; end_date: string | null }>(
          `SELECT m.id, u.unit_number AS unit_no, m.role, m.residency, m.status,
                  to_char(m.start_date,'YYYY-MM-DD') AS start_date, to_char(m.end_date,'YYYY-MM-DD') AS end_date
             FROM residency.memberships m JOIN property.units u ON u.id = m.unit_id
            WHERE m.user_id = $1 ORDER BY (m.status = 'ended'), m.start_date DESC`, [id])
        for (const m of ms.rows) {
          memberships.push({
            ...m,
            building_id: t.id,
            building: t.name,
            title: `${t.name} · واحد ${m.unit_no}`,
            description: m.role === 'owner_absent'
              ? 'مالک غیرساکن · فقط امور مالی'
              : `${RESIDENCY_LABEL[m.residency]} · ${ROLE_LABEL[m.role]}`,
          })
        }
        const logs = await c.query<{ action: string; occurred_at: string; summary: string | null }>(
          `SELECT action, occurred_at, request_body->>'summary' AS summary FROM audit.event_logs
            WHERE request_body->>'subject_user_id' = $1 OR request_body->>'member_user_id' = $1
            ORDER BY occurred_at DESC LIMIT 30`, [id])
        for (const l of logs.rows) audit.push({ t: l.summary ?? l.action, action: l.action, at: l.occurred_at, building: t.name })
      })
    }
    audit.sort((a, b) => (a.at < b.at ? 1 : -1))
    // «حساب مشابه»: همان کد ملی، یا همان نام با شماره‌ی دیگر
    const duplicates = await this.db.withPlatformAccess(async (c) =>
      (await c.query<{ id: string; name: string; phone: string | null; reason: string }>(
        `SELECT id, name, phone, CASE WHEN $2::text IS NOT NULL AND national_id = $2 THEN 'national_id' ELSE 'name' END AS reason
           FROM residency.users
          WHERE id <> $1 AND status <> 'merged' AND (($2::text IS NOT NULL AND national_id = $2) OR name = $3)
          LIMIT 5`, [id, person.national_id, person.name])).rows,
    )
    return {
      user: { ...person, phone: displayPhone(person.phone), age: ageFromBirthYear(person.birth_year) },
      memberships,
      audit: audit.slice(0, 40),
      duplicates: duplicates.map((d) => ({ ...d, phone: displayPhone(d.phone) })),
    }
  }

  /** همه‌ی ساختمان‌هایی که شخص در آن‌ها عضویت (حتی پایان‌یافته) یا حساب ورود دارد */
  private async tenantsOf(personId: string) {
    const out: TenantRow[] = []
    for (const t of await this.tenants()) {
      const has = await this.db.withTenant(t.id, async (c) =>
        (await c.query(`SELECT 1 FROM residency.memberships WHERE user_id = $1 UNION SELECT 1 FROM identity.users WHERE person_id = $1 LIMIT 1`, [personId])).rowCount,
      )
      if (has) out.push(t)
    }
    return out
  }

  async logoutAll(id: string, ctx: RequestCtx) {
    await this.mustExist(id)
    await this.db.withPlatformAccess((c) => c.query(`UPDATE residency.users SET sessions_valid_after = now(), updated_at = now() WHERE id = $1`, [id]))
    for (const t of await this.tenantsOf(id)) {
      await this.db.withTenant(t.id, async (c) => {
        await c.query(`UPDATE identity.users SET sessions_valid_after = now(), updated_at = now() WHERE person_id = $1`, [id])
        await writeAudit(c, t.id, ctx, 'user.logout_all', { summary: 'خروج از همه‌ی دستگاه‌ها (سوپرادمین)', subject_user_id: id })
      })
    }
    this.events.publish('user.logout_all', { userId: id })
    return { ok: true }
  }

  async block(id: string, blocked: boolean, ctx: RequestCtx) {
    await this.mustExist(id)
    await this.db.withPlatformAccess((c) =>
      c.query(`UPDATE residency.users SET status = $2, sessions_valid_after = now(), updated_at = now() WHERE id = $1 AND status <> 'merged'`, [id, blocked ? 'blocked' : 'active']),
    )
    for (const t of await this.tenantsOf(id)) {
      await this.db.withTenant(t.id, async (c) => {
        await c.query(`UPDATE identity.users SET sessions_valid_after = now(), updated_at = now() WHERE person_id = $1`, [id])
        await writeAudit(c, t.id, ctx, blocked ? 'user.blocked' : 'user.unblocked', {
          summary: blocked ? 'حساب مسدود شد · دسترسی در همه ساختمان‌ها قطع شد' : 'رفع مسدودی حساب',
          subject_user_id: id,
        })
      })
    }
    this.events.publish(blocked ? 'user.blocked' : 'user.unblocked', { userId: id })
    return { ok: true, status: blocked ? 'blocked' : 'active' }
  }

  /**
   * ادغام: عضویت‌ها و حساب‌های ورودِ other به id منتقل می‌شوند؛ other «ادغام‌شده» می‌ماند (سابقه حذف نمی‌شود).
   * اگر هر دو در یک واحد عضویت زنده داشته باشند، عضویت other پایان می‌یابد.
   */
  async merge(id: string, otherId: string, ctx: RequestCtx) {
    if (id === otherId) throw new BadRequestException('یک حساب با خودش ادغام نمی‌شود')
    const keep = await this.mustExist(id)
    const drop = await this.mustExist(otherId)
    if (drop.status === 'merged') throw new ConflictException('این حساب قبلاً ادغام شده است')
    let moved = 0
    for (const t of await this.tenantsOf(otherId)) {
      await this.db.withTenant(t.id, async (c) => {
        await c.query(
          `UPDATE residency.memberships d SET status = 'ended', ended_at = now(), end_date = GREATEST(d.start_date, CURRENT_DATE), updated_at = now()
            WHERE d.user_id = $2 AND d.status <> 'ended'
              AND EXISTS (SELECT 1 FROM residency.memberships k WHERE k.user_id = $1 AND k.unit_id = d.unit_id AND k.status <> 'ended')`,
          [id, otherId],
        )
        const r = await c.query(`UPDATE residency.memberships SET user_id = $1, updated_at = now() WHERE user_id = $2`, [id, otherId])
        moved += r.rowCount ?? 0
        await c.query(`UPDATE identity.users SET person_id = $1, sessions_valid_after = now() WHERE person_id = $2`, [id, otherId])
        await c.query(`UPDATE property.units SET owner_user_id = $1 WHERE owner_user_id = $2`, [id, otherId])
        await writeAudit(c, t.id, ctx, 'user.merged', {
          summary: `حساب ${drop.name} (${displayPhone(drop.phone) ?? '—'}) در ${keep.name} ادغام شد`,
          subject_user_id: id,
          merged_user_id: otherId,
        })
      })
    }
    await this.db.withPlatformAccess(async (c) => {
      await c.query(
        `UPDATE residency.users SET status = 'merged', merged_into = $1, phone = NULL, sessions_valid_after = now(), updated_at = now() WHERE id = $2`,
        [id, otherId],
      )
      // شماره‌ی حساب ادغام‌شده اگر حساب اصلی شماره ندارد به آن منتقل می‌شود
      await c.query(`UPDATE residency.users SET phone = COALESCE(phone, $2), national_id = COALESCE(national_id, $3), updated_at = now() WHERE id = $1`, [id, drop.phone, drop.national_id])
    })
    this.events.publish('user.merged', { userId: id, mergedUserId: otherId })
    return { ok: true, moved_memberships: moved }
  }

  private async mustExist(id: string) {
    const p = await this.db.withPlatformAccess(async (c) =>
      (await c.query<{ id: string; name: string; phone: string | null; national_id: string | null; status: string }>(
        `SELECT id, name, phone, national_id, status FROM residency.users WHERE id = $1`, [id])).rows[0],
    )
    if (!p) throw new NotFoundException('شخص یافت نشد')
    return p
  }
}
