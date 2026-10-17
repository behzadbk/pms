import { Controller, Delete, Get, Headers, HttpCode, Post, Req } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import type { Request } from 'express'
import { Public } from '../auth/decorators/public.decorator'
import { DatabaseService } from '../database/database.service'
import { verifySignature } from './keys'

interface InboxItem {
  receivedAt: string
  connectorId: string | null
  batch: string | null
  signatureValid: boolean | null
  eventCount: number
  entities: Record<string, number>
  body: unknown
}

/**
 * «ERP آزمایشی» برای فضای تست — فقط خارج از production ثبت می‌شود (integration.module).
 * مثل یک ERP واقعی رفتار می‌کند: امضا را بررسی می‌کند، دسته را می‌پذیرد و برای هر رکورد یک
 * شماره سند ساختگی (ERP-TEST-<seq>) برمی‌گرداند تا مسیر کامل رفت‌وبرگشت (sync_state) دیده شود.
 */
@ApiExcludeController()
@Public()
@Controller('sandbox/erp-inbox')
export class SandboxController {
  private items: InboxItem[] = []

  constructor(private readonly db: DatabaseService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-livo-signature') sig?: string,
    @Headers('x-livo-connector') connectorId?: string,
    @Headers('x-livo-tenant') tenantId?: string,
    @Headers('x-livo-batch') batch?: string,
  ) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body)
    let valid: boolean | null = null
    if (connectorId && tenantId && /^[0-9a-f-]{36}$/i.test(connectorId) && /^[0-9a-f-]{36}$/i.test(tenantId)) {
      const secret = await this.db
        .withTenant(tenantId, async (c) => (await c.query<{ secret: string }>(`SELECT secret FROM integration.connectors WHERE id = $1`, [connectorId])).rows[0]?.secret)
        .catch(() => undefined)
      if (secret) valid = verifySignature(secret, sig, raw)
    }
    const events: any[] = Array.isArray((req.body as any)?.events) ? (req.body as any).events : []
    const entities: Record<string, number> = {}
    for (const e of events) entities[e.entity] = (entities[e.entity] ?? 0) + 1
    this.items.unshift({
      receivedAt: new Date().toISOString(),
      connectorId: connectorId ?? null,
      batch: batch ?? null,
      signatureValid: valid,
      eventCount: events.length,
      entities,
      body: req.body,
    })
    this.items = this.items.slice(0, 100)
    if (valid === false) return { accepted: false, error: 'invalid signature' }
    return {
      accepted: true,
      results: events
        .filter((e) => e.entity !== 'test' && e.action !== 'deleted')
        .map((e) => ({ entity: e.entity, id: e.id, status: 'synced', erpRef: `ERP-TEST-${e.seq}` })),
    }
  }

  @Get()
  list() {
    return { total: this.items.length, items: this.items }
  }

  @Delete()
  clear() {
    this.items = []
    return { cleared: true }
  }
}
