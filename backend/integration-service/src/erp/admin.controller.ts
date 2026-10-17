import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { DatabaseService } from '../database/database.service'
import { ADAPTERS, adapterFor } from './adapters'
import { DispatcherService } from './dispatcher.service'
import { BackfillDto, ConnectorDto, CreateKeyDto, ResetCursorDto, UpdateConnectorDto } from './dto'
import { ENTITIES, ENTITY_NAMES, ENTITY_TABLES, EntityName } from './entities'
import { generateKey, randomToken } from './keys'
import { checkConnectorUrl } from './url-guard'

const CONNECTOR_COLS = `id, name, type, url, entities, status, cursor_seq, batch_size, failure_count, next_attempt_at,
  last_status, last_error, last_success_at, config, created_at, updated_at`

function connectorView(r: any, latest: number) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    url: r.url,
    entities: r.entities,
    status: r.status,
    batchSize: r.batch_size,
    cursorSeq: Number(r.cursor_seq),
    pending: Math.max(0, latest - Number(r.cursor_seq)),
    failureCount: r.failure_count,
    nextAttemptAt: r.next_attempt_at,
    lastStatus: r.last_status,
    lastError: r.last_error,
    lastSuccessAt: r.last_success_at,
    config: r.config,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** شرط اضافه‌ی backfill برای موجودیت‌هایی که فقط بخشی از جدول را شامل می‌شوند */
const BACKFILL_WHERE: Partial<Record<EntityName, string>> = {
  party: `role NOT IN ('child','caregiver')`,
  staff: `role IN ('admin','staff','guard','accountant')`,
}

/**
 * مدیریت اتصال ERP از پنل — فقط مدیر ساختمان و حسابدار (JWT).
 * کلیدها، مقصدهای ارسال خودکار، وضعیت صف و خطاهای گزارش‌شده از ERP.
 */
@ApiTags('مدیریت اتصال (پنل)')
@ApiBearerAuth()
@Roles('admin', 'accountant')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly db: DatabaseService,
    private readonly dispatcher: DispatcherService,
  ) {}

  private tenant(u: JwtPayload): string {
    if (!u.tenant_id) throw new BadRequestException('این بخش مخصوص پنل مجتمع است')
    return u.tenant_id
  }

  @Get('overview')
  @ApiOperation({ summary: 'خلاصه‌ی وضعیت اتصال ERP' })
  overview(@CurrentUser() u: JwtPayload) {
    return this.db.withTenant(this.tenant(u), async (c) => {
      const latest = Number((await c.query(`SELECT COALESCE(max(seq), 0) AS s FROM integration.outbox`)).rows[0].s)
      const keys = (
        await c.query(`SELECT count(*) FILTER (WHERE status = 'active') AS active, max(last_used_at) AS last_used FROM integration.api_keys`)
      ).rows[0]
      const connectors = (await c.query(`SELECT ${CONNECTOR_COLS} FROM integration.connectors ORDER BY created_at`)).rows
      const sync = (
        await c.query(`SELECT entity, status, count(*) AS n FROM integration.sync_state GROUP BY entity, status ORDER BY entity, status`)
      ).rows
      const byEntity = (
        await c.query(
          `SELECT entity, count(*) AS n, max(occurred_at) AS last_at FROM integration.outbox
            WHERE occurred_at > now() - interval '30 days' GROUP BY entity ORDER BY entity`,
        )
      ).rows
      return {
        latestSeq: latest,
        activeKeys: Number(keys.active),
        lastPullAt: keys.last_used,
        connectors: connectors.map((r) => connectorView(r, latest)),
        sync: sync.map((r) => ({ entity: r.entity, status: r.status, count: Number(r.n) })),
        changesLast30Days: byEntity.map((r) => ({ entity: r.entity, count: Number(r.n), lastAt: r.last_at })),
        entities: ENTITY_NAMES.map((e) => ({ name: e, title: ENTITIES[e].title, path: `/v1/${ENTITIES[e].path}` })),
        adapters: Object.values(ADAPTERS).map((a) => ({ type: a.type, label: a.label })),
      }
    })
  }

  // ------------------------------------------------------------------ کلیدها

  @Get('keys')
  @ApiOperation({ summary: 'فهرست کلیدهای API' })
  keys(@CurrentUser() u: JwtPayload) {
    return this.db.withTenant(this.tenant(u), async (c) =>
      (
        await c.query(
          `SELECT id, name, key_prefix, scopes, status, expires_at, last_used_at, last_used_ip, created_by_name, created_at, revoked_at
             FROM integration.api_keys ORDER BY status, created_at DESC`,
        )
      ).rows,
    )
  }

  @Post('keys')
  @ApiOperation({ summary: 'ساخت کلید API برای ERP', description: 'کلید کامل فقط همین یک بار در پاسخ (فیلد key) برمی‌گردد.' })
  createKey(@CurrentUser() u: JwtPayload, @Body() dto: CreateKeyDto) {
    const tenantId = this.tenant(u)
    const env = process.env.NODE_ENV === 'production' ? 'live' : 'test'
    const k = generateKey(tenantId, env)
    const scopes = dto.scopes?.length ? [...new Set(dto.scopes)] : ['read', 'sync']
    return this.db.withTenant(tenantId, async (c) => {
      const by = (await c.query<{ full_name: string }>(`SELECT full_name FROM identity.users WHERE id = $1`, [u.sub])).rows[0]?.full_name ?? null
      const row = (
        await c.query(
          `INSERT INTO integration.api_keys (tenant_id, name, key_prefix, key_hash, scopes, expires_at, created_by, created_by_name)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END, $7, $8)
           RETURNING id, name, key_prefix, scopes, status, expires_at, created_at`,
          [tenantId, dto.name.trim(), k.prefix, k.hash, scopes, dto.expiresInDays ?? null, u.sub, by],
        )
      ).rows[0]
      return { ...row, key: k.key, warning: 'این کلید فقط همین یک بار نمایش داده می‌شود؛ آن را در تنظیمات ERP وارد و جای امن نگه دارید.' }
    })
  }

  @Post('keys/:id/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'ابطال کلید API' })
  revokeKey(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(this.tenant(u), async (c) => {
      const r = await c.query(
        `UPDATE integration.api_keys SET status = 'revoked', revoked_at = now() WHERE id = $1 AND status = 'active' RETURNING id`,
        [id],
      )
      if (!r.rowCount) throw new NotFoundException('کلید فعال پیدا نشد')
      return { id, status: 'revoked' }
    })
  }

  // ------------------------------------------------------------------ مقصدهای ارسال خودکار

  @Get('connectors')
  @ApiOperation({ summary: 'فهرست مقصدهای ارسال خودکار به ERP' })
  connectors(@CurrentUser() u: JwtPayload) {
    return this.db.withTenant(this.tenant(u), async (c) => {
      const latest = Number((await c.query(`SELECT COALESCE(max(seq), 0) AS s FROM integration.outbox`)).rows[0].s)
      return (await c.query(`SELECT ${CONNECTOR_COLS} FROM integration.connectors ORDER BY created_at`)).rows.map((r) =>
        connectorView(r, latest),
      )
    })
  }

  @Post('connectors')
  @ApiOperation({ summary: 'افزودن مقصد ارسال خودکار', description: 'secret امضا فقط در پاسخ همین درخواست نمایش داده می‌شود.' })
  createConnector(@CurrentUser() u: JwtPayload, @Body() dto: ConnectorDto) {
    const type = dto.type ?? 'webhook'
    if (!adapterFor(type)) throw new BadRequestException(`نوع اتصال «${type}» پشتیبانی نمی‌شود`)
    const bad = checkConnectorUrl(dto.url)
    if (bad) throw new BadRequestException(bad)
    const secret = `whsec_${randomToken(32)}`
    return this.db.withTenant(this.tenant(u), async (c) => {
      const latest = Number((await c.query(`SELECT COALESCE(max(seq), 0) AS s FROM integration.outbox`)).rows[0].s)
      const row = (
        await c.query(
          `INSERT INTO integration.connectors (tenant_id, name, type, url, secret, config, entities, status, batch_size, cursor_seq, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${CONNECTOR_COLS}`,
          [
            this.tenant(u),
            dto.name.trim(),
            type,
            dto.url.trim(),
            secret,
            JSON.stringify(dto.config ?? {}),
            dto.entities?.length ? dto.entities : ['*'],
            dto.status ?? 'active',
            dto.batchSize ?? 50,
            dto.startFrom === 'beginning' ? 0 : latest,
            u.sub,
          ],
        )
      ).rows[0]
      return { ...connectorView(row, latest), secret }
    })
  }

  @Patch('connectors/:id')
  @ApiOperation({ summary: 'ویرایش مقصد ارسال' })
  updateConnector(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateConnectorDto) {
    if (dto.url) {
      const bad = checkConnectorUrl(dto.url)
      if (bad) throw new BadRequestException(bad)
    }
    const newSecret = dto.rotateSecret ? `whsec_${randomToken(32)}` : null
    return this.db.withTenant(this.tenant(u), async (c) => {
      const row = (
        await c.query(
          `UPDATE integration.connectors SET
              name = COALESCE($2, name), url = COALESCE($3, url), entities = COALESCE($4, entities),
              batch_size = COALESCE($5, batch_size), status = COALESCE($6, status),
              secret = COALESCE($7, secret), config = COALESCE($8, config),
              next_attempt_at = CASE WHEN $6 = 'active' THEN NULL ELSE next_attempt_at END,
              updated_at = now()
            WHERE id = $1 RETURNING ${CONNECTOR_COLS}`,
          [
            id,
            dto.name?.trim() ?? null,
            dto.url?.trim() ?? null,
            dto.entities?.length ? dto.entities : null,
            dto.batchSize ?? null,
            dto.status ?? null,
            newSecret,
            dto.config ? JSON.stringify(dto.config) : null,
          ],
        )
      ).rows[0]
      if (!row) throw new NotFoundException('مقصد پیدا نشد')
      const latest = Number((await c.query(`SELECT COALESCE(max(seq), 0) AS s FROM integration.outbox`)).rows[0].s)
      return { ...connectorView(row, latest), ...(newSecret ? { secret: newSecret } : {}) }
    })
  }

  @Delete('connectors/:id')
  @ApiOperation({ summary: 'حذف مقصد ارسال' })
  deleteConnector(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(this.tenant(u), async (c) => {
      const r = await c.query(`DELETE FROM integration.connectors WHERE id = $1`, [id])
      if (!r.rowCount) throw new NotFoundException('مقصد پیدا نشد')
      return { id, deleted: true }
    })
  }

  @Post('connectors/:id/test')
  @HttpCode(200)
  @ApiOperation({ summary: 'ارسال یک رویداد آزمایشی', description: 'cursor و صف تغییر نمی‌کند؛ فقط اتصال و امضا تست می‌شود.' })
  async testConnector(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    const con = await this.db.withTenant(this.tenant(u), async (c) => (await c.query(`SELECT * FROM integration.connectors WHERE id = $1`, [id])).rows[0])
    if (!con) throw new NotFoundException('مقصد پیدا نشد')
    const started = Date.now()
    const result = await this.dispatcher.send(
      con,
      [{ seq: 0, entity: 'test', id, action: 'created', occurredAt: new Date().toISOString(), data: { message: 'اتصال Livo به ERP برقرار است ✅' } }],
      'test',
    )
    return { ...result, durationMs: Date.now() - started }
  }

  @Post('connectors/:id/run')
  @HttpCode(200)
  @ApiOperation({ summary: 'ارسال الان (بدون صبر برای دور بعدی یا backoff)' })
  async runConnector(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    const out = await this.dispatcher.runConnector(this.tenant(u), id, true)
    return out ?? { sent: 0, message: 'رویداد جدیدی برای ارسال نیست (یا ارسال دیگری در جریان است)' }
  }

  @Post('connectors/:id/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'جابه‌جایی cursor', description: 'beginning = ارسال دوباره‌ی همه، latest = رد کردن عقب‌مانده‌ها، seq = از یک نقطه‌ی مشخص.' })
  resetConnector(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetCursorDto) {
    return this.db.withTenant(this.tenant(u), async (c) => {
      const latest = Number((await c.query(`SELECT COALESCE(max(seq), 0) AS s FROM integration.outbox`)).rows[0].s)
      const to = dto.to === 'beginning' ? 0 : dto.to === 'latest' ? latest : (dto.seq ?? 0)
      const r = await c.query(
        `UPDATE integration.connectors SET cursor_seq = $2, failure_count = 0, next_attempt_at = NULL, updated_at = now()
          WHERE id = $1 RETURNING ${CONNECTOR_COLS}`,
        [id, to],
      )
      if (!r.rowCount) throw new NotFoundException('مقصد پیدا نشد')
      return connectorView(r.rows[0], latest)
    })
  }

  @Get('connectors/:id/deliveries')
  @ApiOperation({ summary: 'گزارش ارسال‌های یک مقصد (جدیدترین اول)' })
  deliveries(@CurrentUser() u: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Query('limit') limit?: string) {
    const n = Math.min(500, Math.max(1, Number(limit) || 50))
    return this.db.withTenant(this.tenant(u), async (c) =>
      (
        await c.query(
          `SELECT id, from_seq, to_seq, event_count, attempt, success, status_code, error, duration_ms, created_at
             FROM integration.deliveries WHERE connector_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [id, n],
        )
      ).rows,
    )
  }

  // ------------------------------------------------------------------ داده‌ی قبلی و خطاها

  @Post('backfill')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ارسال داده‌های موجود به ERP (همگام‌سازی اولیه)',
    description: 'برای همه‌ی رکوردهای فعلی یک رویداد «created» در فید ثبت می‌شود تا ERP و مقصدهای ارسال آن‌ها را هم بگیرند.',
  })
  backfill(@CurrentUser() u: JwtPayload, @Body() dto: BackfillDto) {
    const list = (dto.entities?.length ? dto.entities : ENTITY_NAMES) as EntityName[]
    return this.db.withTenant(this.tenant(u), async (c) => {
      const out: Record<string, number> = {}
      for (const e of list) {
        const extra = BACKFILL_WHERE[e] ? ` WHERE ${BACKFILL_WHERE[e]}` : ''
        const r = await c.query(
          `INSERT INTO integration.outbox (tenant_id, entity, entity_id, action)
           SELECT tenant_id, $1, id, 'created' FROM ${ENTITY_TABLES[e]}${extra}`,
          [e],
        )
        out[e] = r.rowCount ?? 0
      }
      return { queued: out }
    })
  }

  @Get('sync-issues')
  @ApiOperation({ summary: 'مواردی که ERP گزارش داده ثبت نشده‌اند' })
  syncIssues(@CurrentUser() u: JwtPayload) {
    return this.db.withTenant(this.tenant(u), async (c) =>
      (
        await c.query(
          `SELECT entity, entity_id AS id, status, erp_ref, message, synced_at FROM integration.sync_state
            WHERE status = 'failed' ORDER BY synced_at DESC LIMIT 200`,
        )
      ).rows,
    )
  }
}
