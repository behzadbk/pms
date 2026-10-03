import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import * as ExcelJS from 'exceljs'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { RequestCtx, notify, writeAudit } from './context'
import { getMembershipOr404, getUnitOr404, liveHead, upsertPerson, MembershipRow } from './residency.repo'
import { displayPhone, normalizePhone, toLatinDigits } from './phone'
import { parseDateInput } from './jalali'
import { ManagerService, randomToken } from './manager.service'
import { ROLE_LABEL, fa } from './residents.constants'
import type { AddResidentDto, LobbyJoinDto } from './dto/residents.dto'

export interface JoinRequestView {
  id: string
  name: string
  phone: string | null
  unit_id: string
  unit_no: string
  residency: string
  channel: string
  status: 'pending_approval' | 'pending_head'
  created_at: string
  /** ok = تأیید/رد · move = این شماره ساکن واحد دیگری است (انتقال) · head = منتظر سرپرست */
  kind: 'ok' | 'move' | 'head'
  note: string | null
  head_name: string | null
  current_unit_no: string | null
}

/** ستون‌های قالب اکسل — به همین ترتیب؛ سطر اول سرتیتر است */
export const IMPORT_COLUMNS = ['واحد', 'نام و نام خانوادگی', 'شماره موبایل', 'کد ملی', 'نوع سکونت', 'شروع سکونت', 'پایان قرارداد', 'پرداخت شارژ با'] as const
const RESIDENCY_FROM_LABEL: Record<string, 'owner' | 'tenant' | 'owner_absent'> = {
  'مالک ساکن': 'owner', مالک: 'owner', owner: 'owner',
  مستأجر: 'tenant', مستاجر: 'tenant', tenant: 'tenant',
  'مالک غیرساکن': 'owner_absent', owner_absent: 'owner_absent',
}

@Injectable()
export class JoinService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly manager: ManagerService,
  ) {}

  /* ───────────── A5 · صف درخواست‌های عضویت ───────────── */

  async list(tenantId: string) {
    return this.db.withTenant(tenantId, (client) => listJoinRequests(client))
  }

  private async pending(client: PoolClient, id: string, statuses = ['pending_approval', 'pending_head']) {
    const m = await getMembershipOr404(client, id)
    if (!statuses.includes(m.status)) throw new ConflictException('این درخواست دیگر در انتظار نیست')
    return m
  }

  async approve(tenantId: string, id: string, ctx: RequestCtx) {
    return this.db.withTenant(tenantId, async (client) => {
      const m = await this.pending(client, id, ['pending_approval'])
      const out = await approveMembership(client, tenantId, m, ctx)
      return { ...out, requests: await listJoinRequests(client) }
    })
  }

  async reject(tenantId: string, id: string, reason: string | undefined, ctx: RequestCtx) {
    return this.db.withTenant(tenantId, async (client) => {
      const m = await this.pending(client, id)
      await rejectMembership(client, tenantId, m, reason, ctx, 'مدیر ساختمان')
      return { status: 'rejected', requests: await listJoinRequests(client) }
    })
  }

  /**
   * «انتقال»: متقاضی اکنون ساکن واحد دیگری از همین ساختمان است. عضویت قبلی‌اش پایان می‌یابد
   * و درخواست برای واحد مقصد (پیش‌فرض همان واحد درخواستی) تأیید می‌شود.
   */
  async transfer(tenantId: string, id: string, toUnitId: string | undefined, ctx: RequestCtx) {
    return this.db.withTenant(tenantId, async (client) => {
      const m = await this.pending(client, id)
      const target = toUnitId ?? m.unit_id
      const unit = await getUnitOr404(client, target)
      const prev = await client.query<{ id: string; unit_no: string }>(
        `UPDATE residency.memberships pm SET status = 'ended', ended_at = now(), end_date = GREATEST(pm.start_date, CURRENT_DATE), updated_at = now()
           FROM property.units u
          WHERE u.id = pm.unit_id AND pm.user_id = $1 AND pm.id <> $2 AND pm.status IN ('invited','active') AND pm.role <> 'owner_absent'
          RETURNING pm.id, u.unit_number AS unit_no`,
        [m.user_id, m.id],
      )
      if (target !== m.unit_id) {
        await client.query(`UPDATE residency.memberships SET unit_id = $2, updated_at = now() WHERE id = $1`, [m.id, target])
      }
      const moved = { ...m, unit_id: target, status: 'pending_approval' }
      const out = await approveMembership(client, tenantId, moved, ctx, { skipApplicantNotice: true })
      const person = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
      const from = prev.rows.map((r) => r.unit_no).join('، ')
      await notify(client, tenantId, { person: m.user_id }, {
        kind: 'join_transferred',
        title: `عضویت شما به واحد ${fa(unit.unit_number)} منتقل شد`,
        ref: m.id,
      })
      await writeAudit(client, tenantId, ctx, 'membership.transferred', {
        summary: `${person.name} از ${from || '—'} به ${unit.unit_number} منتقل شد`,
        subject_user_id: m.user_id,
        membership_id: m.id,
        from_memberships: prev.rows.map((r) => r.id),
        to_unit_id: target,
      })
      return { ...out, from_units: prev.rows.map((r) => r.unit_no), requests: await listJoinRequests(client) }
    })
  }

  async remindHead(tenantId: string, id: string, ctx: RequestCtx) {
    return this.db.withTenant(tenantId, async (client) => {
      const m = await this.pending(client, id, ['pending_head'])
      const head = await liveHead(client, m.unit_id)
      if (!head) throw new ConflictException('این واحد سرپرست ندارد')
      const p = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
      await notify(client, tenantId, { person: head.user_id }, {
        kind: 'join_request_head',
        title: 'یادآوری: درخواست عضویت منتظر تأیید شماست',
        body: `${p.name} می‌خواهد به خانوار شما اضافه شود`,
        link: '/resident/family',
        ref: m.id,
      })
      await writeAudit(client, tenantId, ctx, 'join_request.head_reminded', { summary: `یادآوری به ${head.name}`, membership_id: m.id, subject_user_id: m.user_id })
      return { ok: true, head_name: head.name }
    })
  }

  /* ───────────── ورود گروهی از اکسل ───────────── */

  async template(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('ساکنین', { views: [{ rightToLeft: true }] })
    ws.addRow([...IMPORT_COLUMNS])
    ws.addRow(['1204', 'رضا کریمی', '09123456789', '', 'مستأجر', '1405/07/01', '1406/06/31', 'مستأجر'])
    ws.getRow(1).font = { bold: true }
    ws.columns.forEach((c) => (c.width = 18))
    return Buffer.from(await wb.xlsx.writeBuffer())
  }

  async import(tenantId: string, file: { originalname: string; buffer: Buffer; mimetype: string } | undefined, ctx: RequestCtx) {
    if (!file?.buffer?.length) throw new BadRequestException('فایل اکسل ارسال نشده است')
    const rows = await readRows(file)
    if (!rows.length) throw new BadRequestException('فایل خالی است')

    return this.db.withTenant(tenantId, async (client) => {
      const units = new Map(
        (await client.query<{ id: string; unit_number: string }>(`SELECT id, unit_number FROM property.units`)).rows.map((u) => [u.unit_number, u.id]),
      )
      const errors: { row: number; reason: string; text: string }[] = []
      const seenPhones = new Map<string, string>()
      let created = 0
      for (const { row, cells } of rows) {
        const [unitNo, name, phoneRaw, nid, resLabel, start, end, payer] = cells.map((c) => toLatinDigits(String(c ?? '').trim()))
        const fail = (reason: string) => errors.push({ row, reason, text: `ردیف ${fa(row)} · ${reason}` })
        if (!unitNo && !name && !phoneRaw) continue // ردیف خالی
        const unitId = units.get(unitNo)
        if (!unitId) { fail(`واحد ${fa(unitNo || '؟')} وجود ندارد`); continue }
        if (!name) { fail('نام خالی است'); continue }
        const phone = normalizePhone(phoneRaw)
        if (!phone) { fail('شماره موبایل نامعتبر است'); continue }
        const residency = RESIDENCY_FROM_LABEL[resLabel]
        if (!resLabel) { fail('نوع سکونت خالی است'); continue }
        if (!residency) { fail(`نوع سکونت «${resLabel}» نامعتبر است`); continue }
        if (seenPhones.has(phone)) { fail(`شماره تکراری با واحد ${fa(seenPhones.get(phone)!)}`); continue }
        const dup = await client.query<{ unit_number: string }>(
          `SELECT u.unit_number FROM residency.memberships m JOIN residency.users p ON p.id = m.user_id JOIN property.units u ON u.id = m.unit_id
            WHERE p.phone = $1 AND m.status <> 'ended' AND m.unit_id <> $2 AND m.role <> 'owner_absent' LIMIT 1`,
          [phone, unitId],
        )
        if (dup.rows[0] && residency !== 'owner_absent') { fail(`شماره تکراری با واحد ${fa(dup.rows[0].unit_number)}`); continue }
        const startIso = start ? parseDateInput(start) : null
        const endIso = end ? parseDateInput(end) : null
        if (start && !startIso) { fail('تاریخ شروع نامعتبر است'); continue }
        if (end && !endIso) { fail('تاریخ پایان قرارداد نامعتبر است'); continue }

        const dto: AddResidentDto = {
          name, phone, national_id: nid || undefined, residency,
          start_date: startIso ?? undefined, end_date: endIso ?? undefined,
          pays_charge: residency === 'tenant' ? payer !== 'مالک' : true,
          send_sms: true,
        }
        await client.query('SAVEPOINT import_row')
        try {
          const out = await this.manager.addResidentTx(client, tenantId, unitId, dto, ctx, 'excel')
          await client.query('RELEASE SAVEPOINT import_row')
          this.manager.afterInvite(tenantId, out)
          seenPhones.set(phone, unitNo)
          created++
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT import_row')
          fail((e as Error).message)
        }
      }
      const total = created + errors.length
      await writeAudit(client, tenantId, ctx, 'residents.imported', {
        summary: `ورود گروهی ${file.originalname}: ${created} از ${total} ثبت شد`,
        file: file.originalname,
        created,
        errors,
      })
      return { file: file.originalname, total, created, errors }
    })
  }

  /* ───────────── QR لابی ───────────── */

  async lobbyQr(tenantId: string) {
    return this.db.withTenant(tenantId, async (client) => {
      let row = (await client.query<{ lobby_token: string }>(`SELECT lobby_token FROM residency.building_settings WHERE tenant_id = $1`, [tenantId])).rows[0]
      if (!row) {
        row = (
          await client.query<{ lobby_token: string }>(
            `INSERT INTO residency.building_settings (tenant_id, lobby_token) VALUES ($1, $2)
             ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id RETURNING lobby_token`,
            [tenantId, randomToken(12)],
          )
        ).rows[0]
      }
      const t = (await client.query<{ name: string; subdomain: string }>(`SELECT name, subdomain FROM identity.tenants WHERE id = $1`, [tenantId])).rows[0]
      const base = (process.env.PUBLIC_APP_URL ?? '').replace(/\/$/, '')
      return { token: row.lobby_token, url: `${base}/join/${row.lobby_token}`, building: t?.name ?? '', subdomain: t?.subdomain ?? '' }
    })
  }

  /** پیدا کردن ساختمان از روی توکن QR — توکن در جدول tenant‌دار است، پس روی هر tenant جست‌وجو می‌شود */
  private async tenantByLobbyToken(token: string) {
    const tenants = await this.db.withPlatformAccess(async (c) =>
      (await c.query<{ id: string; name: string; status: string }>(`SELECT id, name, status FROM identity.tenants`)).rows,
    )
    for (const t of tenants) {
      const hit = await this.db.withTenant(t.id, async (c) =>
        (await c.query(`SELECT 1 FROM residency.building_settings WHERE lobby_token = $1`, [token])).rowCount,
      )
      if (hit) {
        if (t.status === 'suspended' || t.status === 'cancelled') throw new GoneException('این ساختمان غیرفعال است')
        return t
      }
    }
    throw new NotFoundException('کد QR نامعتبر است')
  }

  async lobbyInfo(token: string) {
    const t = await this.tenantByLobbyToken(token)
    return { building: t.name }
  }

  /** قاعده ۴: ثبت‌نام با QR لابی همیشه «در انتظار تأیید مدیر» است */
  async lobbyJoin(token: string, dto: LobbyJoinDto) {
    const t = await this.tenantByLobbyToken(token)
    const out = await this.db.withTenant(t.id, async (client) => {
      const unit = (await client.query<{ id: string; unit_number: string }>(
        `SELECT id, unit_number FROM property.units WHERE unit_number = $1`, [toLatinDigits(dto.unit_no).trim()])).rows[0]
      if (!unit) throw new NotFoundException(`واحد ${fa(dto.unit_no)} در این ساختمان وجود ندارد`)
      const person = await upsertPerson(client, { name: dto.name, phone: dto.phone }, { requirePhone: true })
      const dup = await client.query(`SELECT 1 FROM residency.memberships WHERE unit_id = $1 AND user_id = $2 AND status <> 'ended'`, [unit.id, person.id])
      if (dup.rowCount) throw new ConflictException('برای این واحد قبلاً درخواست داده‌اید')
      const head = await liveHead(client, unit.id)
      const ins = await client.query<{ id: string }>(
        `INSERT INTO residency.memberships (tenant_id, user_id, unit_id, role, residency, pays_charge, status, channel)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval', 'qr_lobby') RETURNING id`,
        [t.id, person.id, unit.id, head ? 'adult' : 'head', dto.residency, !head],
      )
      await client.query(
        `INSERT INTO residency.invites (tenant_id, membership_id, token, channel) VALUES ($1, $2, $3, 'qr_lobby')`,
        [t.id, ins.rows[0].id, randomToken()],
      )
      await notify(client, t.id, { role: 'admin' }, {
        kind: 'join_request',
        title: 'درخواست عضویت جدید از QR لابی',
        body: `${person.name} · واحد ${fa(unit.unit_number)}`,
        link: '/admin/residents/requests',
        ref: ins.rows[0].id,
      })
      await writeAudit(client, t.id, null, 'join_request.created', {
        summary: `${person.name} از QR لابی برای واحد ${unit.unit_number} درخواست داد`,
        subject_user_id: person.id,
        membership_id: ins.rows[0].id,
        unit_id: unit.id,
      })
      return { status: 'pending_approval', building: t.name, unit_no: unit.unit_number }
    })
    this.events.publish('join_request.created', { tenantId: t.id, unitNo: out.unit_no }, t.id)
    return out
  }

  /* ───────────── پذیرش دعوت (لینک پیامک) ───────────── */

  private async inviteByToken(token: string) {
    const tenants = await this.db.withPlatformAccess(async (c) =>
      (await c.query<{ id: string; name: string; subdomain: string }>(`SELECT id, name, subdomain FROM identity.tenants`)).rows,
    )
    for (const t of tenants) {
      const inv = await this.db.withTenant(t.id, async (c) =>
        (await c.query<{ id: string; membership_id: string; expires_at: string; used_at: string | null; revoked_at: string | null }>(
          `SELECT id, membership_id, expires_at, used_at, revoked_at FROM residency.invites WHERE token = $1`, [token])).rows[0],
      )
      if (inv) return { tenant: t, invite: inv }
    }
    throw new NotFoundException('لینک دعوت نامعتبر است')
  }

  async inviteInfo(token: string) {
    const { tenant, invite } = await this.inviteByToken(token)
    return this.db.withTenant(tenant.id, async (client) => {
      const m = await getMembershipOr404(client, invite.membership_id)
      const p = (await client.query<{ name: string; phone: string | null }>(`SELECT name, phone FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
      const unit = await getUnitOr404(client, m.unit_id)
      const valid = !invite.used_at && !invite.revoked_at && new Date(invite.expires_at) > new Date() && m.status === 'invited'
      return {
        valid,
        building: tenant.name,
        subdomain: tenant.subdomain,
        unit_no: unit.unit_number,
        name: p.name === 'دعوت‌شده' ? '' : p.name,
        phone: displayPhone(p.phone),
        role: m.role,
        residency: m.residency,
        expires_at: invite.expires_at,
      }
    })
  }

  async acceptInvite(token: string, password: string, name?: string) {
    const { tenant, invite } = await this.inviteByToken(token)
    if (invite.used_at) throw new GoneException('این لینک قبلاً استفاده شده است')
    if (invite.revoked_at) throw new GoneException('این دعوت لغو شده است')
    if (new Date(invite.expires_at) <= new Date()) throw new GoneException('اعتبار لینک دعوت (۷ روز) تمام شده است؛ از مدیر بخواهید دوباره ارسال کند')
    const hash = await bcrypt.hash(password, 10)
    return this.db.withTenant(tenant.id, async (client) => {
      const m = await getMembershipOr404(client, invite.membership_id)
      if (m.status !== 'invited') throw new ConflictException('این دعوت دیگر معتبر نیست')
      if (name?.trim()) {
        // فقط نام موقتِ «دعوت‌شده» جایگزین می‌شود؛ نامی که مدیر ثبت کرده دست نمی‌خورد
        await client.query(`UPDATE residency.users SET name = $2, updated_at = now() WHERE id = $1 AND name = 'دعوت‌شده'`, [m.user_id, name.trim()])
      }
      const p = (await client.query<{ name: string; phone: string | null }>(`SELECT name, phone FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
      if (p.name === 'دعوت‌شده') throw new BadRequestException('نام و نام خانوادگی را وارد کنید')
      await client.query(`UPDATE residency.invites SET used_at = now() WHERE id = $1`, [invite.id])
      await client.query(`UPDATE residency.memberships SET status = 'active', updated_at = now() WHERE id = $1`, [m.id])
      // حساب ورود در همین مجتمع: نام کاربری = شماره موبایل (۰۹…)
      const username = p.phone?.startsWith('+98') ? '0' + p.phone.slice(3) : (p.phone ?? '').replace('+', '')
      const login = await client.query<{ id: string }>(
        `INSERT INTO identity.users (tenant_id, full_name, username, phone, password_hash, role, person_id)
         VALUES ($1, $2, $3, $3, $4, 'resident', $5)
         ON CONFLICT (tenant_id, username) WHERE username IS NOT NULL
         DO UPDATE SET password_hash = EXCLUDED.password_hash, person_id = EXCLUDED.person_id, is_active = true, must_change_password = false, updated_at = now()
         RETURNING id`,
        [tenant.id, p.name, username, hash, m.user_id],
      )
      await writeAudit(client, tenant.id, null, 'invite.accepted', {
        summary: 'ثبت از طریق لینک دعوت',
        subject_user_id: m.user_id,
        membership_id: m.id,
      })
      return { ok: true, subdomain: tenant.subdomain, username, login_id: login.rows[0].id }
    })
  }
}

/* ───────────── توابع مشترک (سرپرست خانوار هم استفاده می‌کند) ───────────── */

export async function listJoinRequests(client: PoolClient, unitId?: string): Promise<JoinRequestView[]> {
  const res = await client.query<{
    id: string; user_id: string; name: string; phone: string | null; unit_id: string; unit_no: string
    residency: string; channel: string; status: 'pending_approval' | 'pending_head'; created_at: string
    head_name: string | null; current_unit_no: string | null
  }>(
    `SELECT m.id, m.user_id, p.name, p.phone, m.unit_id, u.unit_number AS unit_no, m.residency, m.channel, m.status, m.created_at,
            (SELECT hp.name FROM residency.memberships h JOIN residency.users hp ON hp.id = h.user_id
              WHERE h.unit_id = m.unit_id AND h.role = 'head' AND h.status IN ('invited','active') LIMIT 1) AS head_name,
            (SELECT ou.unit_number FROM residency.memberships om JOIN property.units ou ON ou.id = om.unit_id
              WHERE om.user_id = m.user_id AND om.id <> m.id AND om.status IN ('invited','active') AND om.role <> 'owner_absent' LIMIT 1) AS current_unit_no
       FROM residency.memberships m
       JOIN residency.users p ON p.id = m.user_id
       JOIN property.units u ON u.id = m.unit_id
      WHERE m.status IN ('pending_approval', 'pending_head') ${unitId ? 'AND m.unit_id = $1' : ''}
      ORDER BY m.created_at DESC`,
    unitId ? [unitId] : [],
  )
  return res.rows.map((r) => {
    const kind: JoinRequestView['kind'] = r.status === 'pending_head' ? 'head' : r.current_unit_no ? 'move' : 'ok'
    return {
      id: r.id,
      name: r.name,
      phone: displayPhone(r.phone),
      unit_id: r.unit_id,
      unit_no: r.unit_no,
      residency: r.residency,
      channel: r.channel,
      status: r.status,
      created_at: r.created_at,
      kind,
      head_name: r.head_name,
      current_unit_no: r.current_unit_no,
      note:
        kind === 'head' ? `منتظر تأیید سرپرست واحد (${r.head_name ?? '—'})`
          : kind === 'move' ? `این شماره اکنون ساکن واحد ${fa(r.current_unit_no!)} است`
            : null,
    }
  })
}

/** قاعده ۴: پس از تأیید مدیر، اگر واحد سرپرست دارد → «منتظر سرپرست»؛ وگرنه عضو فعال و سرپرست */
export async function approveMembership(
  client: PoolClient, tenantId: string, m: MembershipRow, ctx: RequestCtx, opts: { skipApplicantNotice?: boolean } = {},
) {
  const head = await liveHead(client, m.unit_id)
  const person = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
  const unit = await getUnitOr404(client, m.unit_id)
  let status: 'active' | 'pending_head'
  if (head && head.user_id !== m.user_id) {
    status = 'pending_head'
    await client.query(`UPDATE residency.memberships SET status = 'pending_head', role = 'adult', title = NULL, updated_at = now() WHERE id = $1`, [m.id])
    await notify(client, tenantId, { person: head.user_id }, {
      kind: 'join_request_head',
      title: 'درخواست عضویت در خانوار شما',
      body: `${person.name} می‌خواهد به واحد ${fa(unit.unit_number)} اضافه شود`,
      link: '/resident/family',
      ref: m.id,
    })
  } else {
    status = 'active'
    await client.query(
      `UPDATE residency.memberships SET status = 'active', role = 'head', title = $2, pays_charge = true, updated_at = now() WHERE id = $1`,
      [m.id, ROLE_LABEL.head],
    )
    if (m.residency === 'owner') await client.query(`UPDATE property.units SET owner_user_id = $2 WHERE id = $1`, [m.unit_id, m.user_id])
  }
  if (!opts.skipApplicantNotice) {
    await notify(client, tenantId, { person: m.user_id }, {
      kind: 'join_approved',
      title: status === 'active' ? `عضویت شما در واحد ${fa(unit.unit_number)} تأیید شد` : 'مدیر تأیید کرد؛ منتظر تأیید سرپرست واحد',
      ref: m.id,
    })
  }
  await writeAudit(client, tenantId, ctx, 'join_request.approved', {
    summary: `درخواست ${person.name} برای واحد ${unit.unit_number} تأیید شد${status === 'pending_head' ? ' (منتظر سرپرست)' : ''}`,
    subject_user_id: m.user_id,
    membership_id: m.id,
    after: { status },
  })
  return { id: m.id, status, name: person.name, unit_no: unit.unit_number }
}

export async function rejectMembership(client: PoolClient, tenantId: string, m: MembershipRow, reason: string | undefined, ctx: RequestCtx, by: string) {
  await client.query(
    `UPDATE residency.memberships SET status = 'ended', ended_at = now(), end_date = GREATEST(start_date, CURRENT_DATE), updated_at = now(),
            settings = settings || jsonb_build_object('rejected_by', $2::text, 'reject_reason', $3::text)
      WHERE id = $1`,
    [m.id, by, reason ?? null],
  )
  await client.query(`UPDATE residency.invites SET revoked_at = now() WHERE membership_id = $1 AND used_at IS NULL`, [m.id])
  const p = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
  await notify(client, tenantId, { person: m.user_id }, {
    kind: 'join_rejected',
    title: 'درخواست عضویت شما رد شد',
    body: reason ?? null,
    ref: m.id,
  })
  await writeAudit(client, tenantId, ctx, 'join_request.rejected', {
    summary: `درخواست ${p.name} رد شد (${by})${reason ? ': ' + reason : ''}`,
    subject_user_id: m.user_id,
    membership_id: m.id,
  })
}

/** خواندن ردیف‌ها از xlsx یا csv؛ شماره‌ی ردیف همان شماره‌ی ردیف اکسل است (سرتیتر = ۱) */
async function readRows(file: { originalname: string; buffer: Buffer; mimetype: string }) {
  const out: { row: number; cells: unknown[] }[] = []
  if (/\.csv$/i.test(file.originalname) || file.mimetype === 'text/csv') {
    const lines = file.buffer.toString('utf8').replace(/^﻿/, '').split(/\r?\n/)
    lines.forEach((line, i) => {
      if (i === 0 || !line.trim()) return
      out.push({ row: i + 1, cells: line.split(',').map((c) => c.replace(/^"|"$/g, '')) })
    })
    return out
  }
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer)
  } catch {
    throw new BadRequestException('فایل اکسل قابل خواندن نیست؛ از قالب آماده استفاده کنید')
  }
  const ws = wb.worksheets[0]
  if (!ws) return out
  ws.eachRow({ includeEmpty: false }, (r, n) => {
    if (n === 1) return
    const cells: unknown[] = []
    for (let i = 1; i <= IMPORT_COLUMNS.length; i++) {
      const v = r.getCell(i).value as unknown
      cells.push(v && typeof v === 'object' && 'text' in (v as object) ? (v as { text: string }).text : v instanceof Date ? v.toISOString().slice(0, 10) : v)
    }
    out.push({ row: n, cells })
  })
  return out
}

