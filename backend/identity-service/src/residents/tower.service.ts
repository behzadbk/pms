import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { RequestCtx, writeAudit } from './context'
import { getMembershipOr404, getUnitOr404, revokeSessions } from './residency.repo'
import {
  DEFAULT_DEBTOR_GRACE_DAYS,
  RESTRICTABLE_MODULES,
  fa,
  isRestrictionKey,
  ROLE_LABEL,
} from './residents.constants'
import type { BuildingRulesDto, BulkUnitsDto, CreateUnitDto, UpdateUnitDto } from './dto/residents.dto'

const MAX_BULK = 500

/** ارقام فارسی/عربی → لاتین، حذف فاصله — شماره‌ی واحد همیشه یک شکل ذخیره می‌شود */
export function normalizeUnitNumber(raw: string): string {
  return String(raw)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, '')
}

/** شماره‌گذاری گروهی: طبقه f، واحد i → f*100+i (۱۰۱، ۱۰۲، …، ۱۲۰۳). تا ۹۹ واحد در طبقه یکتاست. */
export function bulkNumbers(floors: number, perFloor: number, startFloor: number): { unit_number: string; floor: number }[] {
  const out: { unit_number: string; floor: number }[] = []
  for (let f = 0; f < floors; f++) {
    const floor = startFloor + f
    for (let i = 1; i <= perFloor; i++) out.push({ unit_number: String(floor * 100 + i), floor })
  }
  return out
}

const RESTRICTABLE_LABEL: Record<(typeof RESTRICTABLE_MODULES)[number], { t: string; d: string }> = {
  food: { t: 'سفارش غذا', d: 'رستوران و کافی‌شاپ' },
  guest: { t: 'کارت مهمان', d: 'صدور کد ورود مهمان' },
  amenity: { t: 'همه‌ی مشاعات', d: 'رزرو هر مشاع؛ برای محدودسازی یک مشاع از فهرست پایین استفاده کنید' },
}

/** مدیریت واحدها، حذف ساکن و «قوانین برج» (محدودیت واحد بدهکار) */
@Injectable()
export class TowerService {
  constructor(private readonly db: DatabaseService) {}

  /* ───────────── واحدها ───────────── */

  async createUnit(tenantId: string, dto: CreateUnitDto, ctx: RequestCtx) {
    const no = normalizeUnitNumber(dto.unit_number)
    if (!no) throw new BadRequestException('شماره‌ی واحد را وارد کنید')
    return this.db.withTenant(tenantId, async (client) => {
      const dup = await client.query(`SELECT 1 FROM property.units WHERE tenant_id = $1 AND unit_number = $2`, [tenantId, no])
      if (dup.rowCount) throw new ConflictException(`واحد ${fa(no)} قبلاً ثبت شده است`)
      const res = await client.query<{ id: string }>(
        `INSERT INTO property.units (tenant_id, unit_number, floor, area_sqm, parking_count, storage_no)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tenantId, no, dto.floor ?? null, dto.area ?? null, dto.parking_count ?? 0, dto.storage_no?.trim() || null],
      )
      await writeAudit(client, tenantId, ctx, 'unit.created', { summary: `واحد ${no} ساخته شد`, unit_id: res.rows[0].id, after: { unit_number: no, floor: dto.floor ?? null } })
      return { id: res.rows[0].id, no, floor: dto.floor ?? null }
    })
  }

  async bulkCreate(tenantId: string, dto: BulkUnitsDto, ctx: RequestCtx) {
    const rows = bulkNumbers(dto.floors, dto.units_per_floor, dto.start_floor ?? 1)
    if (rows.length > MAX_BULK) throw new BadRequestException(`در هر بار حداکثر ${fa(MAX_BULK)} واحد ساخته می‌شود`)
    return this.db.withTenant(tenantId, async (client) => {
      const res = await client.query<{ unit_number: string }>(
        `INSERT INTO property.units (tenant_id, unit_number, floor, area_sqm)
         SELECT $1::uuid, n, f, $4::numeric FROM unnest($2::text[], $3::int[]) AS t(n, f)
         ON CONFLICT (tenant_id, unit_number) DO NOTHING
         RETURNING unit_number`,
        [tenantId, rows.map((r) => r.unit_number), rows.map((r) => r.floor), dto.area ?? null],
      )
      const created = res.rowCount ?? 0
      const skipped = rows.length - created
      await writeAudit(client, tenantId, ctx, 'unit.bulk_created', {
        summary: `${created} واحد به‌صورت گروهی ساخته شد (${dto.floors} طبقه × ${dto.units_per_floor} واحد)${skipped ? `؛ ${skipped} شماره‌ی تکراری رد شد` : ''}`,
        created, skipped,
      })
      return { created, skipped, total: rows.length }
    })
  }

  async updateUnit(tenantId: string, unitId: string, dto: UpdateUnitDto, ctx: RequestCtx) {
    return this.db.withTenant(tenantId, async (client) => {
      const before = await getUnitOr404(client, unitId)
      let no: string | undefined
      if (dto.unit_number !== undefined) {
        no = normalizeUnitNumber(dto.unit_number)
        if (!no) throw new BadRequestException('شماره‌ی واحد را وارد کنید')
        if (no !== before.unit_number) {
          const dup = await client.query(`SELECT 1 FROM property.units WHERE tenant_id = $1 AND unit_number = $2 AND id <> $3`, [tenantId, no, unitId])
          if (dup.rowCount) throw new ConflictException(`واحد ${fa(no)} قبلاً ثبت شده است`)
        }
      }
      await client.query(
        `UPDATE property.units
            SET unit_number = COALESCE($2, unit_number), floor = COALESCE($3, floor), area_sqm = COALESCE($4, area_sqm),
                parking_count = COALESCE($5, parking_count), storage_no = COALESCE($6, storage_no)
          WHERE id = $1`,
        [unitId, no ?? null, dto.floor ?? null, dto.area ?? null, dto.parking_count ?? null, dto.storage_no === undefined ? null : dto.storage_no.trim() || null],
      )
      await writeAudit(client, tenantId, ctx, 'unit.updated', {
        summary: `مشخصات واحد ${before.unit_number} ویرایش شد`, unit_id: unitId,
        before: { unit_number: before.unit_number, floor: before.floor }, after: { unit_number: no ?? before.unit_number, floor: dto.floor ?? before.floor },
      })
      return { id: unitId, no: no ?? before.unit_number }
    })
  }

  /**
   * حذف واحد فقط برای واحدِ اشتباه‌ساخته‌شده است: اگر هیچ‌وقت ساکنی نداشته و بدهی/رزروی ندارد.
   * واحدی که سابقه دارد حذف نمی‌شود (تخلیه می‌شود) تا گزارش‌ها و ممیزی بی‌صاحب نشوند.
   */
  async deleteUnit(tenantId: string, unitId: string, ctx: RequestCtx) {
    return this.db.withTenant(tenantId, async (client) => {
      const unit = await getUnitOr404(client, unitId)
      const live = await client.query(`SELECT 1 FROM residency.memberships WHERE unit_id = $1 AND status <> 'ended' LIMIT 1`, [unitId])
      if (live.rowCount) throw new ConflictException('این واحد ساکن دارد؛ ابتدا ساکنین را حذف یا واحد را تخلیه کنید')
      const history = await client.query(`SELECT 1 FROM residency.memberships WHERE unit_id = $1 LIMIT 1`, [unitId])
      const charges = await client.query(`SELECT 1 FROM finance.monthly_charges WHERE unit_id = $1 LIMIT 1`, [unitId])
      const bookings = await client.query(`SELECT 1 FROM facility.reservations WHERE unit_id = $1 LIMIT 1`, [unitId])
      if (history.rowCount || charges.rowCount || bookings.rowCount) {
        throw new ConflictException('این واحد سابقه‌ی ساکن، شارژ یا رزرو دارد و حذف نمی‌شود')
      }
      await client.query(`DELETE FROM residency.move_outs WHERE unit_id = $1`, [unitId])
      await client.query(`DELETE FROM property.units WHERE id = $1`, [unitId])
      await writeAudit(client, tenantId, ctx, 'unit.deleted', { summary: `واحد ${unit.unit_number} حذف شد`, unit_id: unitId })
      return { ok: true }
    })
  }

  /* ───────────── حذف ساکن ───────────── */

  /**
   * «حذف ساکن» = پایان عضویت با ردپا (سوابق مالی/ممیزی دست‌نخورده می‌ماند):
   * نشست‌های شخص باطل، دعوت باز لغو، و اگر مالکِ ثبت‌شده‌ی واحد بود مالکیت از واحد برداشته می‌شود.
   * سرپرستی که هنوز عضو دیگری دارد حذف نمی‌شود (واحد بدون سرپرست نمی‌ماند).
   */
  async removeMember(tenantId: string, membershipId: string, ctx: RequestCtx): Promise<{ unit_id: string; name: string }> {
    return this.db.withTenant(tenantId, async (client) => {
      const m = await getMembershipOr404(client, membershipId)
      if (m.status === 'ended') throw new NotFoundException('این عضویت قبلاً پایان یافته است')
      const person = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
      if (m.role === 'head') {
        const others = await client.query(
          `SELECT 1 FROM residency.memberships WHERE unit_id = $1 AND id <> $2 AND status IN ('invited','active') AND role <> 'owner_absent' LIMIT 1`,
          [m.unit_id, membershipId],
        )
        if (others.rowCount) throw new ConflictException('این فرد سرپرست واحد است؛ ابتدا سرپرستی را به عضو دیگری واگذار کنید یا کل واحد را تخلیه کنید')
      }
      await client.query(
        `UPDATE residency.invites SET revoked_at = now() WHERE membership_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [membershipId],
      )
      await client.query(
        `UPDATE residency.memberships
            SET status = 'ended', ended_at = now(), end_date = GREATEST(start_date, (now() AT TIME ZONE 'Asia/Tehran')::date), updated_at = now()
          WHERE id = $1`,
        [membershipId],
      )
      await client.query(`UPDATE property.units SET owner_user_id = NULL WHERE id = $1 AND owner_user_id = $2`, [m.unit_id, m.user_id])
      await revokeSessions(client, [m.user_id])
      await writeAudit(client, tenantId, ctx, 'membership.removed', {
        summary: `${person?.name ?? 'ساکن'} (${ROLE_LABEL[m.role] ?? m.role}) از واحد حذف شد`,
        subject_user_id: m.user_id, membership_id: membershipId, unit_id: m.unit_id,
        before: { role: m.role, residency: m.residency, status: m.status },
      })
      return { unit_id: m.unit_id, name: person?.name ?? '' }
    })
  }

  /* ───────────── قوانین برج ───────────── */

  async getRules(tenantId: string) {
    return this.db.withTenant(tenantId, (client) => this.rules(client, tenantId))
  }

  private async rules(client: PoolClient, tenantId: string) {
    const r = (
      await client.query<{ debtor_grace_days: number; debtor_restrictions: Record<string, boolean>; updated_at: string }>(
        `SELECT debtor_grace_days, debtor_restrictions, updated_at FROM residency.building_rules WHERE tenant_id = $1`,
        [tenantId],
      )
    ).rows[0]
    const amenities = (
      await client.query<{ id: string; name: string; icon: string | null }>(`SELECT id, name, icon FROM facility.amenities WHERE is_active ORDER BY name`)
    ).rows
    const debtors = (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM property.units WHERE residency.unit_is_debtor(id)`)).rows[0].n
    return {
      debtor_grace_days: r?.debtor_grace_days ?? DEFAULT_DEBTOR_GRACE_DAYS,
      restrictions: r?.debtor_restrictions ?? {},
      configured: !!r,
      updated_at: r?.updated_at ?? null,
      /** بخش‌های قابل‌محدودسازی — مالی/اعلانات/تیکت/مرسوله/اضطراری عمداً نیستند */
      modules: RESTRICTABLE_MODULES.map((k) => ({ key: `module:${k}`, label: RESTRICTABLE_LABEL[k].t, hint: RESTRICTABLE_LABEL[k].d })),
      amenities: amenities.map((a) => ({ key: `amenity:${a.id}`, id: a.id, label: a.name, icon: a.icon })),
      debtor_units_now: debtors,
    }
  }

  async putRules(tenantId: string, dto: BuildingRulesDto, ctx: RequestCtx) {
    const clean: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(dto.restrictions ?? {})) {
      if (typeof v !== 'boolean') throw new BadRequestException(`مقدار «${k}» باید بله/خیر باشد`)
      if (!isRestrictionKey(k)) throw new BadRequestException(`«${k}» قابل محدودسازی نیست (مالی، تیکت و اعلانات همیشه باز می‌مانند)`)
      // فقط مقدارهای true ذخیره می‌شوند (نبودنِ کلید = محدود نیست) تا JSON کوچک بماند.
      // کلیدها با isRestrictionKey فهرست سفید شده‌اند تا مالی/تیکت/اعلانات هیچ‌وقت قابل قفل‌شدن نباشند.
      if (v) clean[k] = true
    }
    return this.db.withTenant(tenantId, async (client) => {
      // کلید amenity:<id> باید مشاعِ همین ساختمان باشد؛ این کوئری زیر RLS فقط مشاعات tenant جاری را می‌بیند،
      // پس شناسه‌ی مشاعِ ساختمان دیگر رد می‌شود.
      const known = new Set((await client.query<{ id: string }>(`SELECT id FROM facility.amenities`)).rows.map((a) => a.id))
      for (const k of Object.keys(clean)) {
        if (k.startsWith('amenity:') && !known.has(k.slice('amenity:'.length))) throw new BadRequestException('مشاع انتخاب‌شده در این ساختمان نیست')
      }
      const before = (await client.query<{ debtor_grace_days: number; debtor_restrictions: Record<string, boolean> }>(
        `SELECT debtor_grace_days, debtor_restrictions FROM residency.building_rules WHERE tenant_id = $1`, [tenantId])).rows[0]
      await client.query(
        `INSERT INTO residency.building_rules (tenant_id, debtor_grace_days, debtor_restrictions, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id) DO UPDATE
           SET debtor_grace_days = EXCLUDED.debtor_grace_days, debtor_restrictions = EXCLUDED.debtor_restrictions,
               updated_by = EXCLUDED.updated_by, updated_at = now()`,
        // دفاعی: اگر sub توکن UUID معتبر نباشد (مثلاً توکن توسعه/تست) به‌جای خطای نوع uuid در ستون updated_by، null ذخیره می‌شود.
        [tenantId, dto.debtor_grace_days, JSON.stringify(clean), /^[0-9a-f-]{36}$/i.test(ctx.user.sub) ? ctx.user.sub : null],
      )
      await writeAudit(client, tenantId, ctx, 'building_rules.updated', {
        summary: `قوانین برج: مهلت بدهکاری ${dto.debtor_grace_days} روز، ${Object.keys(clean).length} مورد محدود برای واحد بدهکار`,
        before: before ? { grace: before.debtor_grace_days, restrictions: before.debtor_restrictions } : null,
        after: { grace: dto.debtor_grace_days, restrictions: clean },
      })
      return this.rules(client, tenantId)
    })
  }
}
