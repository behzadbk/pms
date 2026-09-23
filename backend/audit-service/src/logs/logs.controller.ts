import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { LogIngestService } from './log-ingest.service'
import { LogQueryService } from './log-query.service'
import { LogEntry } from './log-entry.interface'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'

@Controller('audit')
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
  ingestClientBatch(@Body() body: { logs: Omit<LogEntry, 'tenant_id' | 'source'>[] }, @CurrentUser() user: JwtPayload) {
    const entries: LogEntry[] = (body.logs ?? []).slice(0, 500).map((l) => ({
      ...l,
      tenant_id: user.tenant_id!,
      user_id: l.user_id ?? user.sub,
      actor_role: l.actor_role ?? user.role,
      source: 'client', // منبع همیشه سمت سرور تعیین می‌شود، نه از بدنه درخواست
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
  stats(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    return this.query.getStats(user.tenant_id!, from, to)
  }
}
