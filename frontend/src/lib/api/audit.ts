/**
 * کلاینت audit-svc (پورت ۳۰۰۷) — جستجوی داشبورد لاگ + لاگ‌گیری سمت کلاینت.
 * مطابق docs/UPDATE-V2-AUDIT-FNB-DESIGN.md بخش ۱.۲ و ۳.۱.
 *
 * اصل طراحی: لاگ‌گیری هرگز نباید مسیر درخواست کاربر را کند یا fail کند —
 * enqueueClientLog هرگز throw نمی‌کند و ارسال fire-and-forget (بدون await) است.
 */
import type { AuditLogEntry, AuditVolumePoint, LogLevel } from '../types'
import { api, getSessionId } from './client'

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
  data: AuditLogEntry[]
  meta: { total: number; page: number; limit: number }
}

function toQuery(filter: AuditLogFilter): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function searchLogs(filter: AuditLogFilter = {}) {
  return api.get<AuditLogPage>(`/audit/logs${toQuery(filter)}`)
}

export function getLog(id: string) {
  return api.get<AuditLogEntry>(`/audit/logs/${id}`)
}

/** ★ Event Chaining — بازسازی زنجیره رویداد اطراف یک لاگ هدف (همان session_id) */
export function getLogContext(id: string, before = 50, after = 20) {
  return api.get<{ target: AuditLogEntry; before: AuditLogEntry[]; after: AuditLogEntry[]; sessionId: string }>(
    `/audit/logs/${id}/context?before=${before}&after=${after}`,
  )
}

export function getSessionLogs(sessionId: string) {
  return api.get<AuditLogEntry[]>(`/audit/sessions/${sessionId}`)
}

export function getStats() {
  return api.get<AuditVolumePoint[]>('/audit/stats')
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
