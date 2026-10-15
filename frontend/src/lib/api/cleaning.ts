/**
 * کلاینت دپارتمان نظافت (facility-service، مسیر /api/facility/entitlements/cleaning).
 *  - ساکن درخواست نظافت منزل می‌دهد ← مسئول نظافت می‌چیند و به یکی از کادر واگذار می‌کند (tasksApi)
 *  - نظافتچی فقط کارهای واگذارشده به خودش را شروع/پایان می‌کند؛ مدتِ نظافت منزل از سهمیه‌ی ساعتِ «خانه‌داری»
 *    واحد کم می‌شود و مازاد طبق نرخ شیفت در شارژ ماه بعد می‌آید (همان موتور آفرها — بدون منطق مالی موازی).
 */
import { api } from './client'
import type { ServiceLine, Tier, TierMatch } from './entitlements'

const C = '/facility/entitlements/cleaning'

export type CleaningShift = 'day' | 'overtime' | 'night'
export type CleaningStatus = 'running' | 'done' | 'cancelled' | 'void'

export interface CleaningUnit { id: string; unit_number: string; floor: number | null; area: number | null }

export interface CleaningSession {
  id: string
  unit_id: string
  unit_number: string
  floor: number | null
  started_at: string
  ended_at: string | null
  status: CleaningStatus
  entry: 'timer' | 'manual'
  note: string | null
  task_id: string | null
  quantity: number | null
  unit_label: string | null
  tariff_title: string | null
  quota_qty: number
  overage_qty: number
  amount: number
  billed: boolean
  can_void: boolean
}

/** نتیجه‌ی (واقعی یا پیش‌نمایش) یک نظافت: چه مقدار از سهمیه کم می‌شود و چه مقدار مازاد است */
export interface CleaningOutcome {
  minutes: number
  duration_label: string
  quantity: number
  unit_label: string
  shift: CleaningShift
  shift_label: string
  tariff_title: string | null
  free_qty: number
  overage_qty: number
  amount: number
  included: number
  remaining_after: number
  no_tier: boolean
  window_label: string
}

export interface CleaningHome {
  service: { configured: boolean; unit_label: string }
  active: CleaningSession | null
  month: { period_label: string; sessions: number; minutes: number; overage_amount: number }
}

export interface CleaningUnitInfo {
  unit: CleaningUnit
  tier: Tier | null
  tier_match: TierMatch
  line: ServiceLine | null
}

export interface CleaningCommit { session: CleaningSession; result: CleaningOutcome }

export const cleaningApi = {
  home: () => api.get<CleaningHome>(`${C}/home`),
  unit: (id: string) => api.get<CleaningUnitInfo>(`${C}/units/${id}`),
  mine: (limit = 30) => api.get<CleaningSession[]>(`${C}/mine?limit=${limit}`),
  preview: (b: { unitId: string; startedAt: string; endedAt?: string }) => api.post<CleaningOutcome>(`${C}/preview`, b),
  finish: (id: string, b: { endedAt?: string; note?: string } = {}) => api.post<CleaningCommit>(`${C}/${id}/finish`, b),
  cancel: (id: string) => api.post<CleaningSession>(`${C}/${id}/cancel`),
  voidSession: (id: string) => api.post<CleaningSession>(`${C}/${id}/void`),
}

// ───────────── بازخورد ساکن از نظافت ─────────────

export interface FeedbackReason { code: string; label: string }
export interface PendingCleaning { session_id: string; started_at: string; ended_at: string; minutes: number }
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
export interface CleanerSummary { cleaner_id: string; cleaner_name: string | null; count: number; average: number; low_count: number }

export const cleaningFeedbackApi = {
  /** ساکن: نظافت‌های اخیر بدون نمره + دلیل‌های آماده */
  pending: () => api.get<{ pending: PendingCleaning[]; reasons: FeedbackReason[] }>(`${C}/me/pending`),
  submit: (sessionId: string, b: { rating: number; reasons?: string[]; comment?: string }) => api.post<{ ok: boolean; rating: number }>(`${C}/me/${sessionId}/feedback`, b),
  /** مدیر / مسئول نظافت */
  list: (p: { cleanerId?: string; low?: boolean; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    if (p.cleanerId) qs.set('cleanerId', p.cleanerId)
    if (p.low) qs.set('low', '1')
    if (p.limit) qs.set('limit', String(p.limit))
    return api.get<{ summary: CleanerSummary[]; items: FeedbackItem[]; reasons: FeedbackReason[] }>(`${C}/feedback?${qs.toString()}`)
  },
}

// ───────────── کارهای نظافت (درخواست ← مسئول ← واگذاری ← نظافتچی) ─────────────

export type TaskKind = 'unit' | 'common' | 'custom'
export type TaskStatus = 'new' | 'assigned' | 'in_progress' | 'done' | 'cancelled'
export type TaskSlot = 'any' | 'morning' | 'afternoon' | 'evening'

export const slotLabel: Record<TaskSlot, string> = { any: 'هر ساعتی', morning: 'صبح', afternoon: 'بعدازظهر', evening: 'عصر' }
export const kindLabel: Record<TaskKind, string> = { unit: 'نظافت منزل', common: 'نظافت مشاعات', custom: 'کار موردی' }
export const statusLabel: Record<TaskStatus, string> = {
  new: 'در انتظار واگذاری', assigned: 'واگذار شد', in_progress: 'در حال انجام', done: 'انجام شد', cancelled: 'لغو شد',
}

export interface CleaningTask {
  id: string
  kind: TaskKind
  kind_label: string
  title: string
  details: string | null
  status: TaskStatus
  source: 'resident' | 'supervisor'
  unit_id: string | null
  unit_number: string | null
  floor: number | null
  want_date: string | null
  want_slot: TaskSlot
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

export interface TeamMember {
  id: string
  full_name: string
  is_dept_head: boolean
  open_count: number
  running: boolean
  done_today: number
  rating: { average: number; count: number } | null
}

export interface CleaningBoard { team: TeamMember[]; tasks: CleaningTask[]; counts: { new: number } }

export interface NewTaskInput {
  kind: TaskKind
  unitId?: string
  title?: string
  details?: string
  wantDate?: string
  wantSlot?: TaskSlot
  assigneeId?: string
}

export const cleaningTasksApi = {
  // ساکن
  myRequests: () => api.get<{ requests: CleaningTask[]; max_open: number }>(`${C}/me/requests`),
  request: (b: { wantDate?: string; wantSlot?: TaskSlot; note?: string }) => api.post<CleaningTask>(`${C}/me/requests`, b),
  cancelRequest: (id: string) => api.post<CleaningTask>(`${C}/me/requests/${id}/cancel`),
  // مسئول نظافت / مدیر
  board: () => api.get<CleaningBoard>(`${C}/tasks/board`),
  units: (q: string) => api.get<CleaningUnit[]>(`${C}/tasks/units?q=${encodeURIComponent(q)}`),
  create: (b: NewTaskInput) => api.post<CleaningTask>(`${C}/tasks`, b),
  assign: (id: string, b: { assigneeId: string; wantDate?: string; wantSlot?: TaskSlot }) => api.post<CleaningTask>(`${C}/tasks/${id}/assign`, b),
  cancel: (id: string, reason?: string) => api.post<CleaningTask>(`${C}/tasks/${id}/cancel`, { reason }),
  // نظافتچی
  mine: () => api.get<CleaningTask[]>(`${C}/tasks/mine`),
  start: (id: string) => api.post<CleaningTask>(`${C}/tasks/${id}/start`),
  finish: (id: string, note?: string) => api.post<CleaningTask>(`${C}/tasks/${id}/finish`, { note }),
  undo: (id: string) => api.post<CleaningTask>(`${C}/tasks/${id}/undo`),
  manual: (id: string, b: { startedAt: string; endedAt: string; note?: string }) => api.post<CleaningCommit>(`${C}/tasks/${id}/manual`, b),
}
