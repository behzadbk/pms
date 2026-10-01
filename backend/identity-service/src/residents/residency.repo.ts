import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { randomBytes, randomInt } from 'crypto'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'
import { normalizeNationalId, normalizePhone } from './phone'

/**
 * کوئری‌های مشترک ماژول ساکنین. همه با client داخل withTenant اجرا می‌شوند؛
 * RLS تضمین می‌کند عضویت/واحد tenant دیگر دیده نشود. فقط residency.users سطح پلتفرم است.
 */

export interface PersonInput {
  phone?: string | null
  name?: string | null
  national_id?: string | null
  birth_year?: number | null
}

export interface PersonRow {
  id: string
  phone: string | null
  name: string
  national_id: string | null
  birth_year: number | null
  status: string
}

/** قاعده ۱: یک موبایل = یک حساب. اگر شماره وجود دارد همان شخص برمی‌گردد (نامش بی‌صدا عوض نمی‌شود). */
export async function upsertPerson(client: PoolClient, input: PersonInput, opts: { requirePhone?: boolean } = {}): Promise<PersonRow> {
  const phone = input.phone ? normalizePhone(input.phone) : null
  if (input.phone && !phone) throw new BadRequestException('شماره موبایل نامعتبر است')
  if (opts.requirePhone && !phone) throw new BadRequestException('شماره موبایل لازم است')
  const nid = normalizeNationalId(input.national_id)
  if (nid && !/^\d{10}$/.test(nid)) throw new BadRequestException('کد ملی باید ۱۰ رقم باشد')
  const name = (input.name ?? '').trim()

  if (phone) {
    const found = await client.query<PersonRow>(
      `SELECT id, phone, name, national_id, birth_year, status FROM residency.users WHERE phone = $1`,
      [phone],
    )
    const p = found.rows[0]
    if (p) {
      if (p.status === 'blocked') throw new ForbiddenException('این حساب توسط پشتیبانی مسدود شده است')
      if (p.status === 'merged') throw new ConflictException('این حساب با حساب دیگری ادغام شده است')
      // تکمیل فیلدهای خالی — بدون بازنویسی اطلاعاتی که قبلاً ثبت شده
      const upd = await client.query<PersonRow>(
        `UPDATE residency.users
            SET national_id = COALESCE(national_id, $2),
                birth_year  = COALESCE(birth_year, $3),
                name        = CASE WHEN name = 'دعوت‌شده' AND $4 <> '' THEN $4 ELSE name END,
                updated_at  = now()
          WHERE id = $1
        RETURNING id, phone, name, national_id, birth_year, status`,
        [p.id, nid, input.birth_year ?? null, name],
      )
      return upd.rows[0]
    }
  }
  if (!name) throw new BadRequestException('نام و نام خانوادگی لازم است')
  const res = await client.query<PersonRow>(
    `INSERT INTO residency.users (phone, name, national_id, birth_year)
     VALUES ($1, $2, $3, $4) RETURNING id, phone, name, national_id, birth_year, status`,
    [phone, name, nid, input.birth_year ?? null],
  )
  return res.rows[0]
}

export interface UnitRow {
  id: string
  tenant_id: string
  unit_number: string
  floor: number | null
  area_sqm: string | null
  parking_count: number
  storage_no: string | null
  owner_user_id: string | null
  occupancy: 'vacant' | 'owner' | 'tenant'
}

export async function getUnitOr404(client: PoolClient, unitId: string): Promise<UnitRow> {
  const res = await client.query<UnitRow>(
    `SELECT id, tenant_id, unit_number, floor, area_sqm, parking_count, storage_no, owner_user_id, occupancy
       FROM property.units WHERE id = $1`,
    [unitId],
  )
  if (!res.rows[0]) throw new NotFoundException('واحد یافت نشد')
  return res.rows[0]
}

export async function liveHead(client: PoolClient, unitId: string) {
  const res = await client.query<{ id: string; user_id: string; name: string }>(
    `SELECT m.id, m.user_id, u.name FROM residency.memberships m JOIN residency.users u ON u.id = m.user_id
      WHERE m.unit_id = $1 AND m.role = 'head' AND m.status IN ('invited', 'active') LIMIT 1`,
    [unitId],
  )
  return res.rows[0] ?? null
}

/** بزرگسالان فعال واحد (سرپرست + بزرگسال + سالمند) — گیرنده‌ی درخواست‌های کودک (قاعده ۸) */
export async function unitGuardians(client: PoolClient, unitId: string): Promise<string[]> {
  const res = await client.query<{ user_id: string }>(
    `SELECT user_id FROM residency.memberships
      WHERE unit_id = $1 AND status = 'active' AND role IN ('head', 'adult', 'senior')`,
    [unitId],
  )
  return res.rows.map((r) => r.user_id)
}

/** توکن دعوت ۷ روزه؛ ارسال دوباره = توکن جدید و باطل شدن قبلی (قاعده ۵) */
export async function issueInvite(client: PoolClient, tenantId: string, membershipId: string, channel: string) {
  await client.query(
    `UPDATE residency.invites SET revoked_at = now() WHERE membership_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
    [membershipId],
  )
  const token = randomBytes(18).toString('base64url')
  const res = await client.query<{ id: string; token: string; expires_at: string }>(
    `INSERT INTO residency.invites (tenant_id, membership_id, token, channel)
     VALUES ($1, $2, $3, $4) RETURNING id, token, expires_at`,
    [tenantId, membershipId, token, channel],
  )
  return res.rows[0]
}

/**
 * باطل کردن نشست‌ها: توکن‌های صادرشده قبل از این لحظه دیگر تمدید/پذیرفته نمی‌شوند.
 * اگر شخص در این tenant دیگر عضویت زنده‌ای ندارد، حساب ورودش در این مجتمع هم غیرفعال می‌شود.
 */
export async function revokeSessions(client: PoolClient, personIds: string[]) {
  if (!personIds.length) return
  await client.query(`UPDATE residency.users SET sessions_valid_after = now(), updated_at = now() WHERE id = ANY($1)`, [personIds])
  await client.query(
    `UPDATE identity.users u
        SET sessions_valid_after = now(),
            is_active = CASE WHEN EXISTS (
                          SELECT 1 FROM residency.memberships m
                           WHERE m.user_id = u.person_id AND m.status IN ('invited', 'active'))
                        THEN u.is_active ELSE false END,
            updated_at = now()
      WHERE u.person_id = ANY($1) AND u.role = 'resident'`,
    [personIds],
  )
}

/** شخصِ پشت توکن فعلی (ساکن: از حساب ورود؛ کودک: خود توکن) */
export async function personOf(client: PoolClient, user: JwtPayload): Promise<string | null> {
  if (user.kind === 'family') return user.sub
  if (user.pid) return user.pid
  const res = await client.query<{ person_id: string | null }>(`SELECT person_id FROM identity.users WHERE id = $1`, [user.sub])
  return res.rows[0]?.person_id ?? null
}

export interface MembershipRow {
  id: string
  tenant_id: string
  user_id: string
  unit_id: string
  role: string
  residency: string
  pays_charge: boolean
  start_date: string
  end_date: string | null
  status: string
  invited_by: string | null
  channel: string
  title: string | null
  settings: Record<string, unknown>
  created_at: string
}

export const MEMBERSHIP_COLS = `m.id, m.tenant_id, m.user_id, m.unit_id, m.role, m.residency, m.pays_charge,
  to_char(m.start_date, 'YYYY-MM-DD') AS start_date, to_char(m.end_date, 'YYYY-MM-DD') AS end_date,
  m.status, m.invited_by, m.channel, m.title, m.settings, m.created_at`

/** عضویت فعال این شخص؛ اگر چند واحد دارد و unitId داده نشده، اولی (سرپرستی مقدم) */
export async function myMembership(client: PoolClient, personId: string, unitId?: string | null): Promise<MembershipRow | null> {
  const res = await client.query<MembershipRow>(
    `SELECT ${MEMBERSHIP_COLS} FROM residency.memberships m
      WHERE m.user_id = $1 AND m.status = 'active' ${unitId ? 'AND m.unit_id = $2' : ''}
      ORDER BY (m.role = 'head') DESC, m.created_at LIMIT 1`,
    unitId ? [personId, unitId] : [personId],
  )
  return res.rows[0] ?? null
}

export async function getMembershipOr404(client: PoolClient, id: string): Promise<MembershipRow> {
  const res = await client.query<MembershipRow>(`SELECT ${MEMBERSHIP_COLS} FROM residency.memberships m WHERE m.id = $1`, [id])
  if (!res.rows[0]) throw new NotFoundException('عضویت یافت نشد')
  return res.rows[0]
}

/** اعتبار ماهانه‌ی کودک (ماه شمسی تقریب نمی‌شود؛ ماه تقویمی به وقت تهران) */
export async function childCredit(client: PoolClient, membershipId: string) {
  const res = await client.query<{ cap: string; spent: string }>(
    `SELECT pc.monthly_cap AS cap,
            COALESCE((SELECT sum(amount) FROM residency.child_spend s
                       WHERE s.child_membership_id = pc.membership_id
                         AND s.created_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'Asia/Tehran')), 0) AS spent
       FROM residency.parent_controls pc WHERE pc.membership_id = $1`,
    [membershipId],
  )
  const cap = Number(res.rows[0]?.cap ?? 0)
  const spent = Number(res.rows[0]?.spent ?? 0)
  return { cap, spent, remaining: Math.max(0, cap - spent) }
}

/** کد ۶ رقمی یکتا میان کدهای زنده‌ی همین مجتمع */
export async function freshFamilyCode(client: PoolClient): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const taken = await client.query(
      `SELECT 1 FROM residency.family_login_codes WHERE code = $1 AND used_at IS NULL AND expires_at > now()`,
      [code],
    )
    if (!taken.rowCount) return code
  }
  throw new ConflictException('ساخت کد ورود ممکن نشد؛ دوباره تلاش کنید')
}
