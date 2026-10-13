import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { promises as dns } from 'dns'
import { PoolClient } from 'pg'
import { DatabaseService } from '../database/database.service'
import { AdapterResult, ConnectorRecord, OutboundEvent } from './adapters/adapter'
import { adapterFor } from './adapters'
import { ENTITY_NAMES, EntityName, getByIds } from './entities'
import { allowInsecureUrls, checkConnectorUrl } from './url-guard'
import { isIP } from 'net'

interface ConnectorRow {
  id: string
  tenant_id: string
  name: string
  type: string
  url: string
  secret: string
  config: Record<string, unknown>
  entities: string[]
  status: string
  cursor_seq: string
  batch_size: number
  failure_count: number
}

export interface DispatchOutcome {
  connectorId: string
  sent: number
  skipped: number
  fromSeq: number
  toSeq: number
  result: AdapterResult | null
}

/**
 * ارسال خودکار تغییرات به ERP (push).
 *
 * هر connector یک cursor روی integration.outbox دارد. در هر دور: رویدادهای بعد از cursor (به ترتیب seq)
 * خوانده می‌شوند، با نسخه‌ی کامل هر رکورد به آداپتر داده می‌شوند و فقط بعد از پذیرش ERP، cursor جلو می‌رود.
 * پس ترتیب حفظ می‌شود و هیچ رویدادی از دست نمی‌رود (at-least-once). در خطا: backoff نمایی تا سقف ۱ ساعت.
 *
 * فرض: یک نمونه از integration-svc (replicas=1). برای چند نمونه، advisory lock هر connector تکرار را می‌گیرد.
 */
@Injectable()
export class DispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(DispatcherService.name)
  private timer?: NodeJS.Timeout
  private running = false
  /** connectorهایی که همین الان در حال ارسال‌اند (جلوگیری از ارسال هم‌زمان دکمه‌ی «ارسال الان» و دور خودکار) */
  private readonly inflight = new Set<string>()

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    const sec = Number(process.env.ERP_DISPATCH_INTERVAL_SEC ?? 15)
    if (!sec || sec <= 0) {
      this.log.log('ارسال خودکار به ERP خاموش است (ERP_DISPATCH_INTERVAL_SEC=0)')
      return
    }
    this.timer = setInterval(() => void this.tick(), sec * 1000)
    setTimeout(() => void this.tick(), 3000)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async tick() {
    if (this.running) return
    this.running = true
    try {
      const tenants = await this.db.withPlatformAccess(
        async (c) => (await c.query<{ id: string }>(`SELECT id FROM identity.tenants WHERE status IS DISTINCT FROM 'suspended'`)).rows,
      )
      for (const t of tenants) {
        const due = await this.db.withTenant(t.id, async (c) =>
          (
            await c.query<{ id: string }>(
              `SELECT id FROM integration.connectors
                WHERE status = 'active' AND (next_attempt_at IS NULL OR next_attempt_at <= now())
                  AND cursor_seq < COALESCE((SELECT max(seq) FROM integration.outbox), 0)`,
            )
          ).rows,
        )
        for (const c of due) {
          // تا وقتی عقب‌مانده دارد و خطا نمی‌دهد، پشت سر هم دسته بفرست (سقف ۲۰ دسته در هر دور)
          for (let i = 0; i < 20; i++) {
            const out = await this.runConnector(t.id, c.id).catch((e) => {
              this.log.error(`connector ${c.id}: ${e?.message ?? e}`)
              return null
            })
            if (!out || !out.result?.ok || out.sent + out.skipped === 0) break
          }
        }
      }
    } catch (e) {
      this.log.error(`dispatcher: ${(e as Error).message}`)
    } finally {
      this.running = false
    }
  }

  /** یک دسته برای یک connector. force=true: بدون توجه به backoff/وضعیت (دکمه‌ی «ارسال الان» در پنل) */
  async runConnector(tenantId: string, connectorId: string, force = false): Promise<DispatchOutcome | null> {
    if (this.inflight.has(connectorId)) return null
    this.inflight.add(connectorId)
    try {
      return await this.runConnectorInner(tenantId, connectorId, force)
    } finally {
      this.inflight.delete(connectorId)
    }
  }

  private async runConnectorInner(tenantId: string, connectorId: string, force: boolean): Promise<DispatchOutcome | null> {
    // مرحله‌ی ۱: قفل، خواندن connector و دسته (تراکنش کوتاه)
    const prepared = await this.db.withTenant(tenantId, async (c) => {
      const locked = (await c.query<{ ok: boolean }>(`SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok`, [connectorId])).rows[0].ok
      if (!locked) return null
      const con = (await c.query<ConnectorRow>(`SELECT * FROM integration.connectors WHERE id = $1`, [connectorId])).rows[0]
      if (!con || (!force && con.status !== 'active')) return null
      const rows = (
        await c.query<{ seq: string; entity: EntityName; entity_id: string; action: OutboundEvent['action']; occurred_at: Date }>(
          `SELECT seq, entity, entity_id, action, occurred_at FROM integration.outbox WHERE seq > $1 ORDER BY seq LIMIT $2`,
          [con.cursor_seq, con.batch_size],
        )
      ).rows
      const wanted = con.entities.includes('*') ? null : new Set(con.entities)
      const picked = rows.filter((r) => !wanted || wanted.has(r.entity))
      const events = await this.withSnapshots(c, picked)
      return { con, rows, events }
    })
    if (!prepared || prepared.rows.length === 0) return null
    const { con, rows, events } = prepared
    const fromSeq = Number(rows[0].seq)
    const toSeq = Number(rows[rows.length - 1].seq)

    // فقط رویدادهای فیلترشده بود → بدون ارسال cursor را جلو ببر
    if (events.length === 0) {
      await this.db.withTenant(tenantId, (c) =>
        c.query(`UPDATE integration.connectors SET cursor_seq = GREATEST(cursor_seq, $2), updated_at = now() WHERE id = $1`, [con.id, toSeq]),
      )
      return { connectorId: con.id, sent: 0, skipped: rows.length, fromSeq, toSeq, result: { ok: true } }
    }

    // مرحله‌ی ۲: ارسال (خارج از تراکنش دیتابیس)
    const started = Date.now()
    const result = await this.send(con, events, `${fromSeq}-${toSeq}`)
    const duration = Date.now() - started

    // مرحله‌ی ۳: ثبت نتیجه
    await this.db.withTenant(tenantId, async (c) => {
      const attempt = con.failure_count + 1
      await c.query(
        `INSERT INTO integration.deliveries (tenant_id, connector_id, from_seq, to_seq, event_count, attempt, success, status_code, error, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [tenantId, con.id, fromSeq, toSeq, events.length, attempt, result.ok, result.statusCode ?? null, result.error ?? null, duration],
      )
      if (result.ok) {
        await c.query(
          `UPDATE integration.connectors
              SET cursor_seq = GREATEST(cursor_seq, $2), failure_count = 0, next_attempt_at = NULL,
                  last_status = $3, last_error = NULL, last_success_at = now(), updated_at = now()
            WHERE id = $1`,
          [con.id, toSeq, `ok ${result.statusCode ?? ''}`.trim()],
        )
        for (const r of result.results ?? []) {
          if (!ENTITY_NAMES.includes(r.entity as EntityName)) continue
          await c.query(
            `INSERT INTO integration.sync_state (tenant_id, entity, entity_id, status, erp_ref, message, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (tenant_id, entity, entity_id) DO UPDATE
               SET status = EXCLUDED.status, erp_ref = COALESCE(EXCLUDED.erp_ref, integration.sync_state.erp_ref),
                   message = EXCLUDED.message, synced_at = now()`,
            [tenantId, r.entity, r.id, r.status, r.erpRef ?? null, r.message ?? null],
          )
        }
      } else {
        const failures = con.failure_count + 1
        const backoffSec = Math.min(3600, 10 * 2 ** Math.min(failures - 1, 9))
        await c.query(
          `UPDATE integration.connectors
              SET failure_count = $2, next_attempt_at = now() + make_interval(secs => $3),
                  last_status = 'failed', last_error = $4, updated_at = now()
            WHERE id = $1`,
          [con.id, failures, backoffSec, (result.error ?? 'error').slice(0, 1000)],
        )
      }
      // گزارش ارسال‌ها محدود بماند
      await c.query(
        `DELETE FROM integration.deliveries WHERE connector_id = $1 AND id NOT IN
           (SELECT id FROM integration.deliveries WHERE connector_id = $1 ORDER BY created_at DESC LIMIT 1000)`,
        [con.id],
      )
    })
    if (!result.ok) this.log.warn(`ارسال به ${con.name} ناموفق: ${result.error}`)
    return { connectorId: con.id, sent: events.length, skipped: rows.length - events.length, fromSeq, toSeq, result }
  }

  async withSnapshots(
    c: PoolClient,
    rows: { seq: string; entity: EntityName; entity_id: string; action: OutboundEvent['action']; occurred_at: Date }[],
  ): Promise<OutboundEvent[]> {
    const byEntity = new Map<EntityName, string[]>()
    for (const r of rows) if (r.action !== 'deleted') byEntity.set(r.entity, [...(byEntity.get(r.entity) ?? []), r.entity_id])
    const snaps = new Map<string, unknown>()
    for (const [entity, ids] of byEntity) {
      for (const [id, v] of await getByIds(c, entity, [...new Set(ids)])) snaps.set(`${entity}:${id}`, v)
    }
    return rows.map((r) => ({
      seq: Number(r.seq),
      entity: r.entity,
      id: r.entity_id,
      action: r.action,
      occurredAt: r.occurred_at.toISOString(),
      data: snaps.get(`${r.entity}:${r.entity_id}`) ?? null,
    }))
  }

  async send(con: ConnectorRow, events: OutboundEvent[], batchId: string): Promise<AdapterResult> {
    const adapter = adapterFor(con.type)
    if (!adapter) return { ok: false, error: `آداپتر «${con.type}» وجود ندارد` }
    const bad = checkConnectorUrl(con.url) ?? (await this.resolvesPrivate(con.url))
    if (bad) return { ok: false, error: bad }
    const record: ConnectorRecord = {
      id: con.id,
      tenantId: con.tenant_id,
      name: con.name,
      type: con.type,
      url: con.url,
      secret: con.secret,
      config: con.config ?? {},
    }
    return adapter.send(record, events, { batchId })
  }

  /** جلوگیری از DNS rebinding: نام دامنه نباید به IP داخلی resolve شود (فقط production) */
  private async resolvesPrivate(raw: string): Promise<string | null> {
    if (allowInsecureUrls()) return null
    const host = new URL(raw).hostname
    if (isIP(host)) return null
    try {
      const addrs = await dns.lookup(host, { all: true })
      for (const a of addrs) {
        if (checkConnectorUrl(`https://${a.family === 6 ? `[${a.address}]` : a.address}/`)) {
          return 'دامنه‌ی مقصد به آدرس شبکه‌ی داخلی اشاره می‌کند'
        }
      }
      return null
    } catch {
      return `دامنه‌ی ${host} پیدا نشد`
    }
  }
}
