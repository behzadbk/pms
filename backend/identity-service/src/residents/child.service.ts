import { ForbiddenException, HttpException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'
import { RequestCtx, notify, writeAudit } from './context'
import { MembershipRow, childCredit, debtorState, getMembershipOr404, myMembership, personOf, unitGuardians } from './residency.repo'
import {
  ModuleKey,
  ModuleLevel,
  ModuleMap,
  applyDebtorLocks,
  childPermissionMap,
  decideChildPurchase,
  faMoney,
  roleMatrix,
} from './residents.constants'
import type { ChildRequestDto, FamilyCodeLoginDto } from './dto/residents.dto'

const TYPE_MODULE: Record<string, ModuleKey> = { order: 'food', amenity: 'amenity', guest: 'guest', ticket: 'ticket' }

/** ۴۲۳ — ساعت سکوت؛ فرانت با code صفحه‌ی «الان وقت استراحت است» را نشان می‌دهد */
export class QuietHoursException extends HttpException {
  constructor(q: { from: string; to: string } | null) {
    super(
      { statusCode: 423, code: 'quiet_hours', message: `سفارش و رزرو از ساعت ${q?.from ?? '۲۲'} تا ${q?.to ?? '۷'} بسته است`, quiet_hours: q },
      423,
    )
  }
}

/** ۴۰۳ — بخش برای واحد بدهکار بسته است (قوانین برج)؛ فرانت با code صفحه‌ی «قفل بدهکاری» را نشان می‌دهد */
export class DebtorRestrictedException extends HttpException {
  constructor(section: string) {
    const label = ({ food: 'سفارش غذا', guest: 'کارت مهمان', amenity: 'رزرو مشاعات' } as Record<string, string>)[section] ?? 'این بخش'
    super({ statusCode: 403, code: 'debtor_restricted', message: `${label} برای واحد شما به‌علت معوقه‌ی شارژ بسته است؛ پس از تسویه باز می‌شود.` }, 403)
  }
}

@Injectable()
export class ChildService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly jwt: JwtService,
  ) {}

  /* ───────────── ورود کودک با کد/QR خانواده ───────────── */

  async familyCodeLogin(dto: FamilyCodeLoginDto) {
    if (!dto.code && !dto.qr_token) throw new UnauthorizedException('کد ورود را وارد کنید')
    const tenant = await this.db.withPlatformAccess(async (c) =>
      (await c.query<{ id: string; status: string; name: string }>(`SELECT id, status, name FROM identity.tenants WHERE subdomain = $1`, [dto.tenantSubdomain])).rows[0],
    )
    if (!tenant || tenant.status === 'suspended' || tenant.status === 'cancelled') throw new UnauthorizedException('مجتمع یافت نشد یا غیرفعال است')

    return this.db.withTenant(tenant.id, async (client) => {
      // یک‌بارمصرف: همان UPDATE که used_at را می‌زند، کد را «مصرف» می‌کند (بدون race)
      const code = (await client.query<{ membership_id: string }>(
        `UPDATE residency.family_login_codes SET used_at = now()
          WHERE id = (SELECT id FROM residency.family_login_codes
                       WHERE ${dto.qr_token ? 'qr_token = $1' : 'code = $1'} AND used_at IS NULL AND expires_at > now()
                       ORDER BY created_at DESC LIMIT 1 FOR UPDATE)
          RETURNING membership_id`,
        [dto.qr_token ?? dto.code],
      )).rows[0]
      if (!code) throw new UnauthorizedException('کد نامعتبر یا منقضی شده است')
      const m = await getMembershipOr404(client, code.membership_id)
      const p = (await client.query<{ id: string; name: string; status: string }>(`SELECT id, name, status FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
      if (m.status !== 'active' || p.status !== 'active') throw new UnauthorizedException('این حساب فعال نیست')
      await writeAudit(client, tenant.id, null, 'family_code.used', { summary: `${p.name} با کد خانواده وارد شد`, member_user_id: p.id, membership_id: m.id })
      const payload = { sub: p.id, pid: p.id, tenant_id: tenant.id, role: 'child', email: null as string | null, kind: 'family' as const, mid: m.id }
      return {
        accessToken: this.jwt.sign({ ...payload, typ: 'access' }, { expiresIn: '15m' }),
        refreshToken: this.jwt.sign({ ...payload, typ: 'refresh' }, { expiresIn: '90d' }),
        user: { id: p.id, fullName: p.name, role: 'child', tenantId: tenant.id, membershipId: m.id },
      }
    })
  }

  /** عضویت کودکِ پشت توکن (نشست خانواده یا کودکی که با موبایل خودش وارد شده) */
  private async childMembership(client: PoolClient, user: JwtPayload): Promise<MembershipRow | null> {
    if (user.kind === 'family' && user.mid) {
      const m = await getMembershipOr404(client, user.mid)
      if (m.status !== 'active') throw new UnauthorizedException('دسترسی این حساب قطع شده است')
      return m
    }
    const pid = await personOf(client, user)
    if (!pid) return null
    const m = await myMembership(client, pid)
    return m?.role === 'child' ? m : null
  }

  /* ───────────── GET /me/permissions ───────────── */

  async permissions(user: JwtPayload, unitId?: string) {
    if (!user.tenant_id) return { kind: 'platform', modules: roleMatrix('head') }
    return this.db.withTenant(user.tenant_id, async (client) => {
      if (!['resident', 'child'].includes(user.role)) {
        return { kind: 'staff', role: user.role, modules: roleMatrix('head'), quiet: { active: false, hours: null }, emergency: true }
      }
      const child = await this.childMembership(client, user)
      if (child) return this.childPermissions(client, child)
      if (user.role === 'child') throw new UnauthorizedException('نشست کودک نامعتبر است')

      const pid = await personOf(client, user)
      const memberships = pid
        ? (await client.query<{ id: string; unit_id: string; unit_no: string; role: string }>(
          `SELECT m.id, m.unit_id, u.unit_number AS unit_no, m.role FROM residency.memberships m JOIN property.units u ON u.id = m.unit_id
            WHERE m.user_id = $1 AND m.status = 'active' ORDER BY (m.role = 'head') DESC, m.created_at`, [pid])).rows
        : []
      const m = pid ? await myMembership(client, pid, unitId) : null
      if (!m) {
        // ساکنی که هنوز به واحدی وصل نشده (حساب‌های قدیمی): همه‌چیز جز مدیریت خانوار
        return { kind: 'resident', role: null, membership_id: null, unit: null, units: memberships, modules: { ...roleMatrix('adult') }, quiet: { active: false, hours: null }, emergency: true, easy_mode: false }
      }
      const unit = (await client.query<{ unit_number: string; floor: number | null }>(`SELECT unit_number, floor FROM property.units WHERE id = $1`, [m.unit_id])).rows[0]
      const kind = m.role === 'caregiver' ? 'caregiver' : m.role === 'owner_absent' ? 'owner_absent' : 'resident'
      const debt = await debtorState(client, m.unit_id)
      return {
        kind,
        role: m.role,
        membership_id: m.id,
        unit: { id: m.unit_id, no: unit.unit_number, floor: unit.floor },
        units: memberships,
        modules: applyDebtorLocks(roleMatrix(m.role, { financeAccess: (m.settings as { finance_access?: boolean }).finance_access }), debt.modules),
        debtor: debt.is_debtor ? { overdue_days: debt.overdue_days, amount: debt.amount, grace_days: debt.grace_days } : null,
        locked_amenities: debt.amenities,
        quiet: { active: false, hours: null },
        emergency: m.role !== 'owner_absent',
        easy_mode: m.role === 'senior' && (m.settings as { easy_mode?: boolean }).easy_mode !== false,
        access_ends: m.role === 'caregiver' ? m.end_date : null,
      }
    })
  }

  private async childPermissions(client: PoolClient, m: MembershipRow) {
    const pc = (await client.query<{ modules: ModuleMap; quiet_hours: { from: string; to: string } | null; exit_lock: boolean; preset: string; monthly_cap: string }>(
      `SELECT modules, quiet_hours, exit_lock, preset, monthly_cap FROM residency.parent_controls WHERE membership_id = $1`, [m.id])).rows[0]
    const quiet = (await client.query<{ q: boolean }>(`SELECT residency.in_quiet_hours($1) AS q`, [m.id])).rows[0].q
    const unit = (await client.query<{ unit_number: string; floor: number | null }>(`SELECT unit_number, floor FROM property.units WHERE id = $1`, [m.unit_id])).rows[0]
    const person = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]
    const guardians = await unitGuardians(client, m.unit_id)
    const head = (await client.query<{ name: string; title: string | null }>(
      `SELECT p.name, hm.title FROM residency.memberships hm JOIN residency.users p ON p.id = hm.user_id
        WHERE hm.unit_id = $1 AND hm.role = 'head' AND hm.status = 'active'`, [m.unit_id])).rows[0]
    const pending = (await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM residency.child_requests WHERE child_membership_id = $1 AND status = 'pending' AND expires_at > now()`, [m.id])).rows[0].n
    const debt = await debtorState(client, m.unit_id)
    return {
      kind: 'child',
      role: 'child',
      name: person.name,
      membership_id: m.id,
      unit: { id: m.unit_id, no: unit.unit_number, floor: unit.floor },
      preset: pc?.preset ?? 'u7',
      modules: applyDebtorLocks(childPermissionMap(pc?.modules ?? {}), debt.modules),
      debtor: debt.is_debtor ? { overdue_days: debt.overdue_days, amount: debt.amount, grace_days: debt.grace_days } : null,
      locked_amenities: debt.amenities,
      levels: pc?.modules ?? {},
      quiet: { active: quiet, hours: pc?.quiet_hours ?? null },
      credit: await childCredit(client, m.id),
      exit_lock: pc?.exit_lock ?? true,
      emergency: true,
      guardians: guardians.length,
      parent_name: head?.name ?? null,
      pending_requests: pending,
    }
  }

  /* ───────────── درخواست/خرید کودک ───────────── */

  async createRequest(user: JwtPayload, dto: ChildRequestDto, ctx: RequestCtx) {
    const out = await this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await this.childMembership(client, user)
      if (!m) throw new ForbiddenException('این بخش فقط برای حساب کودک است')
      const pc = (await client.query<{ modules: ModuleMap; quiet_hours: { from: string; to: string } | null }>(
        `SELECT modules, quiet_hours FROM residency.parent_controls WHERE membership_id = $1`, [m.id])).rows[0]
      const level = ((pc?.modules ?? {})[TYPE_MODULE[dto.type]] ?? 0) as ModuleLevel
      if (level === 0) throw new ForbiddenException('این بخش برای تو فعال نیست')
      const lockedModule = TYPE_MODULE[dto.type]
      if (['food', 'guest', 'amenity'].includes(lockedModule)) {
        const lock = (await client.query<{ r: boolean }>(`SELECT residency.unit_restricted($1, $2) AS r`, [m.unit_id, `module:${lockedModule}`])).rows[0].r
        if (lock) throw new DebtorRestrictedException(lockedModule)
      }
      const quiet = (await client.query<{ q: boolean }>(`SELECT residency.in_quiet_hours($1) AS q`, [m.id])).rows[0].q
      if (quiet && (dto.type === 'order' || dto.type === 'amenity')) throw new QuietHoursException(pc?.quiet_hours ?? null)

      const amount = dto.type === 'order' ? Math.max(0, Math.round(dto.amount ?? 0)) : 0
      const credit = await childCredit(client, m.id)
      const decision = dto.type === 'order' ? decideChildPurchase(level, amount, credit.remaining) : level === 1 ? { kind: 'request' as const, reason: 'approval' as const } : { kind: 'direct' as const }
      const person = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [m.user_id])).rows[0]

      if (decision.kind === 'direct') {
        if (dto.type === 'order') {
          await client.query(
            `INSERT INTO residency.child_spend (tenant_id, child_membership_id, unit_id, amount, type, description)
             VALUES ($1, $2, $3, $4, 'order', $5)`,
            [user.tenant_id, m.id, m.unit_id, amount, String(dto.payload?.venue ?? 'سفارش')],
          )
          await writeAudit(client, user.tenant_id!, ctx, 'child.purchase', {
            summary: `${person.name} سفارش ${faMoney(amount)} تومانی ثبت کرد (از سقف ماهانه)`,
            member_user_id: m.user_id, membership_id: m.id, amount,
          })
        }
        // سفارش مستقیم «ثبت شد»؛ برای رزرو/مهمان/تیکتِ «آزاد» یعنی «مجاز است» و اپ مسیر عادی همان بخش را ادامه می‌دهد
        return { status: (dto.type === 'order' ? 'placed' : 'allowed') as 'placed' | 'allowed', type: dto.type, amount, unit_id: m.unit_id, payload: dto.payload ?? {}, credit: await childCredit(client, m.id) }
      }
      if (decision.kind === 'forbidden') throw new ForbiddenException('این بخش برای تو فعال نیست')

      // قاعده ۸: درخواست ۳۰ دقیقه‌ای برای سرپرست و بزرگسالان واحد
      await client.query(
        `UPDATE residency.child_requests SET status = 'expired' WHERE child_membership_id = $1 AND status = 'pending' AND expires_at <= now()`, [m.id])
      const req = (await client.query<{ id: string; expires_at: string }>(
        `INSERT INTO residency.child_requests (tenant_id, child_membership_id, type, payload, amount, reason)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, expires_at`,
        [user.tenant_id, m.id, dto.type, JSON.stringify(dto.payload ?? {}), dto.type === 'order' ? amount : null, decision.reason],
      )).rows[0]
      const guardians = await unitGuardians(client, m.unit_id)
      const title = { order: 'می‌خواهد سفارش بدهد', amenity: 'می‌خواهد رزرو کند', guest: 'کارت ورود مهمان می‌خواهد', ticket: 'می‌خواهد درخواست تعمیر ثبت کند' }[dto.type]
      await notify(client, user.tenant_id!, guardians.map((g) => ({ person: g })), {
        kind: 'child_request',
        title: `${person.name} ${title}`,
        body: dto.type === 'order'
          ? `${faMoney(amount)} تومان${decision.reason === 'over_cap' ? ` · ${faMoney(amount - credit.remaining)} تومان بیشتر از مانده‌ی سقف این ماه (${faMoney(credit.remaining)})` : ''}`
          : null,
        link: `/resident/family/requests/${req.id}`,
        ref: req.id,
      })
      await writeAudit(client, user.tenant_id!, ctx, 'child_request.created', {
        summary: `${person.name} درخواست «${dto.type}» فرستاد${amount ? ` (${faMoney(amount)} تومان)` : ''}`,
        member_user_id: m.user_id, membership_id: m.id, request_id: req.id, reason: decision.reason, amount,
      })
      return { status: 'pending' as const, type: dto.type, request: { id: req.id, expires_at: req.expires_at, reason: decision.reason }, amount, unit_id: m.unit_id, payload: dto.payload ?? {}, credit }
    })
    if (out.status === 'placed' && out.type === 'order') {
      this.events.publish('child.order_placed', { unitId: out.unit_id, amount: out.amount, payload: out.payload }, user.tenant_id)
    }
    if (out.status === 'pending') {
      this.events.publish('child_request.created', { requestId: out.request!.id, unitId: out.unit_id }, user.tenant_id)
    }
    return out
  }

  async myRequests(user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await this.childMembership(client, user)
      if (!m) throw new ForbiddenException('این بخش فقط برای حساب کودک است')
      await client.query(`UPDATE residency.child_requests SET status = 'expired' WHERE child_membership_id = $1 AND status = 'pending' AND expires_at <= now()`, [m.id])
      const res = await client.query(
        `SELECT id, type, payload, amount, reason, status, expires_at, created_at, decided_at FROM residency.child_requests
          WHERE child_membership_id = $1 ORDER BY created_at DESC LIMIT 20`, [m.id])
      return res.rows.map((r) => ({ ...r, amount: r.amount === null ? null : Number(r.amount) }))
    })
  }

  /* ───────────── قفل خروج ───────────── */

  async exitUnlock(user: JwtPayload, pin: string) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const m = await this.childMembership(client, user)
      if (!m) return { ok: true }
      const pc = (await client.query<{ exit_lock: boolean; exit_pin_hash: string | null }>(
        `SELECT exit_lock, exit_pin_hash FROM residency.parent_controls WHERE membership_id = $1`, [m.id])).rows[0]
      if (!pc?.exit_lock) return { ok: true }
      if (!pc.exit_pin_hash) throw new ForbiddenException('رمز والد تنظیم نشده است؛ از بابا یا مامان بخواهید در «حالت والدین» رمز بگذارند')
      if (!(await bcrypt.compare(pin, pc.exit_pin_hash))) throw new ForbiddenException('رمز والد درست نیست')
      return { ok: true }
    })
  }

  /* ───────────── تماس اضطراری (قاعده ۱۱: همیشه، برای همه) ───────────── */

  async emergency(user: JwtPayload, ctx: RequestCtx) {
    if (!user.tenant_id) throw new NotFoundException('ساختمانی به حساب شما وصل نیست')
    return this.db.withTenant(user.tenant_id, async (client) => {
      const pid = user.role === 'resident' || user.role === 'child' ? await personOf(client, user) : null
      const who = pid ? (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [pid])).rows[0]?.name : null
      const m = pid ? await myMembership(client, pid) : null
      const unit = m ? (await client.query<{ unit_number: string }>(`SELECT unit_number FROM property.units WHERE id = $1`, [m.unit_id])).rows[0] : null
      await notify(client, user.tenant_id!, [{ role: 'guard' }, { role: 'perm:security' }, { role: 'admin' }], {
        kind: 'emergency',
        title: 'تماس اضطراری',
        body: `${who ?? 'کاربر'}${unit ? ' · واحد ' + unit.unit_number : ''}`,
        ref: pid,
      })
      await writeAudit(client, user.tenant_id!, ctx, 'emergency.call', { summary: `تماس اضطراری از ${who ?? user.role}`, member_user_id: pid, unit_no: unit?.unit_number ?? null })
      const t = (await client.query<{ manager_phone: string | null }>(`SELECT manager_phone FROM identity.tenants WHERE id = $1`, [user.tenant_id])).rows[0]
      this.events.publish('emergency.call', { unitNo: unit?.unit_number ?? null, userId: pid }, user.tenant_id)
      return { ok: true, guard_phone: process.env.GUARD_PHONE ?? t?.manager_phone ?? null }
    })
  }

  /* ───────────── اعلان‌های داخل برنامه ───────────── */

  private recipients(user: JwtPayload, pid: string | null) {
    const roles = [user.role, ...(user.perms ?? []).map((p) => 'perm:' + p)]
    return { pid, login: user.kind === 'family' ? null : user.sub, roles }
  }

  async notifications(user: JwtPayload) {
    if (!user.tenant_id) return { unread: 0, items: [] }
    return this.db.withTenant(user.tenant_id, async (client) => {
      const pid = await personOf(client, user).catch(() => null)
      const r = this.recipients(user, pid)
      const reader = pid ?? user.sub
      const res = await client.query<{ id: string; kind: string; title: string; body: string | null; link: string | null; ref_id: string | null; created_at: string; read: boolean }>(
        `SELECT n.id, n.kind, n.title, n.body, n.link, n.ref_id, n.created_at,
                (n.read_at IS NOT NULL OR EXISTS (SELECT 1 FROM notification.inbox_reads x WHERE x.inbox_id = n.id AND x.reader = $4)) AS read
           FROM notification.inbox n
          WHERE ($1::uuid IS NOT NULL AND n.recipient_person = $1)
             OR ($2::uuid IS NOT NULL AND n.recipient_login = $2)
             OR n.recipient_role = ANY($3)
          ORDER BY n.created_at DESC LIMIT 60`,
        [r.pid, r.login, r.roles, reader],
      )
      return { unread: res.rows.filter((x) => !x.read).length, items: res.rows }
    })
  }

  async markRead(user: JwtPayload, id: string | 'all') {
    if (!user.tenant_id) return { ok: true }
    return this.db.withTenant(user.tenant_id, async (client) => {
      const pid = await personOf(client, user).catch(() => null)
      const r = this.recipients(user, pid)
      const reader = pid ?? user.sub
      await client.query(
        `INSERT INTO notification.inbox_reads (inbox_id, tenant_id, reader)
         SELECT n.id, n.tenant_id, $4 FROM notification.inbox n
          WHERE ($5::uuid IS NULL OR n.id = $5)
            AND (($1::uuid IS NOT NULL AND n.recipient_person = $1) OR ($2::uuid IS NOT NULL AND n.recipient_login = $2) OR n.recipient_role = ANY($3))
         ON CONFLICT DO NOTHING`,
        [r.pid, r.login, r.roles, reader, id === 'all' ? null : id],
      )
      return { ok: true }
    })
  }
}

