import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'
import { RequestCtx, notify, writeAudit } from './context'
import {
  MEMBERSHIP_COLS,
  MembershipRow,
  childCredit,
  freshFamilyCode,
  getMembershipOr404,
  issueInvite,
  myMembership,
  personOf,
  revokeSessions,
  upsertPerson,
} from './residency.repo'
import { displayPhone } from './phone'
import {
  DEFAULT_QUIET_HOURS,
  MODULE_KEYS,
  ModuleMap,
  PRESETS,
  PresetKey,
  ROLE_LABEL,
  ageFromBirthYear,
  fa,
  faMoney,
  matchPreset,
  presetForAge,
} from './residents.constants'
import { listJoinRequests, rejectMembership } from './join.service'
import { formatJalali } from './jalali'
import { randomToken } from './manager.service'
import type { AddMemberDto, DecideChildRequestDto, ParentControlDto } from './dto/residents.dto'

const REQUEST_TITLE: Record<string, string> = {
  order: 'می‌خواهد سفارش بدهد',
  amenity: 'می‌خواهد رزرو کند',
  guest: 'کارت ورود مهمان می‌خواهد',
  ticket: 'می‌خواهد درخواست تعمیر ثبت کند',
}

/**
 * «خانوار من» — سرپرست اعضا را اضافه/حذف می‌کند، سرپرستی را واگذار می‌کند و حالت والدین را تنظیم می‌کند.
 * بقیه‌ی اعضا فهرست را فقط می‌بینند (C1 · read-only).
 */
@Injectable()
export class HouseholdService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  /** عضویت فعال کاربر جاری؛ بدون عضویت → 404 (ساکن قدیمی که هنوز به واحدی وصل نشده) */
  private async me(client: PoolClient, user: JwtPayload, unitId?: string | null) {
    const personId = await personOf(client, user)
    if (!personId) throw new NotFoundException('حساب شما هنوز به واحدی وصل نشده است')
    const m = await myMembership(client, personId, unitId)
    if (!m) throw new NotFoundException('عضویت فعالی در این ساختمان ندارید')
    return { personId, m }
  }

  private async requireHead(client: PoolClient, user: JwtPayload) {
    const me = await this.me(client, user)
    if (me.m.role !== 'head') throw new ForbiddenException('فقط سرپرست خانوار می‌تواند اعضا را تغییر دهد')
    return me
  }

  /** عضو باید در همین واحد باشد (RLS فقط tenant را جدا می‌کند، نه واحد را) */
  private async memberOfMyUnit(client: PoolClient, unitId: string, membershipId: string) {
    const m = await getMembershipOr404(client, membershipId)
    if (m.unit_id !== unitId) throw new NotFoundException('این عضو در خانوار شما نیست')
    return m
  }

  /* ───────────── C1 ───────────── */

  async household(user: JwtPayload, unitId?: string) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const { personId, m } = await this.me(client, user, unitId)
      return this.view(client, personId, m)
    })
  }

  private async view(client: PoolClient, personId: string, m: MembershipRow) {
    const unit = (await client.query<{ unit_number: string; floor: number | null }>(
      `SELECT unit_number, floor FROM property.units WHERE id = $1`, [m.unit_id])).rows[0]
    const rows = await client.query<MembershipRow & {
      name: string; phone: string | null; birth_year: number | null
      preset: string | null; monthly_cap: string | null; invite_expires: string | null; logins: number; last_login: string | null
    }>(
      `SELECT ${MEMBERSHIP_COLS}, p.name, p.phone, p.birth_year, pc.preset, pc.monthly_cap,
              (SELECT max(i.expires_at) FROM residency.invites i WHERE i.membership_id = m.id AND i.used_at IS NULL AND i.revoked_at IS NULL) AS invite_expires,
              (SELECT count(*)::int FROM identity.users iu WHERE iu.person_id = m.user_id AND iu.is_active) AS logins,
              (SELECT max(iu.last_login_at) FROM identity.users iu WHERE iu.person_id = m.user_id) AS last_login
         FROM residency.memberships m
         JOIN residency.users p ON p.id = m.user_id
         LEFT JOIN residency.parent_controls pc ON pc.membership_id = m.id
        WHERE m.unit_id = $1 AND m.status IN ('invited', 'active') AND m.role <> 'owner_absent'
        ORDER BY (m.role = 'head') DESC, (m.role IN ('adult','senior')) DESC, m.role = 'caregiver', p.birth_year NULLS FIRST, m.created_at`,
      [m.unit_id],
    )
    const members = []
    for (const r of rows.rows) {
      const age = ageFromBirthYear(r.birth_year)
      const credit = r.role === 'child' ? await childCredit(client, r.id) : null
      members.push({
        id: r.id,
        user_id: r.user_id,
        name: r.name,
        initial: r.name.trim()[0] ?? '؟',
        phone: displayPhone(r.phone),
        has_phone: !!r.phone,
        role: r.role,
        title: r.title,
        role_label: roleLine(r, age),
        status: r.status,
        is_me: r.user_id === personId,
        age,
        end_date: r.end_date,
        preset: r.preset,
        monthly_cap: r.monthly_cap === null ? null : Number(r.monthly_cap),
        credit,
        invite_expires_at: r.invite_expires,
        settings: r.settings,
        access_label: accessLabel(r),
        sub: subLine(r, age, r.user_id === personId, credit),
      })
    }
    return {
      unit: { id: m.unit_id, no: unit.unit_number, floor: unit.floor },
      me: { membership_id: m.id, role: m.role, is_head: m.role === 'head' },
      members,
      pending: m.role === 'head' ? await listJoinRequests(client, m.unit_id).then((l) => l.filter((x) => x.status === 'pending_head')) : [],
    }
  }

  /* ───────────── C2 · افزودن عضو ───────────── */

  async addMember(user: JwtPayload, dto: AddMemberDto, ctx: RequestCtx) {
    let invite: { token: string } | null = null
    let phone: string | null = null
    const out = await this.db.withTenant(user.tenant_id!, async (client) => {
      const { personId, m: me } = await this.requireHead(client, user)
      const tenantId = user.tenant_id!
      if (dto.type === 'caregiver' && !dto.end_date) throw new BadRequestException('برای پرستار یا کمک‌کار، پایان دسترسی اجباری است')
      if (dto.type === 'caregiver' && dto.end_date! < new Date().toISOString().slice(0, 10)) throw new BadRequestException('پایان دسترسی نمی‌تواند در گذشته باشد')
      const isChild = dto.type === 'child'
      const withPhone = isChild ? dto.has_phone === true && !!dto.phone : true
      if (!isChild && !dto.phone) throw new BadRequestException('شماره موبایل لازم است')

      const person = await upsertPerson(client, {
        name: dto.name,
        phone: withPhone ? dto.phone : null,
        birth_year: dto.birth_year ?? null,
      }, { requirePhone: !isChild })
      if (person.id === personId) throw new ConflictException('شما خودتان عضو این خانوار هستید')
      const dup = await client.query(`SELECT 1 FROM residency.memberships WHERE unit_id = $1 AND user_id = $2 AND status <> 'ended'`, [me.unit_id, person.id])
      if (dup.rowCount) throw new ConflictException(`${person.name} قبلاً عضو این خانوار است`)

      // کودکِ بدون موبایل با کد خانواده وارد می‌شود و فوراً فعال است؛ بقیه دعوت پیامکی ۷ روزه می‌گیرند
      const status = isChild && !withPhone ? 'active' : 'invited'
      const settings: Record<string, unknown> = {}
      if (dto.type === 'adult') settings.finance_access = dto.finance_access !== false
      if (dto.type === 'senior') settings.easy_mode = dto.easy_mode !== false
      if (dto.type === 'caregiver' && dto.days) settings.days = dto.days
      const ins = await client.query<{ id: string }>(
        `INSERT INTO residency.memberships (tenant_id, user_id, unit_id, role, residency, pays_charge, start_date, end_date, status, invited_by, channel, title, settings)
         VALUES ($1, $2, $3, $4, $5, false, CURRENT_DATE, $6, $7, $8, 'household', $9, $10) RETURNING id`,
        [
          tenantId, person.id, me.unit_id, dto.type, me.residency === 'owner_absent' ? 'owner' : me.residency,
          dto.type === 'caregiver' ? dto.end_date : null, status, personId,
          dto.title ?? (isChild ? 'فرزند' : dto.type === 'caregiver' ? 'پرستار' : null), JSON.stringify(settings),
        ],
      )
      const membershipId = ins.rows[0].id
      let preset: PresetKey | null = null
      if (isChild) {
        preset = presetForAge(ageFromBirthYear(dto.birth_year ?? null))
        const p = PRESETS[preset]
        await client.query(
          `INSERT INTO residency.parent_controls (membership_id, tenant_id, preset, modules, monthly_cap, quiet_hours, weekly_report, exit_lock, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [membershipId, tenantId, preset, JSON.stringify(p.modules), p.monthly_cap, p.quiet ? JSON.stringify(DEFAULT_QUIET_HOURS) : null, p.weekly_report, p.exit_lock, personId],
        )
      }
      if (status === 'invited') {
        invite = await issueInvite(client, tenantId, membershipId, 'sms')
        phone = person.phone
      }
      const actor = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [personId])).rows[0]
      await writeAudit(client, tenantId, ctx, 'membership.created', {
        summary: isChild
          ? `${actor.name} «${person.name}» را با حالت والدین اضافه کرد`
          : `${actor.name} ${person.name} را به‌عنوان ${ROLE_LABEL[dto.type]} اضافه کرد`,
        subject_user_id: personId,
        member_user_id: person.id,
        membership_id: membershipId,
        unit_id: me.unit_id,
        after: { role: dto.type, status, preset },
      })
      return { membership_id: membershipId, status, preset, household: await this.view(client, personId, me) }
    })
    if (invite && phone) this.events.publish('invite.sent', { phone, token: (invite as { token: string }).token, channel: 'sms' }, user.tenant_id)
    return out
  }

  /* ───────────── حذف عضو ───────────── */

  /** ارسال دوباره‌ی دعوت: توکن تازه‌ی ۷ روزه، توکن قبلی باطل (قاعده ۵) */
  async resendInvite(user: JwtPayload, membershipId: string, ctx: RequestCtx) {
    let token = ''
    let phone: string | null = null
    const out = await this.db.withTenant(user.tenant_id!, async (client) => {
      const { personId, m: me } = await this.requireHead(client, user)
      const target = await this.memberOfMyUnit(client, me.unit_id, membershipId)
      if (target.status !== 'invited') throw new ConflictException('این عضو دعوت باز ندارد')
      const inv = await issueInvite(client, user.tenant_id!, target.id, 'sms')
      token = inv.token
      const p = (await client.query<{ name: string; phone: string | null }>(`SELECT name, phone FROM residency.users WHERE id = $1`, [target.user_id])).rows[0]
      phone = p.phone
      await writeAudit(client, user.tenant_id!, ctx, 'invite.resent', { summary: `دعوت دوباره برای ${p.name} ارسال شد`, subject_user_id: personId, member_user_id: target.user_id, membership_id: target.id })
      return { ok: true, name: p.name, expires_at: inv.expires_at }
    })
    if (phone) this.events.publish('invite.sent', { phone, token, channel: 'sms' }, user.tenant_id)
    return out
  }

  async removeMember(user: JwtPayload, membershipId: string, ctx: RequestCtx) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const { personId, m: me } = await this.requireHead(client, user)
      const target = await this.memberOfMyUnit(client, me.unit_id, membershipId)
      if (target.id === me.id) throw new ConflictException('سرپرست خودش را حذف نمی‌کند؛ ابتدا سرپرستی را واگذار کنید')
      if (target.status === 'ended') throw new NotFoundException('این عضو قبلاً حذف شده است')
      await client.query(
        `UPDATE residency.memberships SET status = 'ended', ended_at = now(), end_date = GREATEST(start_date, CURRENT_DATE), updated_at = now() WHERE id = $1`,
        [target.id],
      )
      await client.query(`UPDATE residency.invites SET revoked_at = now() WHERE membership_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [target.id])
      await client.query(`UPDATE residency.family_login_codes SET expires_at = now() WHERE membership_id = $1 AND used_at IS NULL`, [target.id])
      await revokeSessions(client, [target.user_id])
      const p = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [target.user_id])).rows[0]
      await writeAudit(client, user.tenant_id!, ctx, 'membership.ended', {
        summary: `${p.name} از خانوار حذف شد`,
        subject_user_id: target.user_id,
        membership_id: target.id,
        unit_id: me.unit_id,
        before: { role: target.role, status: target.status },
      })
      return this.view(client, personId, me)
    })
  }

  /* ───────────── واگذاری سرپرستی ───────────── */

  async transferHead(user: JwtPayload, membershipId: string, ctx: RequestCtx) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const { personId, m: me } = await this.requireHead(client, user)
      const target = await this.memberOfMyUnit(client, me.unit_id, membershipId)
      if (target.status !== 'active' || !['adult', 'senior'].includes(target.role)) {
        throw new ConflictException('سرپرستی فقط به یک بزرگسالِ فعال واگذار می‌شود')
      }
      // ترتیب مهم است: اول تنزل، بعد ارتقا (UNIQUE INDEX یک سرپرست). بررسی «دقیقاً یک» در COMMIT.
      await client.query(`UPDATE residency.memberships SET role = 'adult', title = NULL, updated_at = now() WHERE id = $1`, [me.id])
      await client.query(`UPDATE residency.memberships SET role = 'head', title = $2, updated_at = now() WHERE id = $1`, [target.id, ROLE_LABEL.head])
      const names = (await client.query<{ id: string; name: string }>(`SELECT id, name FROM residency.users WHERE id = ANY($1)`, [[personId, target.user_id]])).rows
      const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? ''
      await notify(client, user.tenant_id!, { person: target.user_id }, {
        kind: 'head_transferred',
        title: 'شما سرپرست خانوار شدید',
        body: `${nameOf(personId)} سرپرستی واحد را به شما واگذار کرد`,
        link: '/resident/family',
        ref: target.id,
      })
      await writeAudit(client, user.tenant_id!, ctx, 'membership.head_transferred', {
        summary: `${nameOf(personId)} سرپرستی را به ${nameOf(target.user_id)} واگذار کرد`,
        subject_user_id: personId,
        member_user_id: target.user_id,
        unit_id: me.unit_id,
        before: { head: me.id },
        after: { head: target.id },
      })
      const updated = await getMembershipOr404(client, me.id)
      return this.view(client, personId, updated)
    })
  }

  /* ───────────── C3 · حالت والدین ───────────── */

  private async childOf(client: PoolClient, user: JwtPayload, membershipId: string, requireHead: boolean) {
    const who = requireHead ? await this.requireHead(client, user) : await this.me(client, user)
    const { personId, m: me } = who
    if (!['head', 'adult', 'senior'].includes(me.role)) throw new ForbiddenException('فقط والدین به این بخش دسترسی دارند')
    const child = await this.memberOfMyUnit(client, me.unit_id, membershipId)
    if (child.role !== 'child') throw new BadRequestException('حالت والدین فقط برای کودک است')
    return { personId, me, child }
  }

  async getParentControl(user: JwtPayload, membershipId: string) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const { child } = await this.childOf(client, user, membershipId, false)
      return this.controlView(client, child)
    })
  }

  private async controlView(client: PoolClient, child: MembershipRow) {
    const pc = (await client.query<{
      preset: string; modules: ModuleMap; monthly_cap: string; quiet_hours: { from: string; to: string } | null
      weekly_report: boolean; exit_lock: boolean; lobby_alert: boolean; exit_pin_hash: string | null; updated_at: string
    }>(`SELECT * FROM residency.parent_controls WHERE membership_id = $1`, [child.id])).rows[0]
    if (!pc) throw new NotFoundException('حالت والدین برای این کودک تنظیم نشده است')
    const p = (await client.query<{ name: string; birth_year: number | null }>(`SELECT name, birth_year FROM residency.users WHERE id = $1`, [child.user_id])).rows[0]
    const age = ageFromBirthYear(p.birth_year)
    return {
      membership_id: child.id,
      name: p.name,
      age,
      preset: pc.preset,
      modules: pc.modules,
      monthly_cap: Number(pc.monthly_cap),
      quiet_hours: pc.quiet_hours,
      weekly_report: pc.weekly_report,
      exit_lock: pc.exit_lock,
      lobby_alert: pc.lobby_alert,
      has_exit_pin: !!pc.exit_pin_hash,
      credit: await childCredit(client, child.id),
      turns_adult_soon: age !== null && age >= 17,
      updated_at: pc.updated_at,
    }
  }

  async putParentControl(user: JwtPayload, membershipId: string, dto: ParentControlDto, ctx: RequestCtx) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const { personId, child } = await this.childOf(client, user, membershipId, true)
      const before = await this.controlView(client, child)

      // انتخاب یک پیش‌تنظیم همه‌ی ردیف‌ها را بازنویسی می‌کند؛ ویرایش هر ردیف → «سفارشی»
      let modules: ModuleMap = { ...before.modules }
      let cap = before.monthly_cap
      let quiet = before.quiet_hours
      let report = before.weekly_report
      let lock = before.exit_lock
      if (dto.preset && dto.preset !== 'custom') {
        const p = PRESETS[dto.preset as PresetKey]
        modules = { ...p.modules }
        cap = p.monthly_cap
        quiet = p.quiet ? DEFAULT_QUIET_HOURS : null
        report = p.weekly_report
        lock = p.exit_lock
      }
      if (dto.modules) {
        for (const [k, v] of Object.entries(dto.modules)) {
          if (!(MODULE_KEYS as readonly string[]).includes(k) || ![0, 1, 2].includes(Number(v))) {
            throw new BadRequestException(`مقدار «${k}» نامعتبر است`)
          }
          modules[k as keyof ModuleMap] = Number(v) as 0 | 1 | 2
        }
      }
      if (dto.monthly_cap !== undefined) cap = dto.monthly_cap
      if (dto.quiet_hours !== undefined) quiet = dto.quiet_hours
      if (dto.weekly_report !== undefined) report = dto.weekly_report
      if (dto.exit_lock !== undefined) lock = dto.exit_lock
      const preset = matchPreset({ modules, monthly_cap: cap, quiet: !!quiet, weekly_report: report, exit_lock: lock })
      const pinHash = dto.exit_pin ? await bcrypt.hash(dto.exit_pin, 10) : null

      await client.query(
        `UPDATE residency.parent_controls
            SET preset = $2, modules = $3, monthly_cap = $4, quiet_hours = $5, weekly_report = $6, exit_lock = $7,
                lobby_alert = COALESCE($8, lobby_alert), exit_pin_hash = COALESCE($9, exit_pin_hash),
                updated_by = $10, updated_at = now()
          WHERE membership_id = $1`,
        [child.id, preset, JSON.stringify(modules), cap, quiet ? JSON.stringify(quiet) : null, report, lock, dto.lobby_alert ?? null, pinHash, personId],
      )
      const after = await this.controlView(client, child)
      await writeAudit(client, user.tenant_id!, ctx, 'parent_control.updated', {
        summary: `حالت والدین ${after.name} به‌روز شد (${presetLabel(preset)})`,
        subject_user_id: personId,
        member_user_id: child.user_id,
        membership_id: child.id,
        before: strip(before),
        after: strip(after),
      })
      // «فوراً روی گوشی کودک اعمال می‌شود»: اپ کودک /me/permissions را با این رویداد دوباره می‌خواند
      this.events.publish('parent_control.updated', { membershipId: child.id, userId: child.user_id }, user.tenant_id)
      return after
    })
  }

  /* ───────────── C4 · کد ورود کودک ───────────── */

  async loginCode(user: JwtPayload, membershipId: string, ctx: RequestCtx) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const { personId, child } = await this.childOf(client, user, membershipId, true)
      if (child.status !== 'active') throw new ConflictException('این عضو فعال نیست')
      // کدهای قبلیِ مصرف‌نشده باطل می‌شوند — در هر لحظه فقط یک کد زنده
      await client.query(`UPDATE residency.family_login_codes SET expires_at = now() WHERE membership_id = $1 AND used_at IS NULL AND expires_at > now()`, [child.id])
      const code = await freshFamilyCode(client)
      const qr = randomToken(18)
      const res = await client.query<{ id: string; expires_at: string }>(
        `INSERT INTO residency.family_login_codes (tenant_id, membership_id, code, qr_token, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, expires_at`,
        [user.tenant_id, child.id, code, qr, personId],
      )
      const t = (await client.query<{ subdomain: string }>(`SELECT subdomain FROM identity.tenants WHERE id = $1`, [user.tenant_id])).rows[0]
      await writeAudit(client, user.tenant_id!, ctx, 'family_code.issued', {
        summary: 'کد ورود خانواده صادر شد',
        subject_user_id: personId,
        member_user_id: child.user_id,
        membership_id: child.id,
      })
      return {
        code,
        qr_token: qr,
        // محتوای QR: اپ با اسکن آن مستقیماً POST /auth/family-code را صدا می‌زند
        qr_payload: `hamino://family?t=${encodeURIComponent(t.subdomain)}&k=${qr}`,
        subdomain: t.subdomain,
        expires_at: res.rows[0].expires_at,
      }
    })
  }

  /* ───────────── C5 · درخواست‌های کودک ───────────── */

  async childRequests(user: JwtPayload, status = 'pending') {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const { m: me } = await this.me(client, user)
      if (!['head', 'adult', 'senior'].includes(me.role)) throw new ForbiddenException('فقط والدین درخواست کودک را می‌بینند')
      return listChildRequests(client, me.unit_id, status)
    })
  }

  async decideChildRequest(user: JwtPayload, id: string, approve: boolean, dto: DecideChildRequestDto, ctx: RequestCtx) {
    const out = await this.db.withTenant(user.tenant_id!, async (client) => {
      const { personId, m: me } = await this.me(client, user)
      if (!['head', 'adult', 'senior'].includes(me.role)) throw new ForbiddenException('فقط والدین درخواست کودک را تأیید می‌کنند')
      const req = (await client.query<{
        id: string; child_membership_id: string; type: string; payload: Record<string, unknown>; amount: string | null
        status: string; expires_at: string; unit_id: string; child_user_id: string; child_name: string
      }>(
        `SELECT r.*, m.unit_id, m.user_id AS child_user_id, p.name AS child_name
           FROM residency.child_requests r
           JOIN residency.memberships m ON m.id = r.child_membership_id
           JOIN residency.users p ON p.id = m.user_id
          WHERE r.id = $1 FOR UPDATE OF r`,
        [id],
      )).rows[0]
      if (!req || req.unit_id !== me.unit_id) throw new NotFoundException('درخواست یافت نشد')
      if (req.status === 'pending' && new Date(req.expires_at) <= new Date()) {
        await client.query(`UPDATE residency.child_requests SET status = 'expired' WHERE id = $1`, [id])
        throw new ConflictException('این درخواست منقضی شده است (۳۰ دقیقه)')
      }
      if (req.status !== 'pending') throw new ConflictException('درخواست باز نیست')

      const amount = Number(req.amount ?? 0)
      let capRaised: number | null = null
      if (approve) {
        if (req.type === 'order' && amount > 0) {
          const credit = await childCredit(client, req.child_membership_id)
          if (amount > credit.remaining) {
            // مثل فایل طراحی: تأیید سفارش بالای سقف، سقف این ماه را به‌اندازه‌ی لازم بالا می‌برد
            capRaised = credit.spent + amount
            await client.query(`UPDATE residency.parent_controls SET monthly_cap = GREATEST(monthly_cap, $2), preset = 'custom', updated_at = now() WHERE membership_id = $1`, [req.child_membership_id, capRaised])
          }
          await client.query(
            `INSERT INTO residency.child_spend (tenant_id, child_membership_id, unit_id, amount, type, request_id, description)
             VALUES ($1, $2, $3, $4, 'order', $5, $6)`,
            [user.tenant_id, req.child_membership_id, req.unit_id, amount, id, String(req.payload?.venue ?? 'سفارش')],
          )
        }
        if (req.type === 'amenity') await this.createChildReservation(client, user.tenant_id!, req, personId)
      }
      await client.query(
        `UPDATE residency.child_requests SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1`,
        [id, approve ? 'approved' : 'rejected', personId],
      )
      await notify(client, user.tenant_id!, { person: req.child_user_id }, {
        kind: 'child_request_result',
        title: approve ? 'درخواستت تأیید شد' : 'درخواستت رد شد',
        body: approve && req.type === 'order' ? 'سفارش به آشپزخانه رفت' : dto.reason ?? null,
        ref: id,
      })
      const actor = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [personId])).rows[0]
      await writeAudit(client, user.tenant_id!, ctx, approve ? 'child_request.approved' : 'child_request.rejected', {
        summary: `${actor.name} درخواست ${req.child_name} را ${approve ? 'تأیید' : 'رد'} کرد${amount ? ` (${faMoney(amount)} تومان)` : ''}`,
        subject_user_id: personId,
        member_user_id: req.child_user_id,
        request_id: id,
        amount,
        cap_raised_to: capRaised,
      })
      return {
        id,
        status: approve ? 'approved' : 'rejected',
        cap_raised_to: capRaised,
        credit: await childCredit(client, req.child_membership_id),
        type: req.type,
        payload: req.payload,
        unit_id: req.unit_id,
        amount,
      }
    })
    if (out.status === 'approved' && out.type === 'order') {
      // سفارش تأییدشده به صف آشپزخانه/کافی‌شاپ می‌رود و مبلغ روی شارژ واحد می‌نشیند
      this.events.publish('child.order_approved', { requestId: id, unitId: out.unit_id, amount: out.amount, payload: out.payload }, user.tenant_id)
    }
    return out
  }

  /** رزرو مشاعی که با تأیید والد قطعی شد — در همان جدول facility.reservations (دیتابیس مشترک) */
  private async createChildReservation(client: PoolClient, tenantId: string, req: { payload: Record<string, unknown>; unit_id: string; child_user_id: string }, by: string) {
    const amenityId = String(req.payload.amenity_id ?? '')
    const start = String(req.payload.start ?? '')
    const end = String(req.payload.end ?? '')
    if (!amenityId || !start || !end) throw new BadRequestException('اطلاعات رزرو ناقص است')
    const a = (await client.query<{ requires_approval: boolean; name: string }>(`SELECT requires_approval, name FROM facility.amenities WHERE id = $1`, [amenityId])).rows[0]
    if (!a) throw new NotFoundException('مشاع یافت نشد')
    await client.query('SAVEPOINT child_res')
    try {
      const r = await client.query<{ id: string; status: string }>(
        `INSERT INTO facility.reservations (tenant_id, amenity_id, unit_id, requested_by, user_id, start_at, end_at, status, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'child_request') RETURNING id, status`,
        [tenantId, amenityId, req.unit_id, by, req.child_user_id, start, end, a.requires_approval ? 'pending' : 'confirmed'],
      )
      await client.query('RELEASE SAVEPOINT child_res')
      if (r.rows[0].status === 'pending') {
        await notify(client, tenantId, [{ role: 'perm:amenity_desk' }, { role: 'admin' }], {
          kind: 'reservation_pending', title: `درخواست رزرو جدید — ${a.name}`, link: '/staff/amenity-desk', ref: r.rows[0].id,
        })
      }
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT child_res')
      if ((e as { code?: string }).code === '23P01') throw new ConflictException('این ساعت دیگر آزاد نیست؛ درخواست را رد کنید تا کودک ساعت دیگری انتخاب کند')
      throw e
    }
  }

  /* ───────────── درخواست عضویتِ منتظر سرپرست ───────────── */

  async decideJoin(user: JwtPayload, membershipId: string, approve: boolean, reason: string | undefined, ctx: RequestCtx) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const { personId, m: me } = await this.requireHead(client, user)
      const target = await this.memberOfMyUnit(client, me.unit_id, membershipId)
      if (target.status !== 'pending_head') throw new ConflictException('این درخواست منتظر تأیید شما نیست')
      if (approve) {
        await client.query(`UPDATE residency.memberships SET status = 'active', updated_at = now() WHERE id = $1`, [target.id])
        await notify(client, user.tenant_id!, { person: target.user_id }, { kind: 'join_approved', title: 'سرپرست واحد عضویت شما را تأیید کرد', ref: target.id })
        const p = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [target.user_id])).rows[0]
        await writeAudit(client, user.tenant_id!, ctx, 'join_request.head_approved', {
          summary: `سرپرست عضویت ${p.name} را تأیید کرد`, subject_user_id: target.user_id, membership_id: target.id,
        })
      } else {
        await rejectMembership(client, user.tenant_id!, target, reason, ctx, 'سرپرست خانوار')
      }
      return this.view(client, personId, me)
    })
  }

}

export async function listChildRequests(client: PoolClient, unitId: string, status = 'pending') {
  await client.query(
    `UPDATE residency.child_requests r SET status = 'expired'
       FROM residency.memberships m
      WHERE m.id = r.child_membership_id AND m.unit_id = $1 AND r.status = 'pending' AND r.expires_at <= now()`,
    [unitId],
  )
  const res = await client.query<{
    id: string; type: string; payload: Record<string, unknown>; amount: string | null; reason: string | null
    status: string; expires_at: string; created_at: string; child_membership_id: string; child_name: string
  }>(
    `SELECT r.id, r.type, r.payload, r.amount, r.reason, r.status, r.expires_at, r.created_at, r.child_membership_id, p.name AS child_name
       FROM residency.child_requests r
       JOIN residency.memberships m ON m.id = r.child_membership_id
       JOIN residency.users p ON p.id = m.user_id
      WHERE m.unit_id = $1 AND ($2 = 'all' OR r.status = $2)
      ORDER BY r.created_at DESC LIMIT 50`,
    [unitId, status],
  )
  const out = []
  for (const r of res.rows) {
    const credit = await childCredit(client, r.child_membership_id)
    const amount = r.amount === null ? null : Number(r.amount)
    out.push({
      id: r.id,
      type: r.type,
      title: `${r.child_name} ${REQUEST_TITLE[r.type] ?? ''}`.trim(),
      child_name: r.child_name,
      child_membership_id: r.child_membership_id,
      payload: r.payload,
      amount,
      reason: r.reason,
      status: r.status,
      expires_at: r.expires_at,
      created_at: r.created_at,
      credit,
      over_cap_by: amount !== null && amount > credit.remaining ? amount - credit.remaining : 0,
    })
  }
  return out
}

function presetLabel(p: string) {
  return { u7: 'زیر ۷', c12: '۷ تا ۱۲', t17: '۱۳ تا ۱۷', custom: 'سفارشی' }[p] ?? p
}

/** برای ممیزی: فقط تنظیمات، بدون اعتبار لحظه‌ای و زمان */
function strip<T extends { credit?: unknown; updated_at?: unknown }>(v: T) {
  const rest: Record<string, unknown> = { ...v }
  delete rest.credit
  delete rest.updated_at
  return rest
}

function roleLine(r: MembershipRow & { title: string | null }, age: number | null): string {
  if (r.role === 'head') return 'سرپرست خانوار'
  if (r.role === 'child') return `${r.title ?? 'فرزند'}${age !== null ? ' · ' + fa(age) + ' سال' : ''}`
  if (r.role === 'caregiver') return `${r.title ?? 'پرستار'}${r.end_date ? ' · تا ' + formatJalali(r.end_date, false) : ''}`
  return r.title ?? ROLE_LABEL[r.role]
}

function accessLabel(r: MembershipRow & { preset: string | null }): string {
  if (r.status === 'invited') return 'دعوت ارسال شد'
  if (r.role === 'head') return 'دسترسی کامل'
  if (r.role === 'child') return r.preset === 'u7' ? 'زیر ۷ سال' : 'حالت والدین'
  if (r.role === 'senior') return 'حالت ساده'
  if (r.role === 'caregiver') return 'دسترسی موقت'
  return 'بزرگسال'
}

function subLine(
  r: MembershipRow & { preset: string | null; monthly_cap: string | null; invite_expires: string | null; logins: number; last_login: string | null },
  age: number | null,
  isMe: boolean,
  credit: { cap: number } | null,
): string {
  if (r.status === 'invited') return 'دعوت ۷ روز معتبر است · ارسال دوباره'
  if (isMe) return 'شما'
  if (r.role === 'child') {
    const band = presetLabel(r.preset ?? presetForAge(age))
    if (r.preset === 'u7') return 'بدون سیم‌کارت · ' + String((r.settings as { device?: string }).device ?? 'ورود با QR')
    return `${band} سال · سقف ${faMoney((credit?.cap ?? 0) / 1000)} هزار`
  }
  return r.last_login ? 'آخرین ورود ' + new Date(r.last_login).toLocaleDateString('fa-IR') : 'هنوز وارد نشده'
}
