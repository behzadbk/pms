import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import type { JwtPayload } from '../auth/decorators/current-user.decorator'
import { cleanFeedback, FEEDBACK_REASONS, LOW_RATING_MAX, RATING_WINDOW_DAYS, reasonLabel } from './cleaning-feedback'
import { EntitlementsService } from './entitlements.service'
import { faDigits, notify } from './notify'

export interface PendingCleaning {
  session_id: string
  started_at: string
  ended_at: string
  minutes: number
}

export interface FeedbackItem {
  id: string
  rating: number
  reasons: string[]
  comment: string | null
  created_at: string
  unit_number: string
  cleaner_id: string
  cleaner_name: string | null
  started_at: string
  ended_at: string
  minutes: number
}

export interface CleanerSummary {
  cleaner_id: string
  cleaner_name: string | null
  count: number
  average: number
  low_count: number
}

/** مدیر یا مسئول نظافت (دسترسی cleaning_review) */
export function isCleaningReviewer(user: JwtPayload) {
  return user.role === 'admin' || (user.role === 'staff' && (user.perms ?? []).includes('cleaning_review'))
}

@Injectable()
export class CleaningFeedbackService {
  constructor(private readonly ent: EntitlementsService) {}

  // ───────────────────────── ساکن ─────────────────────────

  /** نظافت‌های اخیرِ واحد که هنوز نمره نگرفته‌اند + فهرست دلیل‌های آماده */
  async pending(client: PoolClient, user: JwtPayload) {
    const m = await this.ent.myUnit(client, user)
    const r = await client.query<PendingCleaning>(
      `SELECT s.id AS session_id, s.started_at, s.ended_at,
              round(extract(epoch FROM (s.ended_at - s.started_at)) / 60)::int AS minutes
         FROM entitlement.cleaning_sessions s
        WHERE s.unit_id = $1 AND s.status = 'done' AND s.ended_at > now() - make_interval(days => $2)
          AND NOT EXISTS (SELECT 1 FROM entitlement.cleaning_feedback f WHERE f.session_id = s.id)
        ORDER BY s.ended_at DESC LIMIT 5`, [m.unit_id, RATING_WINDOW_DAYS])
    return { pending: r.rows, reasons: FEEDBACK_REASONS }
  }

  async submit(client: PoolClient, user: JwtPayload, sessionId: string, body: { rating: unknown; reasons?: unknown; comment?: unknown }) {
    const fb = cleanFeedback(body)
    const m = await this.ent.myUnit(client, user)
    const r = await client.query<{ unit_id: string; cleaner_id: string; status: string; ended_at: string | null; unit_number: string; cleaner_name: string | null }>(
      `SELECT s.unit_id, s.cleaner_id, s.status, s.ended_at, u.unit_number, cu.full_name AS cleaner_name
         FROM entitlement.cleaning_sessions s
         JOIN property.units u ON u.id = s.unit_id
         LEFT JOIN identity.users cu ON cu.id = s.cleaner_id
        WHERE s.id = $1`, [sessionId])
    const s = r.rows[0]
    if (!s || s.unit_id !== m.unit_id) throw new NotFoundException('نظافت یافت نشد')
    if (s.status !== 'done' || !s.ended_at) throw new ConflictException('این نظافت هنوز ثبت نشده یا باطل شده است')
    if (Date.now() - new Date(s.ended_at).getTime() > RATING_WINDOW_DAYS * 86_400_000) {
      throw new ForbiddenException('مهلت نظر دادن درباره‌ی این نظافت تمام شده است')
    }
    try {
      await client.query(
        `INSERT INTO entitlement.cleaning_feedback (tenant_id, session_id, unit_id, cleaner_id, rating, reasons, comment, rated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user.tenant_id, sessionId, s.unit_id, s.cleaner_id, fb.rating, fb.reasons, fb.comment, user.sub])
    } catch (e) {
      if ((e as { code?: string })?.code === '23505') throw new ConflictException('برای این نظافت قبلاً نظر داده‌اید')
      throw e
    }

    if (fb.rating <= LOW_RATING_MAX) {
      const why = [...fb.reasons.map(reasonLabel), ...(fb.comment ? [fb.comment] : [])].join('، ')
      await notify(client, user.tenant_id!, [{ role: 'admin' }, { role: 'perm:cleaning_review' }], {
        kind: 'cleaning_feedback',
        title: 'بازخورد منفی نظافت منزل',
        body: `واحد ${faDigits(s.unit_number)}${s.cleaner_name ? ` — ${s.cleaner_name}` : ''}: ${faDigits(fb.rating)} از ۵ ستاره · ${why}`,
        link: '/staff/cleaning-reviews',
        ref: sessionId,
      })
    }
    return { ok: true, rating: fb.rating }
  }

  // ───────────────────────── مدیر / مسئول نظافت ─────────────────────────

  async list(client: PoolClient, q: { cleanerId?: string; lowOnly?: boolean; limit?: number }) {
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200)
    const items = await client.query<FeedbackItem>(
      `SELECT f.id, f.rating, f.reasons, f.comment, f.created_at, u.unit_number, f.cleaner_id, cu.full_name AS cleaner_name,
              s.started_at, s.ended_at, round(extract(epoch FROM (s.ended_at - s.started_at)) / 60)::int AS minutes
         FROM entitlement.cleaning_feedback f
         JOIN entitlement.cleaning_sessions s ON s.id = f.session_id
         JOIN property.units u ON u.id = f.unit_id
         LEFT JOIN identity.users cu ON cu.id = f.cleaner_id
        WHERE ($1::uuid IS NULL OR f.cleaner_id = $1) AND (NOT $2::boolean OR f.rating <= $3)
        ORDER BY f.created_at DESC LIMIT $4`, [q.cleanerId ?? null, !!q.lowOnly, LOW_RATING_MAX, limit])

    // میانگین ۹۰ روز اخیر هر نظافتچی
    const summary = await client.query<CleanerSummary>(
      `SELECT f.cleaner_id, cu.full_name AS cleaner_name, count(*)::int AS count,
              round(avg(f.rating)::numeric, 2)::float8 AS average, count(*) FILTER (WHERE f.rating <= $1)::int AS low_count
         FROM entitlement.cleaning_feedback f LEFT JOIN identity.users cu ON cu.id = f.cleaner_id
        WHERE f.created_at > now() - interval '90 days'
        GROUP BY f.cleaner_id, cu.full_name ORDER BY average ASC, count DESC`, [LOW_RATING_MAX])
    return { summary: summary.rows, items: items.rows, reasons: FEEDBACK_REASONS }
  }
}
