import { sign } from '../keys'
import { AdapterResult, ConnectorRecord, ErpAdapter, OutboundEvent, SyncResult } from './adapter'

const TIMEOUT_MS = 15_000

/**
 * آداپتر عمومی: هر دسته را به‌صورت یک POST با بدنه‌ی JSON و امضای HMAC به URL مقصد می‌فرستد.
 * مناسب هر ERP یا میان‌افزاری که بتواند یک endpoint HTTP داشته باشد.
 *
 * هدرها:
 *   X-Livo-Signature: t=<unix>,v1=<hex(HMAC-SHA256(secret, t + "." + body))>
 *   X-Livo-Batch:     <fromSeq>-<toSeq>   (برای تشخیص دسته‌ی تکراری)
 *   X-Livo-Tenant / X-Livo-Connector
 *
 * پاسخ 2xx یعنی دسته پذیرفته شد. ERP می‌تواند در پاسخ، شماره سندها را هم برگرداند:
 *   { "results": [ { "entity": "charge", "id": "...", "status": "synced", "erpRef": "SF-1234" } ] }
 */
export class WebhookAdapter implements ErpAdapter {
  readonly type = 'webhook'
  readonly label = 'Webhook / REST عمومی (JSON + امضای HMAC)'

  async send(connector: ConnectorRecord, events: OutboundEvent[], meta: { batchId: string }): Promise<AdapterResult> {
    const body = JSON.stringify({
      batchId: meta.batchId,
      connector: { id: connector.id, name: connector.name },
      tenantId: connector.tenantId,
      sentAt: new Date().toISOString(),
      currency: 'IRT',
      events,
    })
    const t = Math.floor(Date.now() / 1000)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(connector.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'Livo-ERP-Connector/1.0',
          'X-Livo-Signature': `t=${t},v1=${sign(connector.secret, t, body)}`,
          'X-Livo-Batch': meta.batchId,
          'X-Livo-Tenant': connector.tenantId,
          'X-Livo-Connector': connector.id,
        },
        body,
        signal: ctrl.signal,
        redirect: 'manual',
      })
      const text = await res.text().catch(() => '')
      if (res.status < 200 || res.status >= 300) {
        return { ok: false, statusCode: res.status, error: `HTTP ${res.status} ${text.slice(0, 300)}`.trim() }
      }
      return { ok: true, statusCode: res.status, results: parseResults(text) }
    } catch (e) {
      const err = e as Error
      return { ok: false, error: err.name === 'AbortError' ? `timeout ${TIMEOUT_MS / 1000}s` : String(err.message || err) }
    } finally {
      clearTimeout(timer)
    }
  }
}

function parseResults(text: string): SyncResult[] | undefined {
  if (!text) return undefined
  try {
    const j = JSON.parse(text)
    const arr = Array.isArray(j?.results) ? j.results : Array.isArray(j?.data?.results) ? j.data.results : null
    if (!arr) return undefined
    return arr
      .filter((r: any) => r && typeof r.entity === 'string' && typeof r.id === 'string' && ['synced', 'failed', 'skipped'].includes(r.status))
      .slice(0, 1000)
      .map((r: any) => ({
        entity: r.entity,
        id: r.id,
        status: r.status,
        erpRef: typeof r.erpRef === 'string' ? r.erpRef.slice(0, 120) : undefined,
        message: typeof r.message === 'string' ? r.message.slice(0, 1000) : undefined,
      }))
  } catch {
    return undefined
  }
}
