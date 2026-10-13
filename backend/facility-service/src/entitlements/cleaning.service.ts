import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'
import {
  allocate,
  CLEANING_MAX_HOURS,
  CLEANING_MIN_MINUTES,
  cleaningQuantity,
  cleaningShift,
  durationLabel,
  HOUSEKEEPING_CODE,
  minutesBetween,
  periodLabel,
  quotaKey,
  resolveTier,
  round2,
  tehranPeriod,
  type AllocEvent,
  type CleaningShift,
} from './engine'
import { EntitlementsService, type EventRow, type PeriodType } from './entitlements.service'
import { faDigits, faMoney, notify, unitRecipients } from './notify'

/**
 * نظافت منزل — پنل تیم «نظافت منازل».
 *
 * نظافتچی واحد را انتخاب و شروع/پایان را ثبت می‌کند؛ مدت کار با «ساعت شروع» در شیفتِ نرخ می‌نشیند و از سهمیه‌ی
 * ساعتِ خدمت «خانه‌داری» همان واحد کم می‌شود. مازاد را خودِ موتور آفرها (EntitlementsService.record + allocate)
 * محاسبه می‌کند و در صدور شارژ ماه بعد به شارژ واحد اضافه می‌شود — همین‌جا هیچ منطق مالی موازی نیست.
 */

const SHIFT_LABEL: Record<CleaningShift, string> = {
  day: 'ساعت ۸ تا ۱۶',
  overtime: 'اضافه‌کاری ۱۶ تا ۲۲',
  night: 'شب‌کاری',
}
/** مهلتِ ابطال توسط خودِ نظافتچی بعد از ثبت */
const VOID_WINDOW_MS = 24 * 3600_000
/** ثبت دستی حداکثر تا ۴۸ ساعت قبل */
const BACKDATE_LIMIT_MS = 48 * 3600_000
/** تحمل اختلاف ساعت گوشی و سرور */
const CLOCK_SKEW_MS = 2 * 60_000

const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const clock = (d: Date) => new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)

export interface CleaningSession {
  id: string
  unit_id: string
  unit_number: string
  floor: number | null
  started_at: string
  ended_at: string | null
  status: 'running' | 'done' | 'cancelled' | 'void'
  entry: 'timer' | 'manual'
  note: string | null
  /** مقدار ثبت‌شده به «واحد خدمت» (ساعت یا دقیقه) */
  quantity: number | null
  unit_label: string | null
  tariff_title: string | null
  quota_qty: number
  overage_qty: number
  amount: number
  billed: boolean
  can_void: boolean
}

export interface CleaningOutcome {
  minutes: number
  duration_label: string
  quantity: number
  unit_label: string
  shift: CleaningShift
  shift_label: string
  tariff_title: string | null
  /** بخشی که از سهمیه‌ی رایگان پوشش داده می‌شود / بخش مازاد / مبلغ مازاد (تومان) */
  free_qty: number
  overage_qty: number
  amount: number
  included: number
  /** سهمیه‌ی باقی‌مانده‌ی پنجره‌ی سهمیه بعد از این نظافت */
  remaining_after: number
  /** سطح سهمیه‌ی واحد مشخص نیست (متراژ ثبت نشده) ⇒ همه‌ی مدت مازاد حساب می‌شود */
  no_tier: boolean
  window_label: string
}

interface HousekeepingService {
  id: string
  title: string
  unit_kind: string
  unit_label: string
  period_type: PeriodType
}

interface TariffRow {
  id: string
  code: string
  title: string
  unit_price: number
  step: number
  counts_toward_quota: boolean
}

const SESSION_SELECT = `
  SELECT s.id, s.unit_id, u.unit_number, u.floor, s.started_at, s.ended_at, s.status, s.entry, s.note,
         e.quantity::float8 AS quantity, sv.unit_label, t.title AS tariff_title,
         COALESCE(e.quota_qty, 0)::float8 AS quota_qty, COALESCE(e.overage_qty, 0)::float8 AS overage_qty, COALESCE(e.amount, 0)::float8 AS amount,
         COALESCE(e.billed_charge_id IS NOT NULL, false) AS billed
    FROM entitlement.cleaning_sessions s
    JOIN property.units u ON u.id = s.unit_id
    LEFT JOIN entitlement.usage_events e ON e.id = s.usage_event_id
    LEFT JOIN entitlement.services sv ON sv.id = e.service_id
    LEFT JOIN entitlement.tariffs t ON t.id = e.tariff_id`

type SessionDb = Omit<CleaningSession, 'can_void'>
const withVoid = (r: SessionDb): CleaningSession => ({
  ...r,
  can_void: r.status === 'done' && !r.billed && !!r.ended_at && Date.now() - new Date(r.ended_at).getTime() <= VOID_WINDOW_MS,
})

export function isCleaner(user: JwtPayload) {
  return user.role === 'admin' || (user.role === 'staff' && (user.perms ?? []).includes('housekeeping'))
}

@Injectable()
export class CleaningService {
  constructor(private readonly ent: EntitlementsService) {}

  // ───────────────────────── خدمت و تعرفه ─────────────────────────

  private async housekeeping(client: PoolClient): Promise<HousekeepingService> {
    const r = await client.query<HousekeepingService>(
      `SELECT id, title, unit_kind, unit_label, period_type FROM entitlement.services WHERE code = $1 AND is_active`, [HOUSEKEEPING_CODE])
    const s = r.rows[0]
    if (!s) throw new ConflictException('خدمت «خانه‌داری» برای این ساختمان فعال نیست؛ از مدیر بخواهید در بخش «آفرها و خدمات» آن را تعریف کند')
    if (s.unit_kind !== 'hours' && s.unit_kind !== 'minutes') {
      throw new ConflictException('واحد خدمت «خانه‌داری» باید ساعت یا دقیقه باشد؛ موضوع را به مدیر اطلاع دهید')
    }
    return s
  }

  /** تعرفه‌ی شیفت (day/overtime/night)؛ اگر ساختمان آن را نداشته باشد تعرفه‌ی پیش‌فرض خدمت */
  private async tariffFor(client: PoolClient, serviceId: string, shift: CleaningShift): Promise<{ tariff: TariffRow | null; variantCode: string | undefined }> {
    const r = await client.query<TariffRow>(
      `SELECT id, code, title, unit_price::float8 AS unit_price, step::float8 AS step, counts_toward_quota
         FROM entitlement.tariffs WHERE service_id = $1 AND is_active ORDER BY is_default DESC, sort, code`, [serviceId])
    const byShift = r.rows.find((t) => t.code === shift)
    return byShift ? { tariff: byShift, variantCode: shift } : { tariff: r.rows[0] ?? null, variantCode: undefined }
  }

  // ───────────────────────── محاسبه‌ی دقیق (همان موتور) ─────────────────────────

  /** اعتبارسنجی خالصِ بازه (بدون دیتابیس)؛ مدت را به دقیقه برمی‌گرداند */
  private checkRange(startedAt: Date, endedAt: Date, manual: boolean): number {
    const now = Date.now()
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) throw new BadRequestException('ساعت شروع یا پایان نامعتبر است')
    if (endedAt.getTime() > now + CLOCK_SKEW_MS) throw new BadRequestException('ساعت پایان نمی‌تواند در آینده باشد')
    if (endedAt.getTime() <= startedAt.getTime()) throw new BadRequestException('ساعت پایان باید بعد از ساعت شروع باشد')
    if (manual && startedAt.getTime() < now - BACKDATE_LIMIT_MS) throw new BadRequestException('ثبت دستی فقط تا ۴۸ ساعت قبل ممکن است؛ برای زمان‌های قدیمی‌تر با مدیر هماهنگ کنید')

    const minutes = minutesBetween(startedAt, endedAt)
    if (minutes < CLEANING_MIN_MINUTES) throw new BadRequestException(`نظافت کمتر از ${faDigits(CLEANING_MIN_MINUTES)} دقیقه ثبت نمی‌شود؛ اگر اشتباهی شروع شده، آن را لغو کنید`)
    if (minutes > CLEANING_MAX_HOURS * 60) throw new BadRequestException(`مدت نظافت بیش از ${faDigits(CLEANING_MAX_HOURS)} ساعت است؛ ساعت پایان را درست کنید`)
    return minutes
  }

  /** اعتبارسنجی بازه و محاسبه‌ی «اگر الان ثبت شود چه می‌شود» با همان allocate واقعی (بدون نوشتن در دیتابیس) */
  private async outcome(
    client: PoolClient,
    unitId: string,
    startedAt: Date,
    endedAt: Date,
    opts: { manual?: boolean } = {},
  ): Promise<{ out: CleaningOutcome; svc: HousekeepingService; variantCode: string | undefined; quantity: number }> {
    const minutes = this.checkRange(startedAt, endedAt, !!opts.manual)

    const svc = await this.housekeeping(client)
    const quantity = cleaningQuantity(svc.unit_kind, minutes)!
    const shift = cleaningShift(startedAt)
    const { tariff, variantCode } = await this.tariffFor(client, svc.id, shift)

    const unit = await this.ent.unitFacts(client, unitId)
    const cat = await this.ent.catalog(client)
    const { tier } = resolveTier(cat.tiers, unit.area)
    const included = tier ? cat.quotas[svc.id]?.[tier.id] ?? 0 : 0

    // رویدادهای فعال همین پنجره‌ی سهمیه + نظافتِ فرضی ⇒ همان allocate که بعد از ثبت اجرا می‌شود
    const key = quotaKey(svc.period_type, tehranPeriod(startedAt))
    const rows = await client.query<{ id: string; occurred_at: string; period: string; quantity: number; counts: boolean; price: number; step: number }>(
      `SELECT id, occurred_at, period, quantity::float8 AS quantity, counts_toward_quota AS counts, unit_price::float8 AS price, step::float8 AS step
         FROM entitlement.usage_events WHERE unit_id = $1 AND service_id = $2 AND status = 'active'`, [unitId, svc.id])
    const PREVIEW_ID = '~preview'
    const list: AllocEvent[] = rows.rows
      .filter((r) => quotaKey(svc.period_type, r.period) === key)
      .map((r) => ({ id: r.id, occurred_at: r.occurred_at, quantity: r.quantity, counts_toward_quota: r.counts, unit_price: r.price, step: r.step }))
    list.push({ id: PREVIEW_ID, occurred_at: startedAt, quantity, counts_toward_quota: tariff?.counts_toward_quota ?? true, unit_price: tariff?.unit_price ?? 0, step: tariff?.step ?? 1 })
    const mine = allocate(included, list).find((a) => a.id === PREVIEW_ID)!
    const counted = list.filter((e) => e.counts_toward_quota).reduce((n, e) => n + e.quantity, 0)

    return {
      svc,
      variantCode,
      quantity,
      out: {
        minutes,
        duration_label: durationLabel(minutes),
        quantity,
        unit_label: svc.unit_label,
        shift,
        shift_label: SHIFT_LABEL[shift],
        tariff_title: tariff?.title ?? null,
        free_qty: mine.quota_qty,
        overage_qty: mine.overage_qty,
        amount: mine.amount,
        included,
        remaining_after: round2(Math.max(0, included - counted)),
        no_tier: !tier,
        window_label: svc.period_type === 'year' ? `سال ${faDigits(key)}` : periodLabel(key),
      },
    }
  }

  async preview(client: PoolClient, input: { unitId: string; startedAt: Date; endedAt?: Date }): Promise<CleaningOutcome> {
    return (await this.outcome(client, input.unitId, input.startedAt, input.endedAt ?? new Date())).out
  }

  // ───────────────────────── صفحه‌ی اصلی و واحدها ─────────────────────────

  async home(client: PoolClient, user: JwtPayload) {
    const svcRow = await client.query<{ unit_kind: string; unit_label: string }>(
      `SELECT unit_kind, unit_label FROM entitlement.services WHERE code = $1 AND is_active`, [HOUSEKEEPING_CODE])
    const configured = !!svcRow.rows[0] && ['hours', 'minutes'].includes(svcRow.rows[0].unit_kind)

    const active = await client.query<SessionDb>(`${SESSION_SELECT} WHERE s.cleaner_id = $1 AND s.status = 'running' LIMIT 1`, [user.sub])

    const recent = await client.query(
      `SELECT u.id, u.unit_number, u.floor, u.area_sqm::float8 AS area
         FROM entitlement.cleaning_sessions s JOIN property.units u ON u.id = s.unit_id
        WHERE s.cleaner_id = $1 AND s.status IN ('done', 'running')
        GROUP BY u.id ORDER BY max(s.started_at) DESC LIMIT 6`, [user.sub])

    const period = tehranPeriod()
    const month = await client.query<{ sessions: number; minutes: number; amount: number }>(
      `SELECT count(*)::int AS sessions,
              COALESCE(round(sum(extract(epoch FROM (s.ended_at - s.started_at)) / 60)), 0)::int AS minutes,
              COALESCE(sum(e.amount), 0)::float8 AS amount
         FROM entitlement.cleaning_sessions s JOIN entitlement.usage_events e ON e.id = s.usage_event_id
        WHERE s.cleaner_id = $1 AND s.status = 'done' AND e.status = 'active' AND e.period = $2`, [user.sub, period])

    return {
      service: { configured, unit_label: svcRow.rows[0]?.unit_label ?? 'ساعت' },
      active: active.rows[0] ? withVoid(active.rows[0]) : null,
      recent_units: recent.rows,
      month: { period_label: periodLabel(period), sessions: month.rows[0].sessions, minutes: month.rows[0].minutes, overage_amount: Math.round(month.rows[0].amount) },
    }
  }

  async units(client: PoolClient, q: string) {
    const term = faToEn((q ?? '').trim()).replace(/[%_\\]/g, '').slice(0, 20)
    const r = await client.query(
      `SELECT u.id, u.unit_number, u.floor, u.area_sqm::float8 AS area FROM property.units u
        WHERE ($1 = '' OR u.unit_number ILIKE $1 || '%') ORDER BY length(u.unit_number), u.unit_number LIMIT 20`, [term])
    return r.rows
  }

  /** وضعیتِ سهمیه‌ی ساعتِ یک واحد (برای کارت «چقدر مانده») */
  async unitInfo(client: PoolClient, unitId: string) {
    const sum = await this.ent.summary(client, unitId)
    const line = sum.services.find((s) => s.code === HOUSEKEEPING_CODE) ?? null
    return { unit: sum.unit, tier: sum.tier, tier_match: sum.tier_match, line }
  }

  // ───────────────────────── شروع، پایان، لغو ─────────────────────────

  async sessionById(client: PoolClient, id: string): Promise<CleaningSession> {
    const r = await client.query<SessionDb>(`${SESSION_SELECT} WHERE s.id = $1`, [id])
    if (!r.rows[0]) throw new NotFoundException('نظافت یافت نشد')
    return withVoid(r.rows[0])
  }

  async start(client: PoolClient, user: JwtPayload, unitId: string): Promise<CleaningSession> {
    await this.housekeeping(client)
    await this.ent.unitFacts(client, unitId)
    const running = await client.query<{ unit_number: string }>(
      `SELECT u.unit_number FROM entitlement.cleaning_sessions s JOIN property.units u ON u.id = s.unit_id
        WHERE s.cleaner_id = $1 AND s.status = 'running'`, [user.sub])
    if (running.rows[0]) throw new ConflictException(`نظافت واحد ${faDigits(running.rows[0].unit_number)} هنوز در جریان است؛ اول آن را پایان دهید`)
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO entitlement.cleaning_sessions (tenant_id, unit_id, cleaner_id, started_at, entry)
         VALUES ($1, $2, $3, now(), 'timer') RETURNING id`, [user.tenant_id, unitId, user.sub])
      return this.sessionById(client, ins.rows[0].id)
    } catch (e) {
      if ((e as { code?: string })?.code === '23505') throw new ConflictException('یک نظافت دیگر هم‌اکنون در جریان است')
      throw e
    }
  }

  async finish(client: PoolClient, user: JwtPayload, id: string, input: { endedAt?: Date; note?: string }) {
    const cur = await client.query<{ unit_id: string; started_at: string; status: string }>(
      `SELECT unit_id, started_at, status FROM entitlement.cleaning_sessions WHERE id = $1 AND cleaner_id = $2 FOR UPDATE`, [id, user.sub])
    const s = cur.rows[0]
    if (!s) throw new NotFoundException('نظافت یافت نشد')
    if (s.status !== 'running') throw new ConflictException('این نظافت قبلاً پایان یافته یا لغو شده است')
    return this.commit(client, user, { unitId: s.unit_id, startedAt: new Date(s.started_at), endedAt: input.endedAt ?? new Date(), note: input.note, entry: 'timer', sessionId: id })
  }

  async manual(client: PoolClient, user: JwtPayload, input: { unitId: string; startedAt: Date; endedAt: Date; note?: string }) {
    this.checkRange(input.startedAt, input.endedAt, true) // پیش از هر کوئری: بازه‌ی نامعتبر خطای فارسیِ روشن می‌گیرد
    const overlap = await client.query<{ unit_number: string }>(
      `SELECT u.unit_number FROM entitlement.cleaning_sessions s JOIN property.units u ON u.id = s.unit_id
        WHERE s.cleaner_id = $1 AND s.status IN ('running', 'done')
          AND tstzrange(s.started_at, COALESCE(s.ended_at, 'infinity'::timestamptz)) && tstzrange($2::timestamptz, $3::timestamptz)
        LIMIT 1`, [user.sub, input.startedAt, input.endedAt])
    if (overlap.rows[0]) throw new ConflictException(`این بازه با نظافت واحد ${faDigits(overlap.rows[0].unit_number)} که قبلاً ثبت کرده‌اید هم‌پوشانی دارد`)
    return this.commit(client, user, { ...input, entry: 'manual' })
  }

  async cancel(client: PoolClient, user: JwtPayload, id: string): Promise<CleaningSession> {
    const r = await client.query<{ status: string }>(
      `SELECT status FROM entitlement.cleaning_sessions WHERE id = $1 AND cleaner_id = $2 FOR UPDATE`, [id, user.sub])
    if (!r.rows[0]) throw new NotFoundException('نظافت یافت نشد')
    if (r.rows[0].status !== 'running') throw new ConflictException('فقط نظافتِ در جریان قابل لغو است؛ برای نظافت ثبت‌شده از «ابطال» استفاده کنید')
    await client.query(`UPDATE entitlement.cleaning_sessions SET status = 'cancelled' WHERE id = $1`, [id])
    return this.sessionById(client, id)
  }

  /** ثبت مصرف در موتور آفرها + بستن جلسه + اعلان به ساکن (مشترکِ پایان تایمر و ثبت دستی) */
  private async commit(
    client: PoolClient,
    user: JwtPayload,
    a: { unitId: string; startedAt: Date; endedAt: Date; note?: string; entry: 'timer' | 'manual'; sessionId?: string },
  ): Promise<{ session: CleaningSession; result: CleaningOutcome }> {
    const { svc, variantCode, quantity } = await this.outcome(client, a.unitId, a.startedAt, a.endedAt, { manual: a.entry === 'manual' })
    const userNote = a.note?.trim().slice(0, 120) || null
    const eventNote = `نظافت ${clock(a.startedAt)} تا ${clock(a.endedAt)}${userNote ? ` · ${userNote}` : ''}`

    const ev: EventRow = await this.ent.record(client, user, {
      unitId: a.unitId, serviceCode: HOUSEKEEPING_CODE, variantCode, quantity, note: eventNote, source: 'cleaner', occurredAt: a.startedAt, silent: true,
    })

    let sessionId = a.sessionId
    if (sessionId) {
      await client.query(
        `UPDATE entitlement.cleaning_sessions SET status = 'done', ended_at = $2, usage_event_id = $3, note = $4 WHERE id = $1`,
        [sessionId, a.endedAt, ev.id, userNote])
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO entitlement.cleaning_sessions (tenant_id, unit_id, cleaner_id, started_at, ended_at, status, entry, note, usage_event_id)
         VALUES ($1, $2, $3, $4, $5, 'done', 'manual', $6, $7) RETURNING id`,
        [user.tenant_id, a.unitId, user.sub, a.startedAt, a.endedAt, userNote, ev.id])
      sessionId = ins.rows[0].id
    }

    // نتیجه‌ی «واقعی» بعد از ثبت (recompute انجام شده): سهم رایگان/مازاد/مبلغ از خودِ رویداد خوانده می‌شود
    const { out } = await this.outcomeAfter(client, a, svc, ev)
    await this.notifyResidents(client, user, a.unitId, ev, out, svc.unit_label)
    return { session: await this.sessionById(client, sessionId), result: out }
  }

  /** همان بازه را دوباره محاسبه نمی‌کنیم (رویداد الان در پنجره هست)؛ ارقام را از رویداد ثبت‌شده می‌خوانیم */
  private async outcomeAfter(client: PoolClient, a: { unitId: string; startedAt: Date; endedAt: Date }, svc: HousekeepingService, ev: EventRow) {
    const minutes = minutesBetween(a.startedAt, a.endedAt)
    const sum = await this.ent.summary(client, a.unitId, a.startedAt)
    const line = sum.services.find((s) => s.code === HOUSEKEEPING_CODE)
    const shift = cleaningShift(a.startedAt)
    const out: CleaningOutcome = {
      minutes,
      duration_label: durationLabel(minutes),
      quantity: ev.quantity,
      unit_label: svc.unit_label,
      shift,
      shift_label: SHIFT_LABEL[shift],
      tariff_title: ev.tariff_title,
      free_qty: ev.quota_qty,
      overage_qty: ev.overage_qty,
      amount: ev.amount,
      included: line?.included ?? 0,
      remaining_after: line?.remaining ?? 0,
      no_tier: line?.included === null || line?.included === undefined,
      window_label: line?.window_label ?? '',
    }
    return { out }
  }

  private async notifyResidents(client: PoolClient, user: JwtPayload, unitId: string, ev: EventRow, out: CleaningOutcome, unitLabel: string) {
    const body =
      ev.amount > 0
        ? `${out.duration_label} — ${faDigits(ev.overage_qty)} ${unitLabel} از سهمیه فراتر رفت؛ ${faMoney(ev.amount)} تومان به شارژ ماه بعد اضافه می‌شود`
        : `${out.duration_label} — از سهمیه‌ی رایگان کم شد (${faDigits(out.remaining_after)} ${unitLabel} باقی‌مانده)`
    await notify(client, user.tenant_id!, await unitRecipients(client, unitId), {
      kind: 'entitlement_cleaning',
      title: 'نظافت منزل انجام شد',
      body,
      link: '/resident/offers',
      ref: ev.id,
    })
  }

  // ───────────────────────── تاریخچه و ابطال ─────────────────────────

  async mine(client: PoolClient, user: JwtPayload, limit = 30): Promise<CleaningSession[]> {
    const r = await client.query<SessionDb>(
      `${SESSION_SELECT} WHERE s.cleaner_id = $1 AND s.status IN ('running', 'done', 'void') ORDER BY s.started_at DESC LIMIT $2`,
      [user.sub, Math.min(Math.max(limit, 1), 100)])
    return r.rows.map(withVoid)
  }

  /** ابطال نظافتِ ثبت‌شده: نظافتچی تا ۲۴ ساعت و فقط اگر هنوز به شارژ نرفته؛ مدیر همیشه (تا قبل از شارژ) */
  async voidSession(client: PoolClient, user: JwtPayload, id: string): Promise<CleaningSession> {
    const r = await client.query<{ status: string; ended_at: string | null; usage_event_id: string | null; billed: boolean; cleaner_id: string }>(
      `SELECT s.status, s.ended_at, s.usage_event_id, s.cleaner_id, COALESCE(e.billed_charge_id IS NOT NULL, false) AS billed
         FROM entitlement.cleaning_sessions s LEFT JOIN entitlement.usage_events e ON e.id = s.usage_event_id
        WHERE s.id = $1 FOR UPDATE OF s`, [id])
    const s = r.rows[0]
    if (!s) throw new NotFoundException('نظافت یافت نشد')
    if (user.role !== 'admin' && s.cleaner_id !== user.sub) throw new NotFoundException('نظافت یافت نشد')
    if (s.status !== 'done' || !s.usage_event_id) throw new ConflictException('فقط نظافتِ ثبت‌شده قابل ابطال است')
    if (s.billed) throw new ConflictException('این نظافت قبلاً به شارژ واحد اضافه شده؛ اصلاح آن با حسابدار است')
    if (user.role !== 'admin' && (!s.ended_at || Date.now() - new Date(s.ended_at).getTime() > VOID_WINDOW_MS)) {
      throw new ForbiddenException('فقط تا ۲۴ ساعت بعد از ثبت می‌توانید آن را باطل کنید؛ بعد از آن با مدیر هماهنگ کنید')
    }
    await this.ent.voidEvent(client, user, s.usage_event_id, 'ابطال نظافت توسط ثبت‌کننده')
    await client.query(`UPDATE entitlement.cleaning_sessions SET status = 'void' WHERE id = $1`, [id])
    return this.sessionById(client, id)
  }
}
