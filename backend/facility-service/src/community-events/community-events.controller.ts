import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Put, Query,
} from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsIn, IsISO8601, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { Type } from 'class-transformer'
import type { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { EventsService } from '../events/events.service'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { unitOfResident } from '../reservations/debtor-lock'
import { tehranWhen } from '../reservations/jalali'
import { auditLog, enDigits, faDigits, likeEscape, notifyInbox } from '../common/inbox'

/** شناسه‌ی UUID‌شکل — داده‌ی نمونه UUIDهای غیر-v4 دارد و اعتبارسنج نسخه را هم چک می‌کند (همان قرارداد bookings.controller) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_MSG = { message: 'شناسه نامعتبر است' }
const KINDS = ['game', 'screening', 'sport', 'other'] as const

export class CreateEventDto {
  @IsString() @MinLength(2, { message: 'عنوان رویداد را بنویسید' }) @MaxLength(80) title: string
  @IsIn(KINDS as unknown as string[]) kind: (typeof KINDS)[number]
  @IsOptional() @IsString() @MaxLength(400) description?: string
  /** مکان به‌صورت متن آزاد (مثلاً «سینمای برج») */
  @IsOptional() @IsString() @MaxLength(100) place?: string
  @IsOptional() @Matches(UUID_RE, UUID_MSG) amenity_id?: string
  @IsISO8601() starts_at: string
  /** تعداد نفر لازم (مثلاً مافیا ۱۲ نفر) — خالی یعنی محدودیتی ندارد */
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(500) needed_players?: number
  @IsIn(['all', 'selected']) audience: 'all' | 'selected'
  /** برای audience=selected: افراد (جستجو با نام) */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @Matches(UUID_RE, { each: true, ...UUID_MSG }) invite_person_ids?: string[]
  /** برای audience=selected: همه‌ی ساکنین این واحدها (وارد کردن شماره‌ی واحد) */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @Matches(UUID_RE, { each: true, ...UUID_MSG }) invite_unit_ids?: string[]
}
export class UpdateEventDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) title?: string
  @IsOptional() @IsString() @MaxLength(400) description?: string
  @IsOptional() @IsString() @MaxLength(100) place?: string
  @IsOptional() @IsISO8601() starts_at?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(500) needed_players?: number
}
export class RsvpDto {
  @IsIn(['going', 'declined']) status: 'going' | 'declined'
}

interface EventRow {
  id: string
  title: string
  kind: string
  description: string | null
  place: string | null
  amenity_id: string | null
  amenity_name: string | null
  starts_at: string
  needed_players: number | null
  audience: 'all' | 'selected'
  status: 'open' | 'cancelled'
  created_by_person: string
  host_name: string | null
  host_unit: string | null
  going_count: number
  pending_count: number
  declined_count: number
  my_status: 'invited' | 'going' | 'declined' | null
}
interface PartRow {
  event_id: string
  person_id: string
  name: string | null
  unit_no: string | null
  status: 'invited' | 'going' | 'declined'
}

const ADULT_ROLES = `('head','adult','senior')`

const SELECT_EVENTS = `
  SELECT e.id, e.title, e.kind, e.description, e.place, e.amenity_id, am.name AS amenity_name, e.starts_at,
         e.needed_players, e.audience, e.status, e.created_by_person,
         hu.name AS host_name, un.unit_number AS host_unit,
         (SELECT count(*) FROM facility.event_rsvps r WHERE r.event_id = e.id AND r.status = 'going')::int AS going_count,
         (SELECT count(*) FROM facility.event_rsvps r WHERE r.event_id = e.id AND r.status = 'invited')::int AS pending_count,
         (SELECT count(*) FROM facility.event_rsvps r WHERE r.event_id = e.id AND r.status = 'declined')::int AS declined_count,
         (SELECT r.status FROM facility.event_rsvps r WHERE r.event_id = e.id AND r.person_id = $1) AS my_status
    FROM facility.events e
    LEFT JOIN residency.users hu ON hu.id = e.created_by_person
    LEFT JOIN property.units un ON un.id = e.host_unit_id
    LEFT JOIN facility.amenities am ON am.id = e.amenity_id`

function canSeeAll(user: JwtPayload) {
  return user.role === 'admin' || (user.role === 'staff' && (user.perms ?? []).includes('amenity_desk'))
}

/**
 * رویدادهای ساکنین (مافیا ساعت ۱۰ شب، فیلم، فوتبال در سینما …):
 *   هر ساکن می‌تواند رویداد بسازد؛ مخاطب «همه‌ی ساکنین» یا «افراد/واحدهای انتخابی» است.
 *   اگر بازی تعداد نفر لازم دارد (مثلاً ۱۲)، هر مدعو «می‌آیم / نمی‌آیم» می‌زند و فهرست پر می‌شود.
 *
 *   GET    /events                فهرست رویدادهای پیش‌رو که من می‌توانم ببینم
 *   POST   /events                ساخت (ساکن)
 *   PATCH  /events/:id            ویرایش (میزبان)
 *   DELETE /events/:id            لغو (میزبان یا مدیر/مسئول مشاعات)
 *   PUT    /events/:id/rsvp       «می‌آیم / نمی‌آیم» (ظرفیت تکمیل → ۴۰۹)
 *   GET    /events/people?q=      جستجوی ساکن با نام و واحد با شماره (برای انتخاب مدعو)
 */
@Controller('events')
export class CommunityEventsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {}

  /* ───────────── جستجوی مدعو ───────────── */

  @Roles('resident')
  @Get('people')
  people(@CurrentUser() user: JwtPayload, @Query('q') qRaw?: string) {
    const q = enDigits((qRaw ?? '').trim())
    if (q.length < 1) return { people: [], units: [] }
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const like = `%${likeEscape(q)}%`
      // فقط ساکنان بزرگسالِ فعال؛ موبایل/کد ملی هرگز برنمی‌گردد
      const people =
        q.length >= 2
          ? (
              await client.query<{ person_id: string; name: string; units: string[] }>(
                `SELECT ru.id AS person_id, ru.name, array_agg(DISTINCT un.unit_number ORDER BY un.unit_number) AS units
                   FROM residency.memberships m
                   JOIN residency.users ru ON ru.id = m.user_id AND ru.status = 'active'
                   JOIN property.units un ON un.id = m.unit_id
                  WHERE m.status = 'active' AND m.role IN ${ADULT_ROLES} AND ru.id <> $1 AND ru.name ILIKE $2
                  GROUP BY ru.id, ru.name ORDER BY ru.name LIMIT 20`,
                [user.pid ?? '00000000-0000-0000-0000-000000000000', like],
              )
            ).rows
          : []
      const units = /^\d+$/.test(q)
        ? (
            await client.query<{ unit_id: string; unit_number: string; names: string[] }>(
              `SELECT un.id AS unit_id, un.unit_number,
                      COALESCE(array_agg(DISTINCT ru.name) FILTER (WHERE ru.id IS NOT NULL AND ru.id <> $1), '{}') AS names
                 FROM property.units un
                 LEFT JOIN residency.memberships m ON m.unit_id = un.id AND m.status = 'active' AND m.role IN ${ADULT_ROLES}
                 LEFT JOIN residency.users ru ON ru.id = m.user_id AND ru.status = 'active'
                WHERE un.unit_number ILIKE $2
                GROUP BY un.id, un.unit_number
               HAVING count(ru.id) FILTER (WHERE ru.id <> $1) > 0
                ORDER BY un.unit_number LIMIT 12`,
              [user.pid ?? '00000000-0000-0000-0000-000000000000', `${likeEscape(q)}%`],
            )
          ).rows
        : []
      return { people, units }
    })
  }

  /* ───────────── فهرست ───────────── */

  @Roles('resident', 'admin', 'staff')
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.db.withTenant(user.tenant_id!, async (client) => {
      const all = canSeeAll(user)
      if (user.role === 'staff' && !all) throw new ForbiddenException('دسترسی به رویدادها ندارید')
      const me = user.pid ?? null
      if (!all && !me) return []
      const rows = (
        await client.query<EventRow>(
          `${SELECT_EVENTS}
            WHERE e.status = 'open' AND e.starts_at > now() - interval '3 hours'
              ${all ? '' : `AND (e.audience = 'all' OR e.created_by_person = $1
                      OR EXISTS (SELECT 1 FROM facility.event_rsvps r WHERE r.event_id = e.id AND r.person_id = $1))`}
            ORDER BY e.starts_at LIMIT 100`,
          [me],
        )
      ).rows
      if (!rows.length) return []
      const parts = (
        await client.query<PartRow>(
          `SELECT r.event_id, r.person_id, ru.name, un.unit_number AS unit_no, r.status
             FROM facility.event_rsvps r
             LEFT JOIN residency.users ru ON ru.id = r.person_id
             LEFT JOIN property.units un ON un.id = r.unit_id
            WHERE r.event_id = ANY($1::uuid[]) AND r.status IN ('going', 'invited')
            ORDER BY r.responded_at NULLS LAST, ru.name`,
          [rows.map((x) => x.id)],
        )
      ).rows
      return rows.map((e) => {
        const mineHost = e.created_by_person === me
        const mine = parts.filter((p) => p.event_id === e.id)
        return {
          ...shape(e, me),
          going: mine.filter((p) => p.status === 'going').map((p) => ({ person_id: p.person_id, name: p.name, unit_no: p.unit_no })),
          // مدعوهای بی‌پاسخ فقط برای میزبان و مدیر
          pending: mineHost || all ? mine.filter((p) => p.status === 'invited').map((p) => ({ person_id: p.person_id, name: p.name, unit_no: p.unit_no })) : undefined,
        }
      })
    })
  }

  /* ───────────── ساخت ───────────── */

  @Roles('resident')
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateEventDto) {
    const tenantId = user.tenant_id!
    const start = new Date(dto.starts_at)
    if (start.getTime() < Date.now() - 10 * 60_000) throw new BadRequestException('زمان رویداد گذشته است')
    if (start.getTime() > Date.now() + 120 * 86_400_000) throw new BadRequestException('رویداد حداکثر ۱۲۰ روز بعد قابل ثبت است')
    if (dto.audience === 'selected' && !(dto.invite_person_ids?.length || dto.invite_unit_ids?.length)) {
      throw new BadRequestException('حداقل یک نفر یا یک واحد را انتخاب کنید')
    }
    return this.db.withTenant(tenantId, async (client) => {
      const me = user.pid
      if (!me) throw new ForbiddenException('پروفایل ساکن پیدا نشد')
      const unitId = await unitOfResident(client, user)
      if (!unitId) throw new ForbiddenException('برای ساخت رویداد باید عضو فعال یک واحد باشید')
      if (dto.amenity_id) {
        const am = await client.query(`SELECT 1 FROM facility.amenities WHERE id = $1`, [dto.amenity_id])
        if (!am.rowCount) throw new BadRequestException('مشاع انتخاب‌شده پیدا نشد')
      }
      // سقف ساده برای جلوگیری از اسپم: حداکثر ۵ رویداد باز و آینده برای هر ساکن
      const open = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM facility.events WHERE created_by_person = $1 AND status = 'open' AND starts_at > now()`,
        [me],
      )
      if (open.rows[0].n >= 5) throw new ConflictException('حداکثر ۵ رویداد فعال می‌توانید داشته باشید')

      const ins = await client.query<{ id: string }>(
        `INSERT INTO facility.events
           (tenant_id, created_by_person, host_unit_id, title, kind, description, place, amenity_id, starts_at, needed_players, audience)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [tenantId, me, unitId, dto.title.trim(), dto.kind, dto.description?.trim() || null, dto.place?.trim() || null, dto.amenity_id ?? null, start.toISOString(), dto.needed_players ?? null, dto.audience],
      )
      const id = ins.rows[0].id
      // میزبان خودش «می‌آید» است
      await client.query(
        `INSERT INTO facility.event_rsvps (event_id, tenant_id, person_id, unit_id, status, responded_at) VALUES ($1,$2,$3,$4,'going',now())`,
        [id, tenantId, me, unitId],
      )

      const host = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [me])).rows[0]?.name ?? 'یکی از همسایه‌ها'
      const msg = {
        kind: 'event_invite',
        title: `${host} شما را به «${dto.title.trim()}» دعوت کرد`,
        body: [tehranWhen(start), dto.place?.trim(), dto.needed_players ? `${faDigits(dto.needed_players)} نفر لازم است` : null].filter(Boolean).join(' · '),
        link: '/resident/events',
        ref: id,
      }
      let invited = 0
      if (dto.audience === 'selected') {
        const people = await client.query<{ user_id: string; unit_id: string }>(
          `SELECT DISTINCT ON (m.user_id) m.user_id, m.unit_id
             FROM residency.memberships m JOIN residency.users ru ON ru.id = m.user_id AND ru.status = 'active'
            WHERE m.status = 'active' AND m.role IN ${ADULT_ROLES} AND m.user_id <> $3
              AND (m.user_id = ANY($1::uuid[]) OR m.unit_id = ANY($2::uuid[]))
            ORDER BY m.user_id, (m.role = 'head') DESC`,
          [dto.invite_person_ids ?? [], dto.invite_unit_ids ?? [], me],
        )
        for (const p of people.rows) {
          await client.query(
            `INSERT INTO facility.event_rsvps (event_id, tenant_id, person_id, unit_id, status) VALUES ($1,$2,$3,$4,'invited') ON CONFLICT DO NOTHING`,
            [id, tenantId, p.user_id, p.unit_id],
          )
        }
        await notifyInbox(client, tenantId, people.rows.map((p) => ({ person: p.user_id })), msg)
        invited = people.rows.length
        if (!invited) throw new BadRequestException('هیچ ساکن فعالی برای دعوت پیدا نشد')
      } else {
        // همه‌ی ساکنین بزرگسال — یک INSERT..SELECT (نه حلقه) تا در برج‌های بزرگ هم سریع باشد
        const r = await client.query(
          `INSERT INTO notification.inbox (tenant_id, recipient_person, kind, title, body, link, ref_id)
           SELECT $1, x.user_id, $2, $3, $4, $5, $6
             FROM (SELECT DISTINCT m.user_id FROM residency.memberships m JOIN residency.users ru ON ru.id = m.user_id AND ru.status = 'active'
                    WHERE m.status = 'active' AND m.role IN ${ADULT_ROLES} AND m.user_id <> $7) x`,
          [tenantId, msg.kind, msg.title, msg.body, msg.link, id, me],
        )
        invited = r.rowCount ?? 0
      }
      await auditLog(client, tenantId, user, 'event.created', { summary: `رویداد «${dto.title.trim()}» ساخته شد`, event_id: id, audience: dto.audience, invited })
      this.events.publish('community_event.created', { tenantId, eventId: id, audience: dto.audience })
      return { id, invited }
    })
  }

  /* ───────────── «می‌آیم / نمی‌آیم» ───────────── */

  @Roles('resident')
  @Put(':id/rsvp')
  @HttpCode(200)
  rsvp(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RsvpDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const me = user.pid
      if (!me) throw new ForbiddenException('پروفایل ساکن پیدا نشد')
      // قفل ردیف رویداد: دو نفرِ همزمان نمی‌توانند آخرین جای خالی را با هم بگیرند
      const e = (
        await client.query<{ id: string; title: string; status: string; starts_at: string; needed_players: number | null; audience: string; created_by_person: string }>(
          `SELECT id, title, status, starts_at, needed_players, audience, created_by_person FROM facility.events WHERE id = $1 FOR UPDATE`,
          [id],
        )
      ).rows[0]
      if (!e) throw new NotFoundException('رویداد یافت نشد')
      if (e.status !== 'open') throw new ConflictException('این رویداد لغو شده است')
      if (new Date(e.starts_at).getTime() < Date.now() - 3 * 3_600_000) throw new ConflictException('این رویداد تمام شده است')
      if (e.created_by_person === me) throw new ConflictException('شما میزبان هستید؛ برای انصراف رویداد را لغو کنید')

      const mine = (await client.query<{ status: string }>(`SELECT status FROM facility.event_rsvps WHERE event_id = $1 AND person_id = $2`, [id, me])).rows[0]
      if (e.audience === 'selected' && !mine) throw new ForbiddenException('شما به این رویداد دعوت نشده‌اید')

      let nowFull = false
      if (dto.status === 'going' && mine?.status !== 'going' && e.needed_players) {
        const going = (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM facility.event_rsvps WHERE event_id = $1 AND status = 'going'`, [id])).rows[0].n
        if (going >= e.needed_players) throw new ConflictException('ظرفیت این رویداد تکمیل شده است')
        nowFull = going + 1 >= e.needed_players
      }
      const unitId = await unitOfResident(client, user)
      await client.query(
        `INSERT INTO facility.event_rsvps (event_id, tenant_id, person_id, unit_id, status, responded_at)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (event_id, person_id) DO UPDATE SET status = EXCLUDED.status, responded_at = now()`,
        [id, tenantId, me, unitId, dto.status],
      )
      if (mine?.status !== dto.status) {
        const name = (await client.query<{ name: string }>(`SELECT name FROM residency.users WHERE id = $1`, [me])).rows[0]?.name ?? 'یکی از مدعوین'
        await notifyInbox(client, tenantId, [{ person: e.created_by_person }], {
          kind: 'event_rsvp',
          title: dto.status === 'going' ? `${name} می‌آید — ${e.title}` : `${name} نمی‌آید — ${e.title}`,
          link: '/resident/events',
          ref: id,
        })
        if (nowFull) {
          await notifyInbox(client, tenantId, [{ person: e.created_by_person }], {
            kind: 'event_full', title: `ظرفیت «${e.title}» تکمیل شد 🎉`, body: `${faDigits(e.needed_players!)} نفر قطعی شدند`, link: '/resident/events', ref: id,
          })
        }
      }
      return { id, status: dto.status, full: nowFull }
    })
  }

  /* ───────────── ویرایش / لغو ───────────── */

  @Roles('resident')
  @Patch(':id')
  patch(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEventDto) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const e = await this.loadOwn(client, id, user.pid)
      const sets: string[] = []
      const vals: unknown[] = []
      const set = (col: string, v: unknown) => {
        vals.push(v)
        sets.push(`${col} = $${vals.length}`)
      }
      let when: Date | null = null
      if (dto.title !== undefined) set('title', dto.title.trim())
      if (dto.description !== undefined) set('description', dto.description.trim() || null)
      if (dto.place !== undefined) set('place', dto.place.trim() || null)
      if (dto.starts_at !== undefined) {
        when = new Date(dto.starts_at)
        if (when.getTime() < Date.now() - 10 * 60_000) throw new BadRequestException('زمان رویداد گذشته است')
        set('starts_at', when.toISOString())
      }
      if (dto.needed_players !== undefined) {
        const going = (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM facility.event_rsvps WHERE event_id = $1 AND status = 'going'`, [id])).rows[0].n
        if (dto.needed_players < going) throw new ConflictException(`از قبل ${faDigits(going)} نفر قطعی شده‌اند؛ تعداد کمتر از آن ممکن نیست`)
        set('needed_players', dto.needed_players)
      }
      if (!sets.length) return { id }
      vals.push(id)
      await client.query(`UPDATE facility.events SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals)
      if (when || dto.place !== undefined) {
        const targets = await client.query<{ person_id: string }>(
          `SELECT person_id FROM facility.event_rsvps WHERE event_id = $1 AND person_id <> $2 AND status IN ('going','invited')`,
          [id, user.pid],
        )
        await notifyInbox(client, tenantId, targets.rows.map((t) => ({ person: t.person_id })), {
          kind: 'event_updated', title: `«${dto.title?.trim() ?? e.title}» تغییر کرد`, body: when ? tehranWhen(when) : dto.place?.trim() || null, link: '/resident/events', ref: id,
        })
      }
      return { id }
    })
  }

  @Roles('resident', 'admin', 'staff')
  @Delete(':id')
  @HttpCode(200)
  cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    const tenantId = user.tenant_id!
    return this.db.withTenant(tenantId, async (client) => {
      const e = (
        await client.query<{ id: string; title: string; status: string; created_by_person: string }>(
          `SELECT id, title, status, created_by_person FROM facility.events WHERE id = $1 FOR UPDATE`,
          [id],
        )
      ).rows[0]
      if (!e) throw new NotFoundException('رویداد یافت نشد')
      const own = user.role === 'resident' && e.created_by_person === user.pid
      if (!own && !canSeeAll(user)) throw new ForbiddenException('فقط میزبان یا مدیر می‌تواند رویداد را لغو کند')
      if (e.status === 'cancelled') return { id, status: 'cancelled' }
      await client.query(`UPDATE facility.events SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id])
      const targets = await client.query<{ person_id: string }>(
        `SELECT person_id FROM facility.event_rsvps WHERE event_id = $1 AND person_id <> $2 AND status IN ('going','invited')`,
        [id, e.created_by_person],
      )
      await notifyInbox(client, tenantId, targets.rows.map((t) => ({ person: t.person_id })), {
        kind: 'event_cancelled', title: `«${e.title}» لغو شد`, link: '/resident/events', ref: id,
      })
      await auditLog(client, tenantId, user, 'event.cancelled', { summary: `رویداد «${e.title}» لغو شد`, event_id: id })
      return { id, status: 'cancelled' }
    })
  }

  private async loadOwn(client: PoolClient, id: string, pid: string | undefined) {
    const e = (
      await client.query<{ id: string; title: string; status: string; created_by_person: string }>(
        `SELECT id, title, status, created_by_person FROM facility.events WHERE id = $1 FOR UPDATE`,
        [id],
      )
    ).rows[0]
    if (!e) throw new NotFoundException('رویداد یافت نشد')
    if (e.created_by_person !== pid) throw new ForbiddenException('فقط میزبان می‌تواند رویداد را ویرایش کند')
    if (e.status !== 'open') throw new ConflictException('این رویداد لغو شده است')
    return e
  }
}

function shape(e: EventRow, me: string | null) {
  const host = e.created_by_person === me
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    description: e.description,
    place: e.place,
    amenity_id: e.amenity_id,
    amenity_name: e.amenity_name,
    starts_at: e.starts_at,
    needed_players: e.needed_players,
    audience: e.audience,
    status: e.status,
    host_name: e.host_name,
    host_unit: e.host_unit,
    going_count: e.going_count,
    pending_count: e.pending_count,
    declined_count: e.declined_count,
    spots_left: e.needed_players ? Math.max(0, e.needed_players - e.going_count) : null,
    is_host: host,
    // is_host: میزبان همیشه «می‌آید» است
    my_status: host ? ('going' as const) : e.my_status ?? ('none' as const),
  }
}
