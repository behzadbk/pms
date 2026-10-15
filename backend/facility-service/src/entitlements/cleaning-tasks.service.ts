import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'
import { CleaningService } from './cleaning.service'
import { canMove, checkWantDate, KIND_LABEL, MAX_OPEN_REQUESTS, SLOT_LABEL, taskTitle, type Slot, type TaskKind } from './cleaning-tasks'
import { tehranIsoDate } from './engine'
import { EntitlementsService } from './entitlements.service'
import { faDigits, notify, unitRecipients } from './notify'

export interface TaskView {
  id: string
  kind: TaskKind
  kind_label: string
  title: string
  details: string | null
  status: 'new' | 'assigned' | 'in_progress' | 'done' | 'cancelled'
  source: 'resident' | 'supervisor'
  unit_id: string | null
  unit_number: string | null
  floor: number | null
  want_date: string | null
  want_slot: Slot
  want_slot_label: string
  assignee_id: string | null
  assignee_name: string | null
  assigned_at: string | null
  session_id: string | null
  started_at: string | null
  done_at: string | null
  done_note: string | null
  created_at: string
}

const SELECT = `
  SELECT t.id, t.kind, t.title, t.details, t.status, t.source, t.unit_id, u.unit_number, u.floor,
         to_char(t.want_date, 'YYYY-MM-DD') AS want_date, t.want_slot, t.assignee_id, a.full_name AS assignee_name,
         t.assigned_at, t.session_id, COALESCE(s.started_at, t.started_at) AS started_at, t.done_at, t.done_note, t.created_at
    FROM entitlement.cleaning_tasks t
    LEFT JOIN property.units u ON u.id = t.unit_id
    LEFT JOIN identity.users a ON a.id = t.assignee_id
    LEFT JOIN entitlement.cleaning_sessions s ON s.id = t.session_id`

type TaskDb = Omit<TaskView, 'kind_label' | 'want_slot_label'>
const view = (r: TaskDb): TaskView => ({ ...r, kind_label: KIND_LABEL[r.kind], want_slot_label: SLOT_LABEL[r.want_slot] })

/** مدیر یا مسئول نظافت (دسترسی cleaning_supervisor که فقط از «مسئول دپارتمان بودن» می‌آید) */
export function isSupervisor(user: JwtPayload) {
  return user.role === 'admin' || (user.role === 'staff' && (user.perms ?? []).includes('cleaning_supervisor'))
}

const fail = (e: unknown): never => {
  throw new BadRequestException(e instanceof Error ? e.message : 'ورودی نامعتبر است')
}

@Injectable()
export class CleaningTasksService {
  constructor(
    private readonly cleaning: CleaningService,
    private readonly ent: EntitlementsService,
  ) {}

  private async byId(client: PoolClient, id: string, lock = false): Promise<TaskView> {
    if (lock) await client.query(`SELECT 1 FROM entitlement.cleaning_tasks WHERE id = $1 FOR UPDATE`, [id])
    const r = await client.query<TaskDb>(`${SELECT} WHERE t.id = $1`, [id])
    if (!r.rows[0]) throw new NotFoundException('کار یافت نشد')
    return view(r.rows[0])
  }

  // ───────────────────────── ساکن ─────────────────────────

  async myRequests(client: PoolClient, user: JwtPayload) {
    const m = await this.ent.myUnit(client, user)
    const r = await client.query<TaskDb>(
      `${SELECT} WHERE t.unit_id = $1 AND t.kind = 'unit' AND t.source = 'resident' AND (t.status IN ('new', 'assigned', 'in_progress') OR t.updated_at > now() - interval '7 days')
        ORDER BY t.created_at DESC LIMIT 8`, [m.unit_id])
    return { requests: r.rows.map(view), max_open: MAX_OPEN_REQUESTS }
  }

  async request(client: PoolClient, user: JwtPayload, input: { wantDate?: string | null; wantSlot?: string; note?: string }) {
    const m = await this.ent.myUnit(client, user)
    if (['caregiver', 'owner_absent'].includes(m.role)) throw new ForbiddenException('ثبت درخواست نظافت برای این نوع عضویت فعال نیست')
    const slot = (input.wantSlot ?? 'any') as Slot
    if (!['any', 'morning', 'afternoon', 'evening'].includes(slot)) throw new BadRequestException('بازه‌ی ساعت نامعتبر است')
    let want: string | null = null
    try { want = checkWantDate(input.wantDate, tehranIsoDate()) } catch (e) { fail(e) }
    const details = input.note?.trim().slice(0, 500) || null

    // جلوگیری از انباشت درخواست: قفل واحد، سپس شمارش
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`cleanreq:${m.unit_id}`])
    const open = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM entitlement.cleaning_tasks WHERE unit_id = $1 AND source = 'resident' AND status IN ('new', 'assigned', 'in_progress')`, [m.unit_id])
    if (open.rows[0].n >= MAX_OPEN_REQUESTS) throw new ConflictException(`حداکثر ${faDigits(MAX_OPEN_REQUESTS)} درخواست باز دارید؛ تا انجام یا لغو آن‌ها صبر کنید`)

    const unit = await client.query<{ unit_number: string }>(`SELECT unit_number FROM property.units WHERE id = $1`, [m.unit_id])
    const un = unit.rows[0]?.unit_number ?? ''
    const ins = await client.query<{ id: string }>(
      `INSERT INTO entitlement.cleaning_tasks (tenant_id, kind, unit_id, title, details, source, requested_by, want_date, want_slot)
       VALUES ($1, 'unit', $2, $3, $4, 'resident', $5, $6, $7) RETURNING id`,
      [user.tenant_id, m.unit_id, taskTitle({ kind: 'unit', unitNumber: un }), details, user.sub, want, slot])

    await notify(client, user.tenant_id!, [{ role: 'perm:cleaning_supervisor' }, { role: 'admin' }], {
      kind: 'cleaning_request',
      title: 'درخواست نظافت منزل',
      body: `واحد ${faDigits(un)}${want ? ` — ${faDigits(want)}` : ''}${slot !== 'any' ? ` (${SLOT_LABEL[slot]})` : ''}${details ? `: ${details}` : ''}`,
      link: '/staff/cleaning-board',
      ref: ins.rows[0].id,
    })
    return this.byId(client, ins.rows[0].id)
  }

  async cancelRequest(client: PoolClient, user: JwtPayload, id: string) {
    const m = await this.ent.myUnit(client, user)
    const t = await this.byId(client, id, true)
    if (t.unit_id !== m.unit_id || t.source !== 'resident') throw new NotFoundException('درخواست یافت نشد')
    if (!['new', 'assigned'].includes(t.status)) throw new ConflictException('نظافت شروع شده یا تمام شده و دیگر قابل لغو نیست')
    await client.query(`UPDATE entitlement.cleaning_tasks SET status = 'cancelled', cancel_reason = 'لغو توسط ساکن', updated_at = now() WHERE id = $1`, [id])
    if (t.assignee_id) {
      await notify(client, user.tenant_id!, [{ login: t.assignee_id }], { kind: 'cleaning_task', title: 'کار لغو شد', body: `${t.title} را ساکن لغو کرد`, link: '/staff/housekeeping', ref: id })
    }
    await notify(client, user.tenant_id!, [{ role: 'perm:cleaning_supervisor' }], { kind: 'cleaning_task', title: 'درخواست نظافت لغو شد', body: t.title, link: '/staff/cleaning-board', ref: id })
    return this.byId(client, id)
  }

  // ───────────────────────── مسئول نظافت ─────────────────────────

  /** کادر فعال دپارتمان نظافت + بار کاری */
  async team(client: PoolClient) {
    const r = await client.query<{ id: string; full_name: string; is_dept_head: boolean; open_count: number; running: boolean; done_today: number }>(
      `SELECT u.id, u.full_name, u.is_dept_head,
              (SELECT count(*)::int FROM entitlement.cleaning_tasks t WHERE t.assignee_id = u.id AND t.status IN ('assigned', 'in_progress')) AS open_count,
              EXISTS (SELECT 1 FROM entitlement.cleaning_tasks t WHERE t.assignee_id = u.id AND t.status = 'in_progress') AS running,
              (SELECT count(*)::int FROM entitlement.cleaning_tasks t WHERE t.assignee_id = u.id AND t.status = 'done'
                  AND (t.done_at AT TIME ZONE 'Asia/Tehran')::date = (now() AT TIME ZONE 'Asia/Tehran')::date) AS done_today
         FROM identity.users u WHERE u.role = 'staff' AND u.department = 'cleaning' AND u.is_active
        ORDER BY u.is_dept_head DESC, u.full_name`)
    return r.rows
  }

  async board(client: PoolClient) {
    const [team, tasks, rate] = await Promise.all([
      this.team(client),
      client.query<TaskDb>(
        `${SELECT} WHERE t.status IN ('new', 'assigned', 'in_progress') OR t.updated_at > now() - interval '3 days'
          ORDER BY (t.status = 'new') DESC, t.want_date NULLS LAST, t.created_at DESC LIMIT 200`),
      client.query<{ cleaner_id: string; average: number; count: number }>(
        `SELECT cleaner_id, round(avg(rating)::numeric, 2)::float8 AS average, count(*)::int AS count
           FROM entitlement.cleaning_feedback WHERE created_at > now() - interval '90 days' GROUP BY cleaner_id`),
    ])
    const byCleaner = new Map(rate.rows.map((x) => [x.cleaner_id, x]))
    return {
      team: team.map((m) => ({ ...m, rating: byCleaner.get(m.id) ?? null })),
      tasks: tasks.rows.map(view),
      counts: { new: tasks.rows.filter((t) => t.status === 'new').length },
    }
  }

  async searchUnits(client: PoolClient, q: string) {
    const term = (q ?? '').trim().replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[%_\\]/g, '').slice(0, 20)
    const r = await client.query(
      `SELECT u.id, u.unit_number, u.floor FROM property.units u WHERE ($1 = '' OR u.unit_number ILIKE $1 || '%') ORDER BY length(u.unit_number), u.unit_number LIMIT 20`, [term])
    return r.rows
  }

  private async assertCleaner(client: PoolClient, id: string) {
    const r = await client.query<{ full_name: string }>(
      `SELECT full_name FROM identity.users WHERE id = $1 AND role = 'staff' AND department = 'cleaning' AND is_active`, [id])
    if (!r.rows[0]) throw new BadRequestException('این فرد عضو فعال دپارتمان نظافت نیست')
    return r.rows[0].full_name
  }

  async create(
    client: PoolClient,
    user: JwtPayload,
    input: { kind: TaskKind; unitId?: string; title?: string; details?: string; wantDate?: string | null; wantSlot?: Slot; assigneeId?: string },
  ) {
    let unitNumber: string | null = null
    if (input.kind === 'unit') {
      if (!input.unitId) throw new BadRequestException('واحد را انتخاب کنید')
      const u = await client.query<{ unit_number: string }>(`SELECT unit_number FROM property.units WHERE id = $1`, [input.unitId])
      if (!u.rows[0]) throw new NotFoundException('واحد یافت نشد')
      unitNumber = u.rows[0].unit_number
    }
    let title = ''
    try { title = taskTitle({ kind: input.kind, unitNumber, title: input.title }) } catch (e) { fail(e) }
    let want: string | null = null
    try { want = checkWantDate(input.wantDate, tehranIsoDate()) } catch (e) { fail(e) }
    if (input.assigneeId) await this.assertCleaner(client, input.assigneeId)

    const ins = await client.query<{ id: string }>(
      `INSERT INTO entitlement.cleaning_tasks (tenant_id, kind, unit_id, title, details, source, requested_by, want_date, want_slot, status, assignee_id, assigned_by, assigned_at)
       VALUES ($1, $2, $3, $4, $5, 'supervisor', $6, $7, $8, $9, $10, $11, CASE WHEN $10::uuid IS NULL THEN NULL ELSE now() END) RETURNING id`,
      [user.tenant_id, input.kind, input.kind === 'unit' ? input.unitId : null, title, input.details?.trim().slice(0, 500) || null, user.sub, want, input.wantSlot ?? 'any',
       input.assigneeId ? 'assigned' : 'new', input.assigneeId ?? null, input.assigneeId ? user.sub : null])
    const t = await this.byId(client, ins.rows[0].id)
    if (input.assigneeId) await this.notifyAssignee(client, user, t)
    return t
  }

  async assign(client: PoolClient, user: JwtPayload, id: string, input: { assigneeId: string; wantDate?: string | null; wantSlot?: Slot }) {
    const t = await this.byId(client, id, true)
    if (!canMove(t.status, 'assigned') || t.status === 'done') throw new ConflictException('این کار قابل واگذاری نیست (شروع شده، انجام شده یا لغو شده)')
    await this.assertCleaner(client, input.assigneeId)
    let want = t.want_date
    if (input.wantDate !== undefined) { try { want = checkWantDate(input.wantDate, tehranIsoDate()) } catch (e) { fail(e) } }
    await client.query(
      `UPDATE entitlement.cleaning_tasks SET status = 'assigned', assignee_id = $2, assigned_by = $3, assigned_at = now(), want_date = $4, want_slot = $5, updated_at = now() WHERE id = $1`,
      [id, input.assigneeId, user.sub, want, input.wantSlot ?? t.want_slot])
    const nt = await this.byId(client, id)
    await this.notifyAssignee(client, user, nt)
    // به ساکنِ درخواست‌دهنده خبر بده که کارش در برنامه قرار گرفت
    if (nt.source === 'resident' && nt.unit_id) {
      await notify(client, user.tenant_id!, await unitRecipients(client, nt.unit_id), {
        kind: 'cleaning_request', title: 'درخواست نظافت شما در برنامه قرار گرفت',
        body: `${nt.assignee_name ?? 'یکی از کادر نظافت'}${nt.want_date ? ` — ${faDigits(nt.want_date)}` : ''}${nt.want_slot !== 'any' ? ` (${SLOT_LABEL[nt.want_slot]})` : ''}`,
        link: '/resident/offers', ref: id,
      })
    }
    return nt
  }

  async cancel(client: PoolClient, user: JwtPayload, id: string, reason?: string) {
    const t = await this.byId(client, id, true)
    if (!['new', 'assigned'].includes(t.status)) throw new ConflictException('فقط کارِ شروع‌نشده قابل لغو است')
    await client.query(`UPDATE entitlement.cleaning_tasks SET status = 'cancelled', cancel_reason = $2, updated_at = now() WHERE id = $1`, [id, reason?.trim().slice(0, 200) || 'لغو توسط مسئول'])
    if (t.assignee_id) await notify(client, user.tenant_id!, [{ login: t.assignee_id }], { kind: 'cleaning_task', title: 'کار لغو شد', body: t.title, link: '/staff/housekeeping', ref: id })
    return this.byId(client, id)
  }

  private async notifyAssignee(client: PoolClient, user: JwtPayload, t: TaskView) {
    if (!t.assignee_id) return
    await notify(client, user.tenant_id!, [{ login: t.assignee_id }], {
      kind: 'cleaning_task',
      title: 'کار جدید برای شما',
      body: `${t.title}${t.want_date ? ` — ${faDigits(t.want_date)}` : ''}${t.want_slot !== 'any' ? ` (${SLOT_LABEL[t.want_slot]})` : ''}`,
      link: '/staff/housekeeping',
      ref: t.id,
    })
  }

  // ───────────────────────── نظافتچی ─────────────────────────

  async mine(client: PoolClient, user: JwtPayload) {
    const r = await client.query<TaskDb>(
      `${SELECT} WHERE t.assignee_id = $1 AND (t.status IN ('assigned', 'in_progress')
                OR (t.status = 'done' AND (t.done_at AT TIME ZONE 'Asia/Tehran')::date = (now() AT TIME ZONE 'Asia/Tehran')::date))
        ORDER BY (t.status = 'in_progress') DESC, (t.status = 'done'), t.want_date NULLS LAST, t.assigned_at`, [user.sub])
    return r.rows.map(view)
  }

  private async mineById(client: PoolClient, user: JwtPayload, id: string) {
    const t = await this.byId(client, id, true)
    if (t.assignee_id !== user.sub) throw new NotFoundException('کار یافت نشد')
    return t
  }

  private async assertNoneRunning(client: PoolClient, user: JwtPayload, exceptId: string) {
    const r = await client.query<{ title: string }>(
      `SELECT title FROM entitlement.cleaning_tasks WHERE assignee_id = $1 AND status = 'in_progress' AND id <> $2 LIMIT 1`, [user.sub, exceptId])
    if (r.rows[0]) throw new ConflictException(`کار «${r.rows[0].title}» هنوز در جریان است؛ اول آن را پایان دهید`)
  }

  async start(client: PoolClient, user: JwtPayload, id: string) {
    const t = await this.mineById(client, user, id)
    if (t.status !== 'assigned') throw new ConflictException(t.status === 'in_progress' ? 'این کار همین حالا در جریان است' : 'این کار قابل شروع نیست')
    await this.assertNoneRunning(client, user, id)
    if (t.kind === 'unit') {
      const s = await this.cleaning.start(client, user, t.unit_id!, id)
      await client.query(`UPDATE entitlement.cleaning_tasks SET status = 'in_progress', session_id = $2, updated_at = now() WHERE id = $1`, [id, s.id])
    } else {
      await client.query(`UPDATE entitlement.cleaning_tasks SET status = 'in_progress', started_at = now(), updated_at = now() WHERE id = $1`, [id])
    }
    return this.byId(client, id)
  }

  /** پایان کارهای مشاعات/موردی (کار منزل با پایان نظافت — cleaning.finish — تمام می‌شود) */
  async finish(client: PoolClient, user: JwtPayload, id: string, note?: string) {
    const t = await this.mineById(client, user, id)
    if (t.kind === 'unit') throw new BadRequestException('نظافت منزل را با «پایان نظافت» ثبت کنید')
    if (t.status !== 'in_progress') throw new ConflictException('این کار در جریان نیست')
    await client.query(`UPDATE entitlement.cleaning_tasks SET status = 'done', done_at = now(), done_note = $2, updated_at = now() WHERE id = $1`, [id, note?.trim().slice(0, 200) || null])
    return this.byId(client, id)
  }

  /** بازگرداندن شروعِ اشتباهِ کار مشاعات/موردی */
  async undoStart(client: PoolClient, user: JwtPayload, id: string) {
    const t = await this.mineById(client, user, id)
    if (t.kind === 'unit') throw new BadRequestException('شروع نظافت منزل را با «لغو» همان نظافت برگردانید')
    if (t.status !== 'in_progress') throw new ConflictException('این کار در جریان نیست')
    await client.query(`UPDATE entitlement.cleaning_tasks SET status = 'assigned', started_at = NULL, updated_at = now() WHERE id = $1`, [id])
    return this.byId(client, id)
  }

  /** ثبت دستیِ ساعت (فراموشی تایمر) برای کار منزلِ واگذارشده */
  async manual(client: PoolClient, user: JwtPayload, id: string, input: { startedAt: Date; endedAt: Date; note?: string }) {
    const t = await this.mineById(client, user, id)
    if (t.kind !== 'unit') throw new BadRequestException('ثبت ساعت فقط برای نظافت منزل است')
    if (t.status !== 'assigned') throw new ConflictException('این کار قابل ثبت دستی نیست')
    await this.assertNoneRunning(client, user, id)
    return this.cleaning.manual(client, user, { unitId: t.unit_id!, taskId: id, ...input })
  }
}
