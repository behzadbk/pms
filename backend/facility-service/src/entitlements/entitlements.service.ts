import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'crypto'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'
import { allocate, endOfTehranDay, periodLabel, quotaKey, resolveTier, round2, tehranIsoDate, tehranPeriod, type AllocEvent, type TierMatch, type TierRow } from './engine'
import { faDigits, faMoney, notify, unitRecipients } from './notify'

export type ServiceKind = 'quota' | 'paid' | 'free'
export type PeriodType = 'month' | 'year'

export interface Tariff {
  id: string
  service_id: string
  code: string
  title: string
  unit_price: number
  step: number
  counts_toward_quota: boolean
  is_default: boolean
  is_active: boolean
  sort: number
}

export interface CatalogService {
  id: string
  code: string
  title: string
  kind: ServiceKind
  unit_kind: 'count' | 'minutes' | 'hours' | 'people' | 'days'
  unit_label: string
  period_type: PeriodType
  supports_ticket: boolean
  note: string | null
  sort: number
  is_active: boolean
  tariffs: Tariff[]
}

export interface Catalog {
  tiers: TierRow[]
  services: CatalogService[]
  /** quotas[serviceId][tierId] = تعداد رایگان */
  quotas: Record<string, Record<string, number>>
}

export interface ServiceSummary {
  code: string
  title: string
  kind: ServiceKind
  unit_kind: CatalogService['unit_kind']
  unit_label: string
  period_type: PeriodType
  window_label: string
  supports_ticket: boolean
  note: string | null
  /** سهمیه‌ی رایگان سطح واحد؛ null برای خدمات پولی/رایگان یا وقتی سطح واحد مشخص نیست */
  included: number | null
  used: number
  remaining: number | null
  overage_qty: number
  overage_amount: number
  open_tickets: number
  tariffs: { code: string; title: string; unit_price: number; step: number; counts_toward_quota: boolean; is_default: boolean }[]
}

export interface UnitSummary {
  unit: { id: string; unit_number: string; floor: number | null; area: number | null }
  tier: { id: string; name: string; min_area: number } | null
  tier_match: TierMatch
  period: string
  period_label: string
  services: ServiceSummary[]
  totals: {
    /** مازاد مصرف ماه جاری (همه‌ی خدمات) */
    overage_this_period: number
    /** همه‌ی مازادِ هنوز به شارژ نرفته — در صدور شارژ ماه بعد اضافه می‌شود */
    unbilled: number
  }
}

export interface EventRow {
  id: string
  unit_id: string
  unit_number: string
  service_code: string
  service_title: string
  unit_label: string
  tariff_title: string | null
  quantity: number
  occurred_at: string
  period: string
  source: 'desk' | 'qr_guest'
  note: string | null
  status: 'active' | 'void'
  void_reason: string | null
  quota_qty: number
  overage_qty: number
  amount: number
  billed: boolean
  recorded_by_name: string | null
}

export interface TicketRow {
  id: string
  unit_id: string
  unit_number?: string
  service_code: string
  service_title: string
  guest_name: string
  qr: string
  valid_until: string
  status: 'issued' | 'used' | 'void' | 'expired'
  used_at: string | null
  created_at: string
}

const MAX_OPEN_TICKETS = 10
const MAX_QUANTITY = 1000
const COUNT_KINDS = new Set(['count', 'people', 'days'])
export const QR_PREFIX = 'ent-guest:'

const EVENT_SELECT = `
  SELECT e.id, e.unit_id, u.unit_number, s.code AS service_code, s.title AS service_title, s.unit_label,
         t.title AS tariff_title, e.quantity::float8 AS quantity, e.occurred_at, e.period, e.source, e.note, e.status, e.void_reason,
         e.quota_qty::float8 AS quota_qty, e.overage_qty::float8 AS overage_qty, e.amount::float8 AS amount,
         (e.billed_charge_id IS NOT NULL) AS billed, cu.full_name AS recorded_by_name
    FROM entitlement.usage_events e
    JOIN entitlement.services s ON s.id = e.service_id
    JOIN property.units u ON u.id = e.unit_id
    LEFT JOIN entitlement.tariffs t ON t.id = e.tariff_id
    LEFT JOIN identity.users cu ON cu.id = e.recorded_by`

const TICKET_SELECT = `
  SELECT g.id, g.unit_id, u.unit_number, s.code AS service_code, s.title AS service_title, g.guest_name, g.token,
         g.valid_until, g.used_at, g.created_at,
         CASE WHEN g.status = 'issued' AND g.valid_until < now() THEN 'expired' ELSE g.status END AS status
    FROM entitlement.guest_tickets g
    JOIN entitlement.services s ON s.id = g.service_id
    JOIN property.units u ON u.id = g.unit_id`

type TicketDbRow = Omit<TicketRow, 'qr'> & { token: string }
const toTicket = ({ token, ...rest }: TicketDbRow): TicketRow => ({ ...rest, qr: `${QR_PREFIX}${token}` })

@Injectable()
export class EntitlementsService {
  // ───────────────────────── کاتالوگ و سطح ─────────────────────────

  async catalog(client: PoolClient, opts: { activeOnly?: boolean } = {}): Promise<Catalog> {
    const [sv, tf, tr, qt] = await Promise.all([
      client.query<Omit<CatalogService, 'tariffs'>>(
        `SELECT id, code, title, kind, unit_kind, unit_label, period_type, supports_ticket, note, sort, is_active
           FROM entitlement.services ${opts.activeOnly ? 'WHERE is_active' : ''} ORDER BY sort, code`),
      client.query<Tariff>(
        `SELECT id, service_id, code, title, unit_price::float8 AS unit_price, step::float8 AS step, counts_toward_quota, is_default, is_active, sort
           FROM entitlement.tariffs ${opts.activeOnly ? 'WHERE is_active' : ''} ORDER BY service_id, sort, code`),
      client.query<TierRow>(`SELECT id, name, min_area::float8 AS min_area, sort FROM entitlement.tiers ORDER BY min_area`),
      client.query<{ tier_id: string; service_id: string; included: number }>(`SELECT tier_id, service_id, included::float8 AS included FROM entitlement.quotas`),
    ])
    const quotas: Catalog['quotas'] = {}
    for (const q of qt.rows) (quotas[q.service_id] ??= {})[q.tier_id] = q.included
    return {
      tiers: tr.rows,
      services: sv.rows.map((s) => ({ ...s, tariffs: tf.rows.filter((t) => t.service_id === s.id) })),
      quotas,
    }
  }

  async unitFacts(client: PoolClient, unitId: string) {
    const r = await client.query<{ id: string; unit_number: string; floor: number | null; area: number | null }>(
      `SELECT id, unit_number, floor, area_sqm::float8 AS area FROM property.units WHERE id = $1`, [unitId])
    if (!r.rows[0]) throw new NotFoundException('واحد یافت نشد')
    return r.rows[0]
  }

  /** واحد ساکن + نقش عضویت (برای تصمیم صدور بلیت) */
  async myUnit(client: PoolClient, user: JwtPayload) {
    const q = await client.query<{ unit_id: string; role: string }>(
      `SELECT m.unit_id, m.role FROM residency.memberships m
        WHERE m.status = 'active' AND m.user_id = COALESCE($1::uuid, (SELECT person_id FROM identity.users WHERE id = $2))
        ORDER BY (m.role = 'head') DESC, m.created_at LIMIT 1`,
      [user.pid ?? null, user.sub])
    if (!q.rows[0]) throw new ForbiddenException('عضویت فعالی در این ساختمان ندارید')
    return q.rows[0]
  }

  // ───────────────────────── خلاصه‌ی واحد ─────────────────────────

  async summary(client: PoolClient, unitId: string, now: Date = new Date()): Promise<UnitSummary> {
    const unit = await this.unitFacts(client, unitId)
    const cat = await this.catalog(client, { activeOnly: true })
    const { tier, match } = resolveTier(cat.tiers, unit.area)
    const period = tehranPeriod(now)
    const year = period.slice(0, 4)

    // مصرف دوره‌ی جاری هر خدمت. پنجره‌ی سهمیه به نوع خدمت بستگی دارد: خدمت ماهانه فقط رویدادهای همان
    // دوره‌ی «YYYY-MM» را می‌شمرد، خدمت سالانه همه‌ی ماه‌های همان سال را (left(period,4) = سال).
    // counted = فقط رویدادهایی که از سهمیه کم می‌شوند؛ total = همه (شامل رویدادهای کاملاً پولی).
    const agg = await client.query<{ service_id: string; counted: number; total: number; overage_qty: number; amount: number }>(
      `SELECT e.service_id,
              COALESCE(sum(e.quantity) FILTER (WHERE e.counts_toward_quota), 0)::float8 AS counted,
              COALESCE(sum(e.quantity), 0)::float8 AS total,
              COALESCE(sum(e.overage_qty), 0)::float8 AS overage_qty,
              COALESCE(sum(e.amount), 0)::float8 AS amount
         FROM entitlement.usage_events e JOIN entitlement.services s ON s.id = e.service_id
        WHERE e.unit_id = $1 AND e.status = 'active'
          AND CASE WHEN s.period_type = 'year' THEN left(e.period, 4) = $3 ELSE e.period = $2 END
        GROUP BY e.service_id`,
      [unitId, period, year])
    const byService = new Map(agg.rows.map((a) => [a.service_id, a]))

    const tk = await client.query<{ service_id: string; n: number }>(
      `SELECT service_id, count(*)::int AS n FROM entitlement.guest_tickets
        WHERE unit_id = $1 AND status = 'issued' AND valid_until > now() GROUP BY service_id`, [unitId])
    const openTickets = new Map(tk.rows.map((t) => [t.service_id, t.n]))

    // this_period = مبلغ مصرف همین دوره؛ unbilled = مبلغی که هنوز روی هیچ شارژی نشسته (billed_charge_id خالی)
    // و در صدور شارژ بعدی به صورتحساب واحد اضافه می‌شود.
    const totals = await client.query<{ this_period: number; unbilled: number }>(
      `SELECT COALESCE(sum(amount) FILTER (WHERE period = $2), 0)::float8 AS this_period,
              COALESCE(sum(amount) FILTER (WHERE billed_charge_id IS NULL), 0)::float8 AS unbilled
         FROM entitlement.usage_events WHERE unit_id = $1 AND status = 'active'`, [unitId, period])

    const services: ServiceSummary[] = cat.services.map((s) => {
      const a = byService.get(s.id)
      const included = s.kind === 'quota' && tier ? cat.quotas[s.id]?.[tier.id] ?? 0 : null
      const used = round2(s.kind === 'quota' ? a?.counted ?? 0 : a?.total ?? 0)
      return {
        code: s.code,
        title: s.title,
        kind: s.kind,
        unit_kind: s.unit_kind,
        unit_label: s.unit_label,
        period_type: s.period_type,
        window_label: s.period_type === 'year' ? `سال ${faDigits(year)}` : periodLabel(period),
        supports_ticket: s.supports_ticket,
        note: s.note,
        included,
        used,
        // remaining فقط برای خدمت سهمیه‌ای معنا دارد (null = نامحدود/بدون سهمیه) و هرگز منفی نمی‌شود؛
        // مصرف بیش از سهمیه در overage_qty/amount نشان داده می‌شود.
        remaining: included === null ? null : round2(Math.max(0, included - used)),
        overage_qty: round2(a?.overage_qty ?? 0),
        overage_amount: Math.round(a?.amount ?? 0),
        open_tickets: openTickets.get(s.id) ?? 0,
        tariffs: s.tariffs.map((t) => ({ code: t.code, title: t.title, unit_price: t.unit_price, step: t.step, counts_toward_quota: t.counts_toward_quota, is_default: t.is_default })),
      }
    })

    return {
      unit,
      tier: tier ? { id: tier.id, name: tier.name, min_area: tier.min_area } : null,
      tier_match: match,
      period,
      period_label: periodLabel(period),
      services,
      totals: { overage_this_period: Math.round(totals.rows[0].this_period), unbilled: Math.round(totals.rows[0].unbilled) },
    }
  }

  /** پیش‌نمایش آفرهای یک متراژ (هنگام تعریف ساکن/واحد، قبل از ذخیره) */
  async previewByArea(client: PoolClient, area: number) {
    const cat = await this.catalog(client, { activeOnly: true })
    const { tier, match } = resolveTier(cat.tiers, area)
    return {
      area,
      tier: tier ? { id: tier.id, name: tier.name, min_area: tier.min_area } : null,
      tier_match: match,
      quotas: tier
        ? cat.services
            .filter((s) => s.kind === 'quota')
            .map((s) => ({ code: s.code, title: s.title, unit_label: s.unit_label, period_type: s.period_type, included: cat.quotas[s.id]?.[tier.id] ?? 0 }))
        : [],
    }
  }

  // ───────────────────────── محاسبه‌ی مجدد سهمیه ─────────────────────────

  private async lock(client: PoolClient, unitId: string, serviceId: string) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`ent:${unitId}:${serviceId}`])
  }

  /**
   * همه‌ی رویدادهای فعال یک (واحد، خدمت) را به‌ترتیب زمان در هر پنجره‌ی سهمیه دوباره سهم‌بندی می‌کند.
   * رویدادهایی که قبلاً به شارژ رفته‌اند فریز هستند و دست نمی‌خورند.
   */
  async recompute(client: PoolClient, unitId: string, serviceId: string): Promise<void> {
    const svc = await client.query<{ period_type: PeriodType }>(`SELECT period_type FROM entitlement.services WHERE id = $1`, [serviceId])
    if (!svc.rows[0]) return
    const periodType = svc.rows[0].period_type
    const unit = await this.unitFacts(client, unitId)
    const cat = await this.catalog(client)
    const { tier } = resolveTier(cat.tiers, unit.area)
    const included = tier ? cat.quotas[serviceId]?.[tier.id] ?? 0 : 0

    type Ev = AllocEvent & { period: string; billed: boolean; cur_quota: number; cur_over: number; cur_amount: number }
    const rows = await client.query<{
      id: string; occurred_at: string; period: string; quantity: number; counts: boolean; price: number; step: number
      billed: boolean; cur_quota: number; cur_over: number; cur_amount: number
    }>(
      `SELECT id, occurred_at, period, quantity::float8 AS quantity, counts_toward_quota AS counts, unit_price::float8 AS price, step::float8 AS step,
              (billed_charge_id IS NOT NULL) AS billed, quota_qty::float8 AS cur_quota, overage_qty::float8 AS cur_over, amount::float8 AS cur_amount
         FROM entitlement.usage_events
        WHERE unit_id = $1 AND service_id = $2 AND status = 'active' ORDER BY occurred_at, id`,
      [unitId, serviceId])

    const groups = new Map<string, Ev[]>()
    for (const r of rows.rows) {
      const key = quotaKey(periodType, r.period)
      const list = groups.get(key) ?? []
      list.push({ id: r.id, occurred_at: r.occurred_at, quantity: r.quantity, counts_toward_quota: r.counts, unit_price: r.price, step: r.step, period: r.period, billed: r.billed, cur_quota: r.cur_quota, cur_over: r.cur_over, cur_amount: r.cur_amount })
      groups.set(key, list)
    }
    for (const list of groups.values()) {
      const byId = new Map(list.map((e) => [e.id, e]))
      for (const a of allocate(included, list)) {
        const e = byId.get(a.id)!
        if (e.billed) continue
        if (a.quota_qty === e.cur_quota && a.overage_qty === e.cur_over && a.amount === e.cur_amount) continue
        await client.query(`UPDATE entitlement.usage_events SET quota_qty = $2, overage_qty = $3, amount = $4 WHERE id = $1`, [a.id, a.quota_qty, a.overage_qty, a.amount])
      }
    }
  }

  /** بعد از ویرایش سهمیه‌ی یک خدمت، رویدادهای هنوز-به-شارژ-نرفته‌ی همه‌ی واحدها دوباره سهم‌بندی می‌شود */
  async recomputeService(client: PoolClient, serviceId: string): Promise<number> {
    const units = await client.query<{ unit_id: string }>(
      `SELECT DISTINCT unit_id FROM entitlement.usage_events WHERE service_id = $1 AND status = 'active'`, [serviceId])
    for (const u of units.rows) {
      await this.lock(client, u.unit_id, serviceId)
      await this.recompute(client, u.unit_id, serviceId)
    }
    return units.rows.length
  }

  /** همه‌ی (واحد، خدمت)های دارای مصرف فعال را دوباره سهم‌بندی می‌کند (تغییر سطح‌ها/الگو/متراژ) */
  async recomputeAll(client: PoolClient): Promise<number> {
    const pairs = await client.query<{ unit_id: string; service_id: string }>(
      `SELECT DISTINCT e.unit_id, e.service_id FROM entitlement.usage_events e WHERE e.status = 'active' AND e.billed_charge_id IS NULL`)
    for (const p of pairs.rows) {
      await this.lock(client, p.unit_id, p.service_id)
      await this.recompute(client, p.unit_id, p.service_id)
    }
    return pairs.rows.length
  }

  // ───────────────────────── ثبت و ابطال مصرف ─────────────────────────

  async record(
    client: PoolClient,
    actor: JwtPayload,
    input: { unitId: string; serviceCode: string; variantCode?: string; quantity: number; note?: string; source?: 'desk' | 'qr_guest'; ticketId?: string },
  ): Promise<EventRow> {
    const svc = await client.query<{ id: string; code: string; title: string; unit_kind: string; unit_label: string; kind: ServiceKind }>(
      `SELECT id, code, title, unit_kind, unit_label, kind FROM entitlement.services WHERE code = $1 AND is_active`, [input.serviceCode])
    const s = svc.rows[0]
    if (!s) throw new NotFoundException('این خدمت تعریف نشده یا غیرفعال است')

    const q = Number(input.quantity)
    if (!Number.isFinite(q) || q <= 0) throw new BadRequestException('مقدار مصرف باید بزرگ‌تر از صفر باشد')
    if (q > MAX_QUANTITY) throw new BadRequestException(`مقدار مصرف بیش از حد مجاز است (حداکثر ${faDigits(MAX_QUANTITY)})`)
    if (COUNT_KINDS.has(s.unit_kind) && !Number.isInteger(q)) throw new BadRequestException(`مقدار «${s.unit_label}» باید عدد صحیح باشد`)
    const quantity = round2(q)

    const unit = await this.unitFacts(client, input.unitId)

    const tariffs = await client.query<{ id: string; title: string; unit_price: number; step: number; counts_toward_quota: boolean; is_default: boolean }>(
      `SELECT id, title, unit_price::float8 AS unit_price, step::float8 AS step, counts_toward_quota, is_default
         FROM entitlement.tariffs WHERE service_id = $1 AND is_active ORDER BY is_default DESC, sort, code`, [s.id])
    let tariff = tariffs.rows[0] ?? null
    if (input.variantCode) {
      const code = await client.query<{ id: string }>(`SELECT id FROM entitlement.tariffs WHERE service_id = $1 AND code = $2 AND is_active`, [s.id, input.variantCode])
      tariff = tariffs.rows.find((t) => t.id === code.rows[0]?.id) ?? null
      if (!tariff) throw new NotFoundException('این نوع خدمت تعریف نشده یا غیرفعال است')
    }

    await this.lock(client, unit.id, s.id)
    const note = input.note?.trim().slice(0, 200) || null
    const ins = await client.query<{ id: string }>(
      `INSERT INTO entitlement.usage_events (tenant_id, unit_id, service_id, tariff_id, quantity, unit_price, step, counts_toward_quota, period, source, ticket_id, recorded_by, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [actor.tenant_id, unit.id, s.id, tariff?.id ?? null, quantity, tariff?.unit_price ?? 0, tariff?.step ?? 1, tariff?.counts_toward_quota ?? true,
        tehranPeriod(), input.source ?? 'desk', input.ticketId ?? null, actor.sub, note])
    await this.recompute(client, unit.id, s.id)
    const ev = await this.eventById(client, ins.rows[0].id)

    if (ev.amount > 0) {
      await notify(client, actor.tenant_id!, await unitRecipients(client, unit.id), {
        kind: 'entitlement_overage',
        title: 'مصرف مازاد بر سهمیه',
        body: `${s.title}: ${faDigits(ev.overage_qty)} ${s.unit_label} مازاد — ${faMoney(ev.amount)} تومان به شارژ ماه بعد اضافه می‌شود`,
        link: '/resident/offers',
        ref: ev.id,
      })
    }
    return ev
  }

  async eventById(client: PoolClient, id: string): Promise<EventRow> {
    const r = await client.query<EventRow>(`${EVENT_SELECT} WHERE e.id = $1`, [id])
    if (!r.rows[0]) throw new NotFoundException('رویداد مصرف یافت نشد')
    return r.rows[0]
  }

  async listEvents(client: PoolClient, f: { unitId?: string; period?: string; limit?: number }): Promise<EventRow[]> {
    const where: string[] = []
    const vals: unknown[] = []
    if (f.unitId) { vals.push(f.unitId); where.push(`e.unit_id = $${vals.length}`) }
    if (f.period) { vals.push(f.period); where.push(`e.period = $${vals.length}`) }
    vals.push(Math.min(Math.max(f.limit ?? 50, 1), 200))
    const r = await client.query<EventRow>(`${EVENT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.occurred_at DESC LIMIT $${vals.length}`, vals)
    return r.rows
  }

  async voidEvent(client: PoolClient, actor: JwtPayload, eventId: string, reason: string): Promise<EventRow> {
    const cur = await client.query<{ unit_id: string; service_id: string; status: string; billed: boolean }>(
      `SELECT unit_id, service_id, status, (billed_charge_id IS NOT NULL) AS billed FROM entitlement.usage_events WHERE id = $1 FOR UPDATE`, [eventId])
    const e = cur.rows[0]
    if (!e) throw new NotFoundException('رویداد مصرف یافت نشد')
    if (e.status === 'void') throw new ConflictException('این رویداد قبلاً ابطال شده است')
    if (e.billed) throw new ConflictException('این مصرف قبلاً به شارژ واحد اضافه شده؛ اصلاح آن با حسابدار است')
    await this.lock(client, e.unit_id, e.service_id)
    await client.query(
      `UPDATE entitlement.usage_events SET status = 'void', void_reason = $2, voided_at = now(), voided_by = $3, quota_qty = 0, overage_qty = 0, amount = 0 WHERE id = $1`,
      [eventId, reason.trim().slice(0, 200), actor.sub])
    await this.recompute(client, e.unit_id, e.service_id)
    return this.eventById(client, eventId)
  }

  // ───────────────────────── بلیت QR مهمان ─────────────────────────

  async issueTicket(client: PoolClient, user: JwtPayload, input: { serviceCode: string; guestName: string; date?: string }) {
    const m = await this.myUnit(client, user)
    if (['caregiver', 'owner_absent'].includes(m.role)) throw new ForbiddenException('صدور بلیت مهمان برای این نوع عضویت فعال نیست')
    const svc = await client.query<{ id: string; title: string }>(
      `SELECT id, title FROM entitlement.services WHERE code = $1 AND is_active AND supports_ticket`, [input.serviceCode])
    if (!svc.rows[0]) throw new NotFoundException('برای این خدمت بلیت مهمان تعریف نشده است')

    const name = input.guestName.trim()
    if (name.length < 2 || name.length > 80) throw new BadRequestException('نام مهمان باید بین ۲ تا ۸۰ حرف باشد')

    const today = tehranIsoDate()
    const date = input.date ?? today
    const days = Math.round((new Date(`${date}T12:00:00+03:30`).getTime() - new Date(`${today}T12:00:00+03:30`).getTime()) / 86400_000)
    if (!Number.isFinite(days) || days < 0) throw new BadRequestException('تاریخ ورود نمی‌تواند گذشته باشد')
    if (days > 14) throw new BadRequestException('بلیت را حداکثر برای ۱۴ روز آینده می‌توانید صادر کنید')

    await this.lock(client, m.unit_id, svc.rows[0].id)
    const open = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM entitlement.guest_tickets WHERE unit_id = $1 AND service_id = $2 AND status = 'issued' AND valid_until > now()`, [m.unit_id, svc.rows[0].id])
    if (open.rows[0].n >= MAX_OPEN_TICKETS) throw new BadRequestException(`حداکثر ${faDigits(MAX_OPEN_TICKETS)} بلیت باز برای هر خدمت مجاز است؛ ابتدا بلیت‌های استفاده‌نشده را باطل کنید`)

    const token = randomBytes(18).toString('base64url')
    const ins = await client.query<{ id: string }>(
      `INSERT INTO entitlement.guest_tickets (tenant_id, unit_id, service_id, guest_name, token, valid_until, issued_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [user.tenant_id, m.unit_id, svc.rows[0].id, name, token, endOfTehranDay(date), user.sub])
    return this.ticketById(client, ins.rows[0].id)
  }

  async ticketById(client: PoolClient, id: string): Promise<TicketRow> {
    const r = await client.query<TicketDbRow>(`${TICKET_SELECT} WHERE g.id = $1`, [id])
    if (!r.rows[0]) throw new NotFoundException('بلیت یافت نشد')
    return toTicket(r.rows[0])
  }

  async myTickets(client: PoolClient, user: JwtPayload): Promise<TicketRow[]> {
    const m = await this.myUnit(client, user)
    const r = await client.query<TicketDbRow>(`${TICKET_SELECT} WHERE g.unit_id = $1 ORDER BY g.created_at DESC LIMIT 30`, [m.unit_id])
    return r.rows.map(toTicket)
  }

  async voidMyTicket(client: PoolClient, user: JwtPayload, id: string): Promise<TicketRow> {
    const m = await this.myUnit(client, user)
    const r = await client.query<{ status: string }>(`SELECT status FROM entitlement.guest_tickets WHERE id = $1 AND unit_id = $2 FOR UPDATE`, [id, m.unit_id])
    if (!r.rows[0]) throw new NotFoundException('بلیت یافت نشد')
    if (r.rows[0].status !== 'issued') throw new ConflictException('فقط بلیت استفاده‌نشده قابل ابطال است')
    await client.query(`UPDATE entitlement.guest_tickets SET status = 'void' WHERE id = $1`, [id])
    return this.ticketById(client, id)
  }

  /** اسکن QR توسط مسئول: بلیت یک‌بارمصرف است و همان لحظه از سهمیه‌ی واحد کم می‌شود */
  async scanTicket(client: PoolClient, actor: JwtPayload, raw: string) {
    const token = raw.trim().replace(new RegExp(`^${QR_PREFIX}`), '')
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new BadRequestException('این کد، بلیت مهمان نیست')
    const r = await client.query<{ id: string; unit_id: string; service_id: string; guest_name: string; status: string; used_at: string | null; valid_until: string; expired: boolean; service_code: string; service_title: string; unit_label: string }>(
      `SELECT g.id, g.unit_id, g.service_id, g.guest_name, g.status, g.used_at, g.valid_until, (g.valid_until < now()) AS expired,
              s.code AS service_code, s.title AS service_title, s.unit_label
         FROM entitlement.guest_tickets g JOIN entitlement.services s ON s.id = g.service_id
        WHERE g.token = $1 FOR UPDATE OF g`, [token])
    const t = r.rows[0]
    if (!t) throw new NotFoundException('بلیتی با این کد پیدا نشد')
    if (t.status === 'used') throw new ConflictException(`این بلیت قبلاً استفاده شده است (${t.used_at ? new Date(t.used_at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'short', timeStyle: 'short' }) : ''})`)
    if (t.status === 'void') throw new GoneException('این بلیت توسط ساکن باطل شده است')
    if (t.expired) throw new GoneException('مهلت این بلیت تمام شده است')

    const ev = await this.record(client, actor, {
      unitId: t.unit_id, serviceCode: t.service_code, quantity: 1, source: 'qr_guest', ticketId: t.id, note: `مهمان: ${t.guest_name}`,
    })
    await client.query(`UPDATE entitlement.guest_tickets SET status = 'used', used_at = now(), used_by = $2, usage_event_id = $3 WHERE id = $1`, [t.id, actor.sub, ev.id])

    const sum = await this.summary(client, t.unit_id)
    const line = sum.services.find((x) => x.code === t.service_code) ?? null
    if (ev.amount === 0) {
      await notify(client, actor.tenant_id!, await unitRecipients(client, t.unit_id), {
        kind: 'entitlement_guest_in',
        title: 'مهمان شما وارد شد',
        body: `${t.guest_name} — ${t.service_title}`,
        link: '/resident/offers',
        ref: ev.id,
      })
    }
    return {
      ok: true,
      guest_name: t.guest_name,
      unit_number: sum.unit.unit_number,
      service_title: t.service_title,
      charged: ev.amount > 0,
      amount: ev.amount,
      remaining: line?.remaining ?? null,
      included: line?.included ?? null,
      used: line?.used ?? 0,
      unit_label: t.unit_label,
      event: ev,
    }
  }
}
