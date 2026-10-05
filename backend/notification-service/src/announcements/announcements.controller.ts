import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsISO8601, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { randomUUID } from 'crypto'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s)
const fa = (s: string | number) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

const ROLE_KEYS = [
  { key: 'all_residents', label: 'همه‌ی ساکنین', group: 'نقش' },
  { key: 'owners', label: 'فقط مالکین', group: 'نقش' },
  { key: 'tenants', label: 'فقط مستأجرین', group: 'نقش' },
  { key: 'staff', label: 'پرسنل / استف', group: 'نقش' },
  { key: 'guard', label: 'نگهبانی', group: 'نقش' },
  { key: 'accountant', label: 'حسابداری', group: 'نقش' },
]
const STATIC_KEYS = new Set(ROLE_KEYS.map((r) => r.key))

class OptionDto {
  @IsString() @MinLength(1) @MaxLength(200) label: string
}
class QuestionDto {
  @IsString() @MinLength(2) @MaxLength(300) text: string
  @IsOptional() @IsBoolean() multi?: boolean
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => OptionDto) options: OptionDto[]
}
export class PublishDto {
  @IsIn(['announcement', 'poll']) kind: string
  @IsString() @MinLength(2) @MaxLength(200) title: string
  @IsOptional() @IsString() @MaxLength(5000) body?: string
  @IsOptional() @IsBoolean() emergency?: boolean
  @IsOptional() @IsBoolean() pinned?: boolean
  /** all_residents | owners | tenants | staff | guard | accountant | building:<uuid> | unit:<uuid> */
  @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) audience: string[]
  /** شماره‌ی واحدهای مشخص (به‌جای unit:<uuid>) */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) units?: string[]
  @IsOptional() @IsISO8601() closes_at?: string
  @IsOptional() @IsISO8601() expires_at?: string
  @IsOptional() @IsBoolean() weighted?: boolean
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => QuestionDto) questions?: QuestionDto[]
}
export class PatchDto {
  @IsOptional() @IsBoolean() pinned?: boolean
  /** بستن فوری نظرسنجی */
  @IsOptional() @IsBoolean() close_now?: boolean
}
export class VoteDto {
  /** questionId → [optionId, …] */
  @IsObject()
  answers: Record<string, string[]>
}

interface Viewer { keys: string[]; voter: string | null; unitId: string | null; admin: boolean }

/**
 * اعلانات و نظرسنجی‌ها.
 *  • مدیر منتشر می‌کند؛ ردیف notification.inbox برای هر مخاطب نوشته می‌شود و Web Push خودکار می‌رود.
 *  • فید هر نقش فقط مواردی است که مخاطبش شامل آن کاربر باشد.
 *  • هر نفر (شخص یا حساب) برای هر نظرسنجی فقط یک رأی دارد (کلید اصلی poll_ballots).
 */
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly db: DatabaseService) {}

  /* ------------------------------ مخاطب‌ها ------------------------------ */

  private async viewer(client: PoolClient, jwt: JwtPayload): Promise<Viewer> {
    const user = jwt as JwtPayload & { mid?: string }
    if (user.role === 'admin') return { keys: [], voter: null, unitId: null, admin: true }
    if (user.role === 'resident' || user.role === 'child') {
      const q = user.kind === 'family' && user.mid
        ? await client.query(`SELECT user_id, unit_id, role, residency FROM residency.memberships WHERE id = $1 AND status = 'active'`, [user.mid])
        : await client.query(
          `SELECT m.user_id, m.unit_id, m.role, m.residency FROM residency.memberships m
            WHERE m.status = 'active' AND m.user_id = COALESCE($1::uuid, (SELECT person_id FROM identity.users WHERE id = $2))
            ORDER BY (m.role = 'head') DESC, m.created_at LIMIT 1`, [user.pid ?? null, isUuid(user.sub) ? user.sub : null])
      const m = q.rows[0]
      if (!m) return { keys: [], voter: user.pid ?? null, unitId: null, admin: false }
      const keys = ['all_residents']
      if (user.role !== 'child' && m.role !== 'child') {
        keys.push(m.residency === 'tenant' ? 'tenants' : 'owners', `unit:${m.unit_id}`)
        const b = (await client.query(`SELECT building_id FROM property.units WHERE id = $1`, [m.unit_id])).rows[0]
        if (b?.building_id) keys.push(`building:${b.building_id}`)
      }
      return { keys, voter: user.role === 'child' ? null : m.user_id, unitId: m.unit_id, admin: false }
    }
    const keys = [user.role, ...(user.perms ?? []).map((p) => `perm:${p}`)]
    return { keys, voter: isUuid(user.sub) ? user.sub : null, unitId: null, admin: false }
  }

  private async labels(client: PoolClient, rows: { audience: string[] }[]): Promise<Map<string, string>> {
    const map = new Map<string, string>(ROLE_KEYS.map((r) => [r.key, r.label]))
    const keys = new Set(rows.flatMap((r) => r.audience))
    const bIds = [...keys].filter((k) => k.startsWith('building:')).map((k) => k.slice(9)).filter(isUuid)
    const uIds = [...keys].filter((k) => k.startsWith('unit:')).map((k) => k.slice(5)).filter(isUuid)
    if (bIds.length) for (const r of (await client.query(`SELECT id, name FROM property.buildings WHERE id = ANY($1::uuid[])`, [bIds])).rows) map.set(`building:${r.id}`, r.name)
    if (uIds.length) for (const r of (await client.query(`SELECT id, unit_number FROM property.units WHERE id = ANY($1::uuid[])`, [uIds])).rows) map.set(`unit:${r.id}`, `واحد ${fa(r.unit_number)}`)
    return map
  }

  /** مجموعه‌ی مخاطب‌های قابل انتخاب برای مدیر: نقش‌ها + ساختمان/بلوک‌های واقعی */
  @Roles('admin')
  @Get('audiences')
  async audiences(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const b = (await client.query(`SELECT id, name FROM property.buildings ORDER BY name`)).rows
      return {
        groups: [
          ...ROLE_KEYS,
          ...(b.length > 1 ? b.map((x) => ({ key: `building:${x.id}`, label: x.name as string, group: 'بخش' })) : []),
        ],
      }
    })
  }

  /* ------------------------------- فید ------------------------------- */

  @Get()
  async feed(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const v = await this.viewer(client, user)
      const rows = (await client.query(
        `SELECT a.* FROM notification.announcements a
          WHERE ($1::boolean OR (a.audience && $2::text[] AND (a.expires_at IS NULL OR a.expires_at > now())))
          ORDER BY a.pinned DESC, a.emergency DESC, a.created_at DESC LIMIT 200`, [v.admin, v.keys])).rows
      return this.hydrate(client, rows, v)
    })
  }

  private async hydrate(client: PoolClient, rows: Record<string, any>[], v: Viewer) {
    if (!rows.length) return []
    const ids = rows.map((r) => r.id)
    const labels = await this.labels(client, rows as { audience: string[] }[])
    const qs = (await client.query(
      `SELECT q.id, q.announcement_id, q.text, q.multi FROM notification.poll_questions q WHERE q.announcement_id = ANY($1::uuid[]) ORDER BY q.position`, [ids])).rows
    const opts = (await client.query(
      `SELECT o.id, o.question_id, o.label,
              (SELECT count(*)::int FROM notification.poll_votes pv WHERE pv.option_id = o.id) AS votes,
              (SELECT COALESCE(sum(weight), 0)::float FROM notification.poll_votes pv WHERE pv.option_id = o.id) AS weight
         FROM notification.poll_options o JOIN notification.poll_questions q ON q.id = o.question_id
        WHERE q.announcement_id = ANY($1::uuid[]) ORDER BY o.position`, [ids])).rows
    const ballots = (await client.query(
      `SELECT announcement_id, count(*)::int AS n, COALESCE(sum(weight),0)::float AS w,
              bool_or(voter = $2::uuid) AS mine
         FROM notification.poll_ballots WHERE announcement_id = ANY($1::uuid[]) GROUP BY 1`, [ids, v.voter ?? randomUUID()])).rows
    const mine = v.voter
      ? (await client.query(`SELECT question_id, option_id FROM notification.poll_votes WHERE announcement_id = ANY($1::uuid[]) AND voter = $2`, [ids, v.voter])).rows
      : []
    return rows.map((a) => {
      const closed = !!a.closes_at && new Date(a.closes_at) <= new Date()
      const b = ballots.find((x) => x.announcement_id === a.id)
      const voted = !!b?.mine
      const eligible = a.kind === 'poll' && !v.admin && !!v.voter && a.audience.some((k: string) => v.keys.includes(k))
      const showResults = a.kind === 'poll' && (v.admin || voted || closed)
      return {
        id: a.id, kind: a.kind, title: a.title, body: a.body, emergency: a.emergency, pinned: a.pinned, weighted: a.weighted,
        audience: a.audience.map((k: string) => ({ key: k, label: labels.get(k) ?? k })),
        created_at: a.created_at, closes_at: a.closes_at, expires_at: a.expires_at, created_by_name: a.created_by_name,
        closed, voted, can_vote: eligible && !voted && !closed,
        participants: a.kind === 'poll' ? (b?.n ?? 0) : 0,
        total_weight: a.kind === 'poll' ? (b?.w ?? 0) : 0,
        results_visible: showResults,
        questions: qs.filter((q) => q.announcement_id === a.id).map((q) => ({
          id: q.id, text: q.text, multi: q.multi,
          my_answers: mine.filter((m) => m.question_id === q.id).map((m) => m.option_id),
          options: opts.filter((o) => o.question_id === q.id).map((o) => ({
            id: o.id, label: o.label, votes: showResults ? o.votes : null, weight: showResults ? o.weight : null,
          })),
        })),
      }
    })
  }

  /* ------------------------------- انتشار ------------------------------- */

  @Roles('admin')
  @Post()
  async publish(@CurrentUser() user: JwtPayload, @Body() dto: PublishDto) {
    const tenantId = user.tenant_id!
    if (dto.kind === 'poll' && !(dto.questions?.length)) throw new BadRequestException('نظرسنجی حداقل یک سؤال می‌خواهد')
    if (dto.kind === 'announcement' && !dto.body?.trim()) throw new BadRequestException('متن اعلان را بنویسید')
    for (const q of dto.questions ?? []) if (q.options.filter((o) => o.label.trim()).length < 2) throw new BadRequestException('هر سؤال حداقل دو گزینه می‌خواهد')
    if (dto.closes_at && new Date(dto.closes_at) <= new Date()) throw new BadRequestException('مهلت باید در آینده باشد')

    return this.db.withTenant(tenantId, async (client) => {
      // اعتبارسنجی و ساخت کلیدهای مخاطب
      const keys = new Set<string>()
      for (const k of dto.audience) {
        if (STATIC_KEYS.has(k)) keys.add(k)
        else if (k.startsWith('building:') && isUuid(k.slice(9)) && (await client.query(`SELECT 1 FROM property.buildings WHERE id = $1`, [k.slice(9)])).rowCount) keys.add(k)
        else if (k.startsWith('unit:') && isUuid(k.slice(5)) && (await client.query(`SELECT 1 FROM property.units WHERE id = $1`, [k.slice(5)])).rowCount) keys.add(k)
        else throw new BadRequestException(`مخاطب نامعتبر: ${k}`)
      }
      const missing: string[] = []
      for (const raw of dto.units ?? []) {
        const num = String(raw).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/^واحد\s*/, '').trim()
        if (!num) continue
        const u = (await client.query(`SELECT id FROM property.units WHERE unit_number = $1`, [num])).rows[0]
        if (u) keys.add(`unit:${u.id}`)
        else missing.push(num)
      }
      if (missing.length) throw new BadRequestException(`واحد یافت نشد: ${missing.map(fa).join('، ')}`)
      if (!keys.size) throw new BadRequestException('حداقل یک مخاطب انتخاب کنید')

      const who = (await client.query(`SELECT full_name FROM identity.users WHERE id = $1`, [user.sub])).rows[0]?.full_name ?? 'مدیر ساختمان'
      const a = (await client.query(
        `INSERT INTO notification.announcements (tenant_id, kind, title, body, emergency, pinned, audience, weighted, closes_at, expires_at, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [tenantId, dto.kind, dto.title.trim(), (dto.body ?? '').trim(), dto.kind === 'announcement' && !!dto.emergency, !!dto.pinned, [...keys],
          dto.kind === 'poll' && !!dto.weighted, dto.kind === 'poll' ? dto.closes_at ?? null : null, dto.expires_at ?? null, isUuid(user.sub) ? user.sub : null, who])).rows[0]
      if (dto.kind === 'poll') {
        let qi = 0
        for (const q of dto.questions!) {
          const qr = (await client.query(`INSERT INTO notification.poll_questions (tenant_id, announcement_id, position, text, multi) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [tenantId, a.id, qi++, q.text.trim(), !!q.multi])).rows[0]
          let oi = 0
          for (const o of q.options.filter((x) => x.label.trim())) {
            await client.query(`INSERT INTO notification.poll_options (tenant_id, question_id, position, label) VALUES ($1,$2,$3,$4)`, [tenantId, qr.id, oi++, o.label.trim()])
          }
        }
      }

      const sent = await this.fanOut(client, tenantId, a.id, dto, [...keys])
      await client.query(
        `INSERT INTO audit.event_logs (tenant_id, session_id, user_id, actor_role, source, level, action, request_body)
         VALUES ($1,$2,$3,'admin','notification-svc','info',$4,$5)`,
        [tenantId, randomUUID(), isUuid(user.sub) ? user.sub : null, dto.kind === 'poll' ? 'poll.publish' : 'announcement.publish', JSON.stringify({ id: a.id, audience: [...keys], recipients: sent })])
      return { id: a.id, recipients: sent }
    })
  }

  /** یک ردیف inbox برای هر نفر/نقش مخاطب — trigger دیتابیس و push-listener خودکار push می‌فرستند */
  private async fanOut(client: PoolClient, tenantId: string, id: string, dto: PublishDto, keys: string[]): Promise<number> {
    const title = dto.kind === 'poll' ? `نظرسنجی جدید: ${dto.title.trim()}` : dto.emergency ? `⚠ ${dto.title.trim()}` : dto.title.trim()
    const body = dto.body?.trim() || (dto.kind === 'poll' ? 'برای شرکت در نظرسنجی وارد بخش اعلانات شوید.' : '')
    const kind = dto.kind === 'poll' ? 'poll' : 'announcement'
    let n = 0
    const ins = async (person: string | null, role: string | null, link: string) => {
      await client.query(
        `INSERT INTO notification.inbox (tenant_id, recipient_person, recipient_role, kind, title, body, link, ref_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, person, role, kind, title, body, link, id])
      n++
    }
    // ساکنین (شخص)
    const filters: string[] = []
    const params: unknown[] = []
    for (const k of keys) {
      if (k === 'all_residents') filters.push('TRUE')
      else if (k === 'owners') filters.push(`(m.residency IN ('owner','owner_absent') AND m.role <> 'child')`)
      else if (k === 'tenants') filters.push(`(m.residency = 'tenant' AND m.role <> 'child')`)
      else if (k.startsWith('building:')) { params.push(k.slice(9)); filters.push(`(m.unit_id IN (SELECT id FROM property.units WHERE building_id = $${params.length}) AND m.role <> 'child')`) }
      else if (k.startsWith('unit:')) { params.push(k.slice(5)); filters.push(`(m.unit_id = $${params.length} AND m.role <> 'child')`) }
    }
    if (filters.length) {
      const persons = (await client.query<{ user_id: string; child_only: boolean }>(
        `SELECT m.user_id, bool_and(m.role = 'child') AS child_only FROM residency.memberships m
          WHERE m.status = 'active' AND (${filters.join(' OR ')}) GROUP BY m.user_id`, params)).rows
      for (const p of persons) await ins(p.user_id, null, p.child_only ? '/child/announcements' : '/resident/announcements')
    }
    for (const r of ['staff', 'guard', 'accountant']) if (keys.includes(r)) await ins(null, r, `/${r}/announcements`)
    return n
  }

  @Roles('admin')
  @Patch(':id')
  async patch(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PatchDto) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(
        `UPDATE notification.announcements SET pinned = COALESCE($2, pinned),
                closes_at = CASE WHEN $3 AND kind = 'poll' THEN now() ELSE closes_at END WHERE id = $1`, [id, dto.pinned ?? null, !!dto.close_now])
      if (!r.rowCount) throw new NotFoundException('یافت نشد')
      return { ok: true }
    })
  }

  @Roles('admin')
  @Delete(':id')
  async remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const r = await client.query(`DELETE FROM notification.announcements WHERE id = $1`, [id])
      if (!r.rowCount) throw new NotFoundException('یافت نشد')
      await client.query(`DELETE FROM notification.inbox WHERE ref_id = $1 AND kind IN ('announcement','poll')`, [id])
      return { ok: true }
    })
  }

  /* -------------------------------- رأی -------------------------------- */

  @Post(':id/vote')
  async vote(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VoteDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const v = await this.viewer(client, user)
      if (v.admin || !v.voter) throw new ForbiddenException('امکان شرکت در این نظرسنجی برای شما فعال نیست')
      const a = (await client.query(`SELECT * FROM notification.announcements WHERE id = $1`, [id])).rows[0]
      if (!a || a.kind !== 'poll') throw new NotFoundException('نظرسنجی یافت نشد')
      if (!a.audience.some((k: string) => v.keys.includes(k))) throw new ForbiddenException('این نظرسنجی برای شما نیست')
      if (a.closes_at && new Date(a.closes_at) <= new Date()) throw new ConflictException('مهلت شرکت در نظرسنجی تمام شده است')
      if (a.expires_at && new Date(a.expires_at) <= new Date()) throw new ConflictException('این نظرسنجی منقضی شده است')
      const qs = (await client.query(`SELECT id, multi FROM notification.poll_questions WHERE announcement_id = $1`, [id])).rows
      const answers = dto.answers && typeof dto.answers === 'object' ? dto.answers : {}
      for (const q of qs) {
        const sel = answers[q.id]
        if (!Array.isArray(sel) || !sel.length) throw new BadRequestException('به همه‌ی سؤال‌ها پاسخ دهید')
        if (!q.multi && sel.length !== 1) throw new BadRequestException('این سؤال تک‌گزینه‌ای است')
        const ok = (await client.query(`SELECT count(*)::int AS n FROM notification.poll_options WHERE question_id = $1 AND id = ANY($2::uuid[])`, [q.id, sel.filter(isUuid)])).rows[0].n
        if (ok !== new Set(sel).size) throw new BadRequestException('گزینه نامعتبر است')
      }
      let weight = 1
      if (a.weighted && v.unitId) weight = Number((await client.query(`SELECT area_sqm FROM property.units WHERE id = $1`, [v.unitId])).rows[0]?.area_sqm) || 1
      const ins = await client.query(
        `INSERT INTO notification.poll_ballots (tenant_id, announcement_id, voter, weight) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [tenantId, id, v.voter, weight])
      if (!ins.rowCount) throw new ConflictException('شما قبلاً رأی داده‌اید')
      for (const q of qs) for (const oid of new Set(answers[q.id])) {
        await client.query(`INSERT INTO notification.poll_votes (tenant_id, announcement_id, question_id, option_id, voter, weight) VALUES ($1,$2,$3,$4,$5,$6)`, [tenantId, id, q.id, oid, v.voter, weight])
      }
      return { ok: true }
    })
  }
}
