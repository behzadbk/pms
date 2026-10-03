import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'crypto'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { RequestCtx, notify, writeAudit } from './context'
import {
  MEMBERSHIP_COLS,
  MembershipRow,
  getMembershipOr404,
  getUnitOr404,
  issueInvite,
  liveHead,
  revokeSessions,
  upsertPerson,
} from './residency.repo'
import { displayPhone, normalizePhone } from './phone'
import { ensureLogin, resetToUnitPassword } from './credentials'
import { formatJalali } from './jalali'
import { RESIDENCY_LABEL, ROLE_LABEL, ageFromBirthYear, fa } from './residents.constants'
import type { AddResidentDto, InviteDto, UpdateMembershipDto } from './dto/residents.dto'

export type Tone = 'pri' | 'ok' | 'warn' | 'bad' | 'acc' | 'mute'
export interface Badge {
  t: string
  tone: Tone
}

export type UnitFilter = 'all' | 'owner' | 'tenant' | 'pending' | 'vacant'

interface UnitListRow {
  id: string
  unit_number: string
  floor: number | null
  occupancy: string
  owner_name: string | null
  head_name: string | null
  head_status: string | null
  head_residency: string | null
  head_end_date: string | null
  live_count: number
  child_count: number
  senior_easy: number
  invited_members: number
  new_members: number
  pending_count: number
  pending_name: string | null
  move_out_date: string | null
}

const today = () => new Date().toISOString().slice(0, 10)

/** دسته‌ی واحد در فهرست ساکنین (فیلترهای «همه / مالک / مستأجر / در انتظار / خالی») */
function categoryOf(r: UnitListRow): Exclude<UnitFilter, 'all'> {
  if (r.occupancy === 'vacant') return r.pending_count > 0 ? 'pending' : 'vacant'
  return r.occupancy === 'tenant' ? 'tenant' : 'owner'
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso + 'T00:00:00Z').getTime() - new Date(today() + 'T00:00:00Z').getTime()) / 86_400_000)
}

/** برچسب‌های هر واحد — متن‌ها عیناً از فایل طراحی */
export function unitBadges(r: UnitListRow): Badge[] {
  const out: Badge[] = []
  const cat = categoryOf(r)
  if (cat === 'pending') return [{ t: 'در انتظار تأیید', tone: 'warn' }]
  if (cat === 'vacant') return out
  if (r.child_count > 0) out.push({ t: `کودک ${fa(r.child_count)}`, tone: 'pri' })
  if (r.head_status === 'invited') out.push({ t: 'دعوت ارسال شد', tone: 'warn' })
  else if (r.invited_members > 0) out.push({ t: 'دعوت در انتظار', tone: 'warn' })
  if (r.senior_easy > 0) out.push({ t: 'سالمند · حالت ساده', tone: 'mute' })
  if (r.head_residency === 'tenant' && r.head_end_date) {
    const d = daysUntil(r.head_end_date)
    if (d >= 0 && d <= 30) out.push({ t: `پایان قرارداد تا ${fa(d)} روز`, tone: 'bad' })
  }
  if (r.move_out_date) out.push({ t: `تخلیه ${formatJalali(r.move_out_date, false)}`, tone: 'bad' })
  if (r.new_members > 0 && r.head_status === 'active') out.push({ t: 'تازه عضو شد', tone: 'ok' })
  return out
}

function unitMeta(r: UnitListRow): string {
  const cat = categoryOf(r)
  if (cat === 'pending') return 'ثبت‌نام از QR لابی'
  if (cat === 'vacant') return r.owner_name ? `مالک: ${r.owner_name}` : 'بدون مالک ثبت‌شده'
  const label = cat === 'tenant' ? RESIDENCY_LABEL.tenant : RESIDENCY_LABEL.owner
  return `${label} · ${fa(r.live_count)} نفر`
}

@Injectable()
export class ManagerService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  /* ───────────── A1 · فهرست ساکنین ───────────── */

  async listUnits(tenantId: string, filter: UnitFilter = 'all', q = '') {
    return this.db.withTenant(tenantId, async (client) => {
      const res = await client.query<UnitListRow>(
        `SELECT u.id, u.unit_number, u.floor, u.occupancy,
                o.name AS owner_name,
                hu.name AS head_name, h.status AS head_status, h.residency AS head_residency,
                to_char(h.end_date, 'YYYY-MM-DD') AS head_end_date,
                (SELECT count(*)::int FROM residency.memberships m
                  WHERE m.unit_id = u.id AND m.status IN ('invited','active') AND m.role <> 'owner_absent') AS live_count,
                (SELECT count(*)::int FROM residency.memberships m
                  WHERE m.unit_id = u.id AND m.status IN ('invited','active') AND m.role = 'child') AS child_count,
                (SELECT count(*)::int FROM residency.memberships m
                  WHERE m.unit_id = u.id AND m.status = 'active' AND m.role = 'senior'
                    AND COALESCE((m.settings->>'easy_mode')::boolean, false)) AS senior_easy,
                (SELECT count(*)::int FROM residency.memberships m
                  WHERE m.unit_id = u.id AND m.status = 'invited' AND m.role <> 'head') AS invited_members,
                (SELECT count(*)::int FROM residency.memberships m
                  WHERE m.unit_id = u.id AND m.status = 'active' AND m.channel = 'qr_lobby'
                    AND m.updated_at > now() - interval '3 days') AS new_members,
                (SELECT count(*)::int FROM residency.memberships m
                  WHERE m.unit_id = u.id AND m.status = 'pending_approval') AS pending_count,
                (SELECT pu.name FROM residency.memberships m JOIN residency.users pu ON pu.id = m.user_id
                  WHERE m.unit_id = u.id AND m.status = 'pending_approval' ORDER BY m.created_at LIMIT 1) AS pending_name,
                (SELECT to_char(mo.move_out_date, 'YYYY-MM-DD') FROM residency.move_outs mo
                  WHERE mo.unit_id = u.id AND mo.status = 'scheduled') AS move_out_date
           FROM property.units u
           LEFT JOIN residency.users o ON o.id = u.owner_user_id
           LEFT JOIN residency.memberships h ON h.unit_id = u.id AND h.role = 'head' AND h.status IN ('invited','active')
           LEFT JOIN residency.users hu ON hu.id = h.user_id
          ORDER BY u.floor DESC NULLS LAST, length(u.unit_number) DESC, u.unit_number DESC`,
      )

      // جست‌وجو: نام، موبایل یا شماره واحد (روی همه‌ی اعضای زنده، نه فقط سرپرست)
      let matchIds: Set<string> | null = null
      const term = q.trim()
      if (term) {
        const phone = normalizePhone(term)
        const digits = term.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        const m = await client.query<{ unit_id: string }>(
          `SELECT DISTINCT m.unit_id FROM residency.memberships m JOIN residency.users p ON p.id = m.user_id
            WHERE m.status <> 'ended' AND (p.name ILIKE '%' || $1 || '%' OR ($2::text IS NOT NULL AND p.phone = $2)
                  OR p.phone LIKE '%' || $3 || '%')
           UNION
           SELECT id FROM property.units WHERE unit_number = $3 OR unit_number LIKE $3 || '%'`,
          [term, phone, digits.replace(/\D/g, '') || '#'],
        )
        matchIds = new Set(m.rows.map((r) => r.unit_id))
      }

      const all = res.rows.map((r) => {
        const category = categoryOf(r)
        return {
          id: r.id,
          no: r.unit_number,
          floor: r.floor,
          category,
          occupancy: r.occupancy,
          name: category === 'pending' ? r.pending_name : category === 'vacant' ? null : r.head_name,
          meta: unitMeta(r),
          member_count: r.live_count,
          badges: unitBadges(r),
        }
      })
      const counts = { all: all.length, owner: 0, tenant: 0, pending: 0, vacant: 0 }
      for (const u of all) counts[u.category]++
      const units = all.filter((u) => (filter === 'all' || u.category === filter) && (!matchIds || matchIds.has(u.id)))
      const building = await client.query<{ name: string }>(`SELECT name FROM identity.tenants WHERE id = $1`, [tenantId])
      return { building: { id: tenantId, name: building.rows[0]?.name ?? '' }, counts, units }
    })
  }

  /* ───────────── A4 · پرونده‌ی واحد ───────────── */

  async getUnit(tenantId: string, unitId: string) {
    return this.db.withTenant(tenantId, (client) => this.unitFile(client, unitId))
  }

  private async unitFile(client: PoolClient, unitId: string) {
    const u = await getUnitOr404(client, unitId)
    const owner = u.owner_user_id
      ? (await client.query(`SELECT id, name, phone FROM residency.users WHERE id = $1`, [u.owner_user_id])).rows[0]
      : null
    const members = await client.query<MembershipRow & { name: string; phone: string | null; birth_year: number | null; national_id: string | null }>(
      `SELECT ${MEMBERSHIP_COLS}, p.name, p.phone, p.birth_year, p.national_id
         FROM residency.memberships m JOIN residency.users p ON p.id = m.user_id
        WHERE m.unit_id = $1 AND m.status <> 'ended'
        ORDER BY (m.role = 'head') DESC, m.role = 'owner_absent', m.created_at`,
      [unitId],
    )
    const moveOut = await client.query(
      `SELECT id, to_char(move_out_date,'YYYY-MM-DD') AS date, status FROM residency.move_outs
        WHERE unit_id = $1 AND status = 'scheduled'`,
      [unitId],
    )
    const head = members.rows.find((m) => m.role === 'head' && ['invited', 'active'].includes(m.status))
    const live = members.rows.filter((m) => ['invited', 'active'].includes(m.status) && m.role !== 'owner_absent')
    return {
      id: u.id,
      no: u.unit_number,
      floor: u.floor,
      area: u.area_sqm === null ? null : Number(u.area_sqm),
      parking_count: u.parking_count,
      storage_no: u.storage_no,
      occupancy: u.occupancy,
      owner: owner ? { id: owner.id, name: owner.name, phone: displayPhone(owner.phone), absent: !live.some((m) => m.user_id === owner.id) } : null,
      head: head
        ? { membership_id: head.id, name: head.name, residency: head.residency, start_date: head.start_date, end_date: head.end_date, pays_charge: head.pays_charge }
        : null,
      resident_count: live.length,
      scheduled_move_out: moveOut.rows[0] ?? null,
      members: members.rows.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        name: m.name,
        phone: displayPhone(m.phone),
        national_id: m.national_id,
        role: m.role,
        role_label: m.title && m.role !== 'head' ? m.title : ROLE_LABEL[m.role],
        residency: m.residency,
        status: m.status,
        pays_charge: m.pays_charge,
        start_date: m.start_date,
        end_date: m.end_date,
        age: ageFromBirthYear(m.birth_year),
        settings: m.settings,
      })),
      vehicles: [] as { plate: string }[],
    }
  }

  /* ───────────── A3 · ثبت ساکن ───────────── */

  async addResident(tenantId: string, unitId: string, dto: AddResidentDto, ctx: RequestCtx) {
    const out = await this.db.withTenant(tenantId, (client) => this.addResidentTx(client, tenantId, unitId, dto, ctx, 'manual'))
    return this.afterInvite(tenantId, out)
  }

  /** بدنه‌ی مشترک ثبت دستی و ورود از اکسل (هر ردیف اکسل در savepoint خودش) */
  async addResidentTx(client: PoolClient, tenantId: string, unitId: string, dto: AddResidentDto, ctx: RequestCtx | null, channel: 'manual' | 'excel') {
    const unit = await getUnitOr404(client, unitId)
    const person = await upsertPerson(client, { name: dto.name, phone: dto.phone, national_id: dto.national_id }, { requirePhone: true })
    const exists = await client.query(
      `SELECT 1 FROM residency.memberships WHERE unit_id = $1 AND user_id = $2 AND status <> 'ended'`,
      [unitId, person.id],
    )
    if (exists.rowCount) throw new ConflictException('این شخص قبلاً در همین واحد ثبت شده است')
    if (dto.residency === 'tenant' && dto.end_date && dto.start_date && dto.end_date < dto.start_date) {
      throw new BadRequestException('پایان قرارداد نمی‌تواند قبل از شروع سکونت باشد')
    }
    const sendSms = dto.send_sms !== false
    const status = sendSms ? 'invited' : 'active'

    let role: string
    let paysCharge: boolean
    if (dto.residency === 'owner_absent') {
      // مالک غیرساکن جزو ساکنین نیست؛ مالک قبلی (اگر فرد دیگری بود) کنار می‌رود
      role = 'owner_absent'
      paysCharge = dto.pays_charge ?? unit.occupancy !== 'tenant'
      await client.query(
        `UPDATE residency.memberships SET status = 'ended', ended_at = now(), end_date = GREATEST(start_date, CURRENT_DATE), updated_at = now()
          WHERE unit_id = $1 AND role = 'owner_absent' AND status <> 'ended' AND user_id <> $2`,
        [unitId, person.id],
      )
      await client.query(`UPDATE property.units SET owner_user_id = $2 WHERE id = $1`, [unitId, person.id])
    } else {
      const head = await liveHead(client, unitId)
      role = dto.role ?? (head ? 'adult' : 'head')
      if (role === 'head' && head) {
        throw new ConflictException(`این واحد سرپرست دارد (${head.name})؛ برای تغییر سرپرست از پرونده‌ی واحد استفاده کنید`)
      }
      paysCharge = dto.pays_charge ?? (role === 'head')
      if (dto.residency === 'owner') {
        await client.query(`UPDATE property.units SET owner_user_id = $2 WHERE id = $1`, [unitId, person.id])
      }
    }

    const res = await client.query<{ id: string }>(
      `INSERT INTO residency.memberships
         (tenant_id, user_id, unit_id, role, residency, pays_charge, start_date, end_date, status, invited_by, channel, title)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        tenantId, person.id, unitId, role, dto.residency, paysCharge, dto.start_date ?? null,
        dto.residency === 'owner_absent' ? null : dto.end_date ?? null,
        status, ctx?.user?.sub ?? null, channel, role === 'head' ? ROLE_LABEL.head : null,
      ],
    )
    const membershipId = res.rows[0].id
    const invite = sendSms ? await issueInvite(client, tenantId, membershipId, channel === 'excel' ? 'excel' : 'sms') : null

    // مالک از ثبت مستأجر مطلع می‌شود (RESIDENTS.md §2)
    const ownerId = (await client.query<{ owner_user_id: string | null }>(`SELECT owner_user_id FROM property.units WHERE id = $1`, [unitId])).rows[0]?.owner_user_id
    if (dto.residency === 'tenant' && ownerId && ownerId !== person.id) {
      await notify(client, tenantId, { person: ownerId }, {
        kind: 'tenant_added',
        title: `مستأجر جدید برای واحد ${fa(unit.unit_number)} ثبت شد`,
        body: `${person.name}${dto.end_date ? ' · پایان قرارداد ' + dto.end_date : ''}`,
        ref: membershipId,
      })
    }
    await writeAudit(client, tenantId, ctx, 'membership.created', {
      summary: `${person.name} به‌عنوان ${ROLE_LABEL[role]} (${RESIDENCY_LABEL[dto.residency]}) در واحد ${unit.unit_number} ثبت شد`,
      subject_user_id: person.id,
      membership_id: membershipId,
      unit_id: unitId,
      after: { role, residency: dto.residency, status, pays_charge: paysCharge, channel },
    })
    // حساب ورود: نام کاربری = موبایل، رمز اولیه = شماره واحد (ساکن از «تنظیمات» عوضش می‌کند)
    const credentials = await ensureLogin(client, tenantId, person, unit.unit_number)
    return {
      membership_id: membershipId,
      user_id: person.id,
      credentials,
      role,
      status,
      invite: invite ? { id: invite.id, expires_at: invite.expires_at } : null,
      _token: invite?.token ?? null,
      phone: person.phone,
      unit: { id: unitId, no: unit.unit_number },
    }
  }

  /**
   * ارسال پیامک دعوت از مسیر notification-svc (بعد از COMMIT). توکن فقط در پیامک می‌رود و
   * در پاسخ API به مدیر برنمی‌گردد — وگرنه مدیر می‌توانست به‌جای ساکن حساب بسازد.
   */
  afterInvite<T extends { _token: string | null; phone: string | null; membership_id: string }>(tenantId: string, out: T): Omit<T, '_token'> {
    const token = out._token
    const rest: Partial<T> = { ...out }
    delete rest._token
    if (token && out.phone) {
      this.events.publish('invite.sent', { tenantId, phone: out.phone, membershipId: out.membership_id, token, channel: 'sms' }, tenantId)
    }
    return rest as Omit<T, '_token'>
  }

  /** بازنشانی رمز ساکن به شماره‌ی واحد (مدیر) — ساکن باید در اولین ورود عوضش کند */
  async resetPassword(tenantId: string, membershipId: string, ctx: RequestCtx) {
    return this.db.withTenant(tenantId, async (client) => {
      const m = await getMembershipOr404(client, membershipId)
      const unit = await getUnitOr404(client, m.unit_id)
      const person = (await client.query<{ id: string; name: string; phone: string | null }>(`SELECT id, name, phone FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
      let creds = await resetToUnitPassword(client, tenantId, person.id, unit.unit_number)
      if (!creds) {
        const c = await ensureLogin(client, tenantId, person, unit.unit_number)
        creds = c?.password ? { username: c.username, password: c.password } : null
      }
      if (!creds) throw new BadRequestException('برای این شخص شماره موبایل ثبت نشده یا نام کاربری آن برای حساب دیگری است')
      await writeAudit(client, tenantId, ctx, 'password.reset', { summary: `رمز ${person.name} به شماره‌ی واحد ${unit.unit_number} بازنشانی شد`, subject_user_id: person.id, membership_id: membershipId, unit_id: m.unit_id })
      return creds
    })
  }

  /* ───────────── ویرایش عضویت ───────────── */

  async updateMembership(tenantId: string, id: string, dto: UpdateMembershipDto, ctx: RequestCtx) {
    return this.db.withTenant(tenantId, async (client) => {
      const before = await getMembershipOr404(client, id)
      const person = (await client.query(`SELECT id, name, phone, national_id FROM residency.users WHERE id = $1`, [before.user_id])).rows[0]

      // اطلاعات شخص
      if (dto.phone !== undefined || dto.name !== undefined || dto.national_id !== undefined) {
        const phone = dto.phone === undefined ? person.phone : normalizePhone(dto.phone)
        if (dto.phone && !phone) throw new BadRequestException('شماره موبایل نامعتبر است')
        if (phone && phone !== person.phone) {
          const other = await client.query(`SELECT 1 FROM residency.users WHERE phone = $1 AND id <> $2`, [phone, person.id])
          if (other.rowCount) throw new ConflictException('این شماره متعلق به حساب دیگری است؛ از پرونده‌ی شخص (سوپرادمین) ادغام کنید')
        }
        await client.query(
          `UPDATE residency.users SET name = COALESCE($2, name), phone = $3, national_id = COALESCE($4, national_id), updated_at = now() WHERE id = $1`,
          [person.id, dto.name?.trim() || null, phone, dto.national_id ? dto.national_id.replace(/\D/g, '') : null],
        )
      }

      // واگذاری سرپرستی: ارتقای یک عضو به سرپرست، سرپرست فعلی را بزرگسال می‌کند (در همین تراکنش)
      if (dto.role === 'head' && before.role !== 'head') {
        await client.query(
          `UPDATE residency.memberships SET role = 'adult', title = NULLIF(title, 'سرپرست خانوار'), updated_at = now()
            WHERE unit_id = $1 AND role = 'head' AND status IN ('invited','active') AND id <> $2`,
          [before.unit_id, id],
        )
      }
      const residency = dto.role === 'owner_absent' ? 'owner_absent' : dto.residency ?? (before.role === 'owner_absent' && dto.role ? 'owner' : before.residency)
      const role = dto.residency === 'owner_absent' ? 'owner_absent' : dto.role ?? before.role
      const endDate = dto.end_date === undefined ? before.end_date : dto.end_date
      const ending = dto.status === 'ended' && before.status !== 'ended'

      await client.query(
        `UPDATE residency.memberships
            SET role = $2, residency = $3, pays_charge = COALESCE($4, pays_charge),
                start_date = COALESCE($5::date, start_date), end_date = $6::date,
                status = COALESCE($7, status), title = COALESCE($8, title),
                settings = settings || COALESCE($9::jsonb, '{}'::jsonb),
                ended_at = CASE WHEN $10 THEN now() ELSE ended_at END,
                updated_at = now()
          WHERE id = $1`,
        [
          id, role, residency, dto.pays_charge ?? null, dto.start_date ?? null,
          ending ? endDate ?? today() : endDate, dto.status ?? null,
          role === 'head' ? ROLE_LABEL.head : dto.title ?? null,
          dto.settings ? JSON.stringify(dto.settings) : null, ending,
        ],
      )
      if (residency === 'owner' || role === 'owner_absent') {
        await client.query(`UPDATE property.units SET owner_user_id = $2 WHERE id = $1`, [before.unit_id, before.user_id])
      }
      if (ending) await revokeSessions(client, [before.user_id])

      const after = await getMembershipOr404(client, id)
      await writeAudit(client, tenantId, ctx, 'membership.updated', {
        summary: `${dto.name ?? person.name}: ${describeChange(before, after)}`,
        subject_user_id: before.user_id,
        membership_id: id,
        unit_id: before.unit_id,
        before: pick(before),
        after: pick(after),
      })
      return this.unitFile(client, before.unit_id)
    })
  }

  /* ───────────── دعوت ───────────── */

  async invite(tenantId: string, unitId: string, dto: InviteDto, ctx: RequestCtx) {
    const out = await this.db.withTenant(tenantId, async (client) => {
      const unit = await getUnitOr404(client, unitId)
      const phone = normalizePhone(dto.phone)
      if (!phone) throw new BadRequestException('شماره موبایل نامعتبر است')
      const person = await upsertPerson(client, { phone, name: 'دعوت‌شده' })
      const existing = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM residency.memberships WHERE unit_id = $1 AND user_id = $2 AND status <> 'ended'`,
        [unitId, person.id],
      )
      let membershipId: string
      let resent = false
      if (existing.rows[0]) {
        if (existing.rows[0].status !== 'invited') throw new ConflictException('این شخص قبلاً عضو همین واحد است')
        membershipId = existing.rows[0].id
        resent = true
      } else {
        const head = await liveHead(client, unitId)
        const ins = await client.query<{ id: string }>(
          `INSERT INTO residency.memberships (tenant_id, user_id, unit_id, role, residency, pays_charge, status, invited_by, channel, title)
           VALUES ($1, $2, $3, $4, $5, $6, 'invited', $7, 'sms', $8) RETURNING id`,
          [tenantId, person.id, unitId, head ? 'adult' : 'head', dto.residency ?? 'tenant', !head, ctx.user.sub, head ? null : ROLE_LABEL.head],
        )
        membershipId = ins.rows[0].id
      }
      const invite = await issueInvite(client, tenantId, membershipId, 'sms')
      await writeAudit(client, tenantId, ctx, resent ? 'invite.resent' : 'invite.created', {
        summary: `${resent ? 'ارسال دوباره‌ی' : 'ارسال'} لینک دعوت برای واحد ${unit.unit_number}`,
        subject_user_id: person.id,
        membership_id: membershipId,
        unit_id: unitId,
      })
      return { membership_id: membershipId, user_id: person.id, phone, resent, invite: { id: invite.id, expires_at: invite.expires_at }, _token: invite.token, status: 'invited' }
    })
    return this.afterInvite(tenantId, out)
  }

  async cancelInvite(tenantId: string, inviteId: string, ctx: RequestCtx) {
    return this.db.withTenant(tenantId, async (client) => {
      const inv = await client.query<{ membership_id: string }>(
        `UPDATE residency.invites SET revoked_at = now() WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL RETURNING membership_id`,
        [inviteId],
      )
      if (!inv.rows[0]) throw new NotFoundException('دعوت فعالی با این شناسه نیست')
      const m = await client.query<{ user_id: string; unit_id: string }>(
        `UPDATE residency.memberships SET status = 'ended', ended_at = now(), end_date = GREATEST(start_date, CURRENT_DATE), updated_at = now()
          WHERE id = $1 AND status = 'invited' RETURNING user_id, unit_id`,
        [inv.rows[0].membership_id],
      )
      await writeAudit(client, tenantId, ctx, 'invite.cancelled', {
        summary: 'لغو دعوت',
        membership_id: inv.rows[0].membership_id,
        subject_user_id: m.rows[0]?.user_id ?? null,
      })
      return { ok: true }
    })
  }

  /* ───────────── A6 · تخلیه ───────────── */

  async moveOutPreview(tenantId: string, unitId: string, date: string) {
    return this.db.withTenant(tenantId, async (client) => {
      await getUnitOr404(client, unitId)
      return { date, blockers: await this.blockers(client, unitId), affected: await this.affected(client, unitId) }
    })
  }

  /** موارد مانع تخلیه: بدهی شارژ، مرسوله‌ی تحویل‌نشده، رزرو فعال (مانع قطعی نیستند؛ هشدارند) */
  private async blockers(client: PoolClient, unitId: string) {
    const debt = await client.query<{ amount: string; count: string }>(
      `SELECT COALESCE(sum(total_amount), 0) AS amount, count(*) AS count FROM finance.monthly_charges
        WHERE unit_id = $1 AND status IN ('pending', 'overdue')`,
      [unitId],
    )
    const parcels = await client.query<{ count: string }>(
      `SELECT count(*) FROM guard.parcels WHERE unit_id = $1 AND status = 'pending_pickup'`,
      [unitId],
    )
    const reservations = await client.query<{ count: string }>(
      `SELECT count(*) FROM facility.reservations WHERE unit_id = $1 AND status IN ('pending','confirmed') AND end_at > now()`,
      [unitId],
    )
    return {
      debt: { amount: Number(debt.rows[0].amount), charges: Number(debt.rows[0].count) },
      parcels: Number(parcels.rows[0].count),
      reservations: Number(reservations.rows[0].count),
    }
  }

  private async affected(client: PoolClient, unitId: string) {
    const res = await client.query<{ id: string; user_id: string; name: string; role: string }>(
      `SELECT m.id, m.user_id, p.name, m.role FROM residency.memberships m JOIN residency.users p ON p.id = m.user_id
        WHERE m.unit_id = $1 AND m.status <> 'ended' AND m.role <> 'owner_absent'`,
      [unitId],
    )
    return res.rows
  }

  async moveOut(tenantId: string, unitId: string, date: string, confirm: boolean, ctx: RequestCtx) {
    return this.db.withTenant(tenantId, async (client) => {
      const unit = await getUnitOr404(client, unitId)
      const blockers = await this.blockers(client, unitId)
      const affected = await this.affected(client, unitId)
      if (!confirm) return { status: 'preview', date, blockers, affected }
      if (!affected.length) throw new ConflictException('این واحد ساکنی برای تخلیه ندارد')

      await client.query(`UPDATE residency.move_outs SET status = 'cancelled' WHERE unit_id = $1 AND status = 'scheduled'`, [unitId])
      const mo = await client.query<{ id: string }>(
        `INSERT INTO residency.move_outs (tenant_id, unit_id, move_out_date, blockers, requested_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tenantId, unitId, date, JSON.stringify(blockers), ctx.user.sub],
      )
      await writeAudit(client, tenantId, ctx, 'unit.move_out_scheduled', {
        summary: `تخلیه‌ی واحد ${unit.unit_number} برای ${date} ثبت شد`,
        unit_id: unitId,
        move_out_id: mo.rows[0].id,
        blockers,
        members: affected.map((a) => a.user_id),
      })
      let status: 'scheduled' | 'done' = 'scheduled'
      if (date <= today()) {
        await executeMoveOut(client, tenantId, mo.rows[0].id, ctx)
        status = 'done'
      }
      return { status, id: mo.rows[0].id, date, blockers, affected, unit: await this.unitFile(client, unitId) }
    })
  }
}

/**
 * اجرای تخلیه (قاعده ۶) — هم از مسیر API (تاریخ امروز/گذشته) و هم از housekeeping (تاریخ رسیده):
 * عضویت‌ها (به‌جز مالک) ended، نشست‌ها باطل، رزروهای آینده لغو، سوابق دست‌نخورده،
 * مالک مطلع، واحد با trigger خودکار «خالی» می‌شود.
 */
export async function executeMoveOut(client: PoolClient, tenantId: string, moveOutId: string, ctx: RequestCtx | null) {
  const mo = (
    await client.query<{ unit_id: string; move_out_date: string }>(
      `SELECT unit_id, to_char(move_out_date,'YYYY-MM-DD') AS move_out_date FROM residency.move_outs WHERE id = $1 AND status = 'scheduled' FOR UPDATE`,
      [moveOutId],
    )
  ).rows[0]
  if (!mo) return null
  const ended = await client.query<{ user_id: string }>(
    `UPDATE residency.memberships
        SET status = 'ended', ended_at = now(), end_date = GREATEST(start_date, $2::date), updated_at = now()
      WHERE unit_id = $1 AND status <> 'ended' AND role <> 'owner_absent'
      RETURNING user_id`,
    [mo.unit_id, mo.move_out_date],
  )
  const people = [...new Set(ended.rows.map((r) => r.user_id))]
  await revokeSessions(client, people)
  const cancelled = await client.query(
    `UPDATE facility.reservations SET status = 'cancelled' WHERE unit_id = $1 AND status IN ('pending','confirmed') AND start_at > now()`,
    [mo.unit_id],
  )
  await client.query(`UPDATE residency.move_outs SET status = 'done', executed_at = now() WHERE id = $1`, [moveOutId])
  const unit = (await client.query<{ unit_number: string; owner_user_id: string | null }>(
    `SELECT unit_number, owner_user_id FROM property.units WHERE id = $1`, [mo.unit_id])).rows[0]
  if (unit.owner_user_id && !people.includes(unit.owner_user_id)) {
    await notify(client, tenantId, { person: unit.owner_user_id }, {
      kind: 'unit_vacated',
      title: `واحد ${fa(unit.unit_number)} تخلیه شد`,
      body: 'دسترسی ساکنین قبلی قطع شد و واحد «خالی» است.',
      ref: mo.unit_id,
    })
  }
  await writeAudit(client, tenantId, ctx, 'unit.moved_out', {
    summary: `واحد ${unit.unit_number} تخلیه شد؛ دسترسی ${people.length} عضو قطع شد`,
    unit_id: mo.unit_id,
    move_out_id: moveOutId,
    ended_members: people,
    cancelled_reservations: cancelled.rowCount,
  })
  return { ended: people.length }
}

function pick(m: MembershipRow) {
  return { role: m.role, residency: m.residency, status: m.status, pays_charge: m.pays_charge, start_date: m.start_date, end_date: m.end_date }
}

function describeChange(a: MembershipRow, b: MembershipRow): string {
  const parts: string[] = []
  if (a.residency !== b.residency) parts.push(`نوع سکونت از «${RESIDENCY_LABEL[a.residency]}» به «${RESIDENCY_LABEL[b.residency]}» تغییر کرد`)
  if (a.role !== b.role) parts.push(`نقش از «${ROLE_LABEL[a.role]}» به «${ROLE_LABEL[b.role]}» تغییر کرد`)
  if (a.status !== b.status) parts.push(b.status === 'ended' ? 'عضویت پایان یافت' : `وضعیت «${b.status}» شد`)
  if (a.end_date !== b.end_date) parts.push(`تاریخ پایان ${b.end_date ?? 'حذف شد'}`)
  if (a.pays_charge !== b.pays_charge) parts.push(b.pays_charge ? 'پرداخت شارژ با این عضو' : 'پرداخت شارژ برداشته شد')
  return parts.join('؛ ') || 'اطلاعات ویرایش شد'
}

export function randomToken(bytes = 18) {
  return randomBytes(bytes).toString('base64url')
}
