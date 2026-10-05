/**
 * کلاینت audit-svc (پورت ۳۰۰۷) — جستجوی داشبورد لاگ + لاگ‌گیری سمت کلاینت.
 * مطابق docs/UPDATE-V2-AUDIT-FNB-DESIGN.md بخش ۱.۲ و ۳.۱.
 *
 * اصل طراحی: لاگ‌گیری هرگز نباید مسیر درخواست کاربر را کند یا fail کند —
 * enqueueClientLog هرگز throw نمی‌کند و ارسال fire-and-forget (بدون await) است.
 */
import { api, getSessionId } from './client'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** یک ردیف لاگ (camelCase) — پاسخ خام audit-svc در mapLog تبدیل می‌شود */
export interface AuditEntry {
  id: string
  occurredAt: string
  sessionId: string
  traceId: string | null
  userId: string | null
  actorName: string | null
  actorRole: string | null
  source: string
  level: LogLevel
  action: string
  httpMethod: string | null
  httpPath: string | null
  statusCode: number | null
  durationMs: number | null
  device: { browser?: string; os?: string; isPwa?: boolean } | null
  requestBody: Record<string, unknown> | null
  errorStack: string | null
}

export interface AuditVolumePoint {
  at: string
  count: number
  errorCount: number
  warnCount: number
}

export interface AuditStats {
  range: { from: string; to: string; bucket: 'hour' | 'day' }
  total: number
  byLevel: { level: LogLevel; count: number }[]
  topErrors: { action: string; count: number }[]
  sources: { source: string; count: number }[]
  volume: AuditVolumePoint[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLog(r: any): AuditEntry {
  return {
    id: String(r.id),
    occurredAt: r.occurred_at,
    sessionId: r.session_id,
    traceId: r.trace_id ?? null,
    userId: r.user_id ?? null,
    actorName: r.actor_name ?? null,
    actorRole: r.actor_role ?? null,
    source: r.source,
    level: r.level,
    action: r.action,
    httpMethod: r.http_method ?? null,
    httpPath: r.http_path ?? null,
    statusCode: r.status_code ?? null,
    durationMs: r.duration_ms ?? null,
    device: r.device ?? null,
    requestBody: r.request_body ?? null,
    errorStack: r.error_stack ?? null,
  }
}

export interface AuditLogFilter {
  from?: string
  to?: string
  level?: LogLevel
  userId?: string
  action?: string
  source?: string
  statusCode?: number
  deviceOs?: string
  deviceBrowser?: string
  q?: string
  page?: number
  limit?: number
}

export interface AuditLogPage {
  data: AuditEntry[]
  meta: { total: number; page: number; limit: number }
}

const SNAKE: Record<string, string> = { userId: 'user_id', statusCode: 'status_code', deviceOs: 'device_os', deviceBrowser: 'device_browser' }

function toQuery(filter: AuditLogFilter): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== '') params.set(SNAKE[k] ?? k, String(v))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function searchLogs(filter: AuditLogFilter = {}): Promise<AuditLogPage> {
  const r = await api.get<{ data: unknown[]; meta: AuditLogPage['meta'] }>(`/audit/logs${toQuery(filter)}`)
  return { data: r.data.map(mapLog), meta: r.meta }
}

export async function getLog(id: string) {
  return mapLog(await api.get<unknown>(`/audit/logs/${id}`))
}

/** ★ Event Chaining — بازسازی زنجیره رویداد اطراف یک لاگ هدف (همان session_id) */
export async function getLogContext(id: string, before = 50, after = 20) {
  const r = await api.get<{ session_id: string; target: unknown; before: unknown[]; after: unknown[] }>(`/audit/logs/${id}/context?before=${before}&after=${after}`)
  return { sessionId: r.session_id, target: mapLog(r.target), before: r.before.map(mapLog), after: r.after.map(mapLog) }
}

export async function getSessionLogs(sessionId: string) {
  return (await api.get<unknown[]>(`/audit/sessions/${sessionId}`)).map(mapLog)
}

export async function getStats(f: { from?: string; to?: string; bucket?: 'hour' | 'day' } = {}): Promise<AuditStats> {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
  const r = await api.get<{ range: AuditStats['range']; total: number; byLevel: AuditStats['byLevel']; topErrors: AuditStats['topErrors']; sources: AuditStats['sources']; volume: { at: string; count: number; error_count: number; warn_count: number }[] }>(
    `/audit/stats${p.toString() ? `?${p}` : ''}`,
  )
  return { ...r, volume: r.volume.map((v) => ({ at: v.at, count: v.count, errorCount: v.error_count, warnCount: v.warn_count })) }
}

/* ---------- بافر لاگ سمت کلاینت — بخش ۱.۲ سند ---------- */

interface ClientLogInput {
  level: LogLevel
  action: string
  httpMethod?: string
  httpPath?: string
  statusCode?: number
  durationMs?: number
  extra?: Record<string, unknown>
}

const FLUSH_INTERVAL_MS = 10_000
const MAX_BUFFER = 200

let buffer: (ClientLogInput & { occurredAt: string; sessionId: string; traceId: string })[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null

function deviceInfo() {
  const ua = navigator.userAgent
  return {
    isPwa: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    userAgent: ua,
  }
}

/** افزودن یک لاگ به بافر — هرگز throw نمی‌کند، مسیر درخواست کاربر را کند نمی‌کند */
export function enqueueClientLog(entry: ClientLogInput) {
  try {
    buffer.push({
      ...entry,
      occurredAt: new Date().toISOString(),
      sessionId: getSessionId(),
      traceId: crypto.randomUUID(),
    })
    if (buffer.length >= MAX_BUFFER) void flushClientLogs()
    ensureFlushTimer()
  } catch {
    // لاگ‌گیری هرگز نباید تجربه کاربر را بشکند
  }
}

function ensureFlushTimer() {
  if (flushTimer) return
  flushTimer = setInterval(() => void flushClientLogs(), FLUSH_INTERVAL_MS)
}

async function flushClientLogs() {
  if (buffer.length === 0) return
  const batch = buffer
  buffer = []
  try {
    await api.post('/audit/client-batch', { logs: batch, device: deviceInfo() })
  } catch {
    // شکست ارسال دسته‌ای نباید کاربر را متوقف کند — دسته را دور می‌ریزیم
    // (مطابق سند: تضمین «حداقل یک‌بار» در این نسخه هدف نیست، فقط عدم-مسدودکنندگی)
  }
}

/** ارسال با navigator.sendBeacon هنگام بستن تب — بدون از دست رفتن لاگ لحظه خروج */
export function flushClientLogsOnUnload() {
  if (buffer.length === 0) return
  const body = JSON.stringify({ logs: buffer, device: deviceInfo() })
  buffer = []
  try {
    navigator.sendBeacon?.('/api/audit/client-batch', body)
  } catch {
    // بی‌خطر نادیده گرفته می‌شود
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushClientLogsOnUnload)
}
