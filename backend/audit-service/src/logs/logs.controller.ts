import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { LogIngestService } from './log-ingest.service'
import { LogQueryService } from './log-query.service'
import { LogEntry } from './log-entry.interface'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuidOr = (v: unknown): string => (typeof v === 'string' && UUID_RE.test(v) ? v : randomUUID())

/** مرورگر/سیستم‌عامل از User-Agent (ساده؛ برای فیلتر و آمار دستگاه کافی است) */
function deviceFromUa(ua?: string, isPwa?: boolean) {
  const u = ua ?? ''
  const browser = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : undefined
  const os = /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : undefined
  return { browser, os, is_pwa: !!isPwa }
}

/**
 * زمان رویدادِ کلاینتی را کلاینت می‌فرستد (صف آفلاین)، پس قابل‌اعتماد نیست: خارج از بازه‌ی «۷ روز قبل تا ۵ دقیقه بعد» یا
 * نامعتبر به زمان سرور برمی‌گردد تا نشود با زمان جعلی لاگ را در گذشته/آینده جاسازی کرد یا درج را با تاریخ خراب شکست داد.
 */
function safeOccurredAt(v: unknown): string {
  const t = typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : NaN
  const now = Date.now()
  if (!Number.isFinite(t) || t < now - 7 * 86_400_000 || t > now + 5 * 60_000) return new Date(now).toISOString()
  return new Date(t).toISOString()
}

/** بدنه‌ی لاگ کلاینت حداکثر ~۸ کیلوبایت: ۵۰۰ ورودی × بدنه‌ی بزرگ می‌توانست دیتابیس و حافظه را پر کند */
function capBody(v: unknown): unknown {
  if (v === undefined || v === null) return v
  try {
    const s = JSON.stringify(v)
    return s.length > 8192 ? { truncated: true, preview: s.slice(0, 512) } : v
  } catch {
    return undefined
  }
}

@Controller()
export class LogsController {
  constructor(
    private readonly ingest: LogIngestService,
    private readonly query: LogQueryService,
  ) {}

  /**
   * دریافت دسته‌ای لاگ کلاینت. پاسخ 202 بلافاصله برمی‌گردد و پردازش async ادامه
   * می‌یابد — کلاینت (به‌ویژه با sendBeacon هنگام بستن تب) منتظر درج نمی‌ماند.
   */
  @Post('client-batch')
  @HttpCode(202)
  ingestClientBatch(@Body() body: { logs?: Record<string, any>[]; device?: { isPwa?: boolean; userAgent?: string } }, @CurrentUser() user: JwtPayload) {
    const device = deviceFromUa(body.device?.userAgent, body.device?.isPwa)
    const logs = Array.isArray(body.logs) ? body.logs : []
    const entries: LogEntry[] = logs.slice(0, 500).filter((l) => l && typeof l === 'object').map((l) => ({
      tenant_id: user.tenant_id!,
      // کلاینت camelCase می‌فرستد؛ هر دو شکل پذیرفته می‌شود
      occurred_at: safeOccurredAt(l.occurred_at ?? l.occurredAt),
      session_id: uuidOr(l.session_id ?? l.sessionId),
      trace_id: uuidOr(l.trace_id ?? l.traceId),
      user_id: user.sub,
      actor_role: user.role,
      source: 'client', // منبع همیشه سمت سرور تعیین می‌شود، نه از بدنه درخواست
      level: ['debug', 'info', 'warn', 'error'].includes(l.level) ? l.level : 'info',
      action: String(l.action ?? 'client.event').slice(0, 200),
      http_method: l.http_method ?? l.httpMethod,
      http_path: l.http_path ?? l.httpPath,
      status_code: l.status_code ?? l.statusCode,
      duration_ms: l.duration_ms ?? l.durationMs,
      device,
      request_body: capBody(l.request_body ?? l.extra),
    }))
    this.ingest.enqueue(entries)
    return { accepted: entries.length }
  }

  @Roles('admin', 'super_admin')
  @Get('logs')
  search(@CurrentUser() user: JwtPayload, @Query() q: Record<string, string>) {
    return this.query.search(user.tenant_id!, {
      from: q.from, to: q.to, level: q.level, userId: q.user_id, action: q.action,
      source: q.source, statusCode: q.status_code ? Number(q.status_code) : undefined,
      deviceOs: q.device_os, deviceBrowser: q.device_browser, q: q.q,
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    })
  }

  @Roles('admin', 'super_admin')
  @Get('logs/:id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.query.findOne(user.tenant_id!, id)
  }

  @Roles('admin', 'super_admin')
  @Get('logs/:id/context')
  context(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ) {
    return this.query.getContext(user.tenant_id!, id, before ? Number(before) : 50, after ? Number(after) : 20)
  }

  @Roles('admin', 'super_admin')
  @Get('sessions/:sessionId')
  session(@CurrentUser() user: JwtPayload, @Param('sessionId') sessionId: string) {
    return this.query.getSession(user.tenant_id!, sessionId)
  }

  @Roles('admin', 'super_admin')
  @Get('stats')
  stats(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string, @Query('bucket') bucket?: string) {
    return this.query.getStats(user.tenant_id!, from, to, bucket)
  }
}
